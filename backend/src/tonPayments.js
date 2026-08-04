// tonPayments.js
// 1) createPaymentRequest / createUsdtPaymentRequest — формируют данные
//    транзакции, которые фронтенд передаёт в TonConnect. Учитывают
//    реферальную скидку (0-10%), если она есть у пользователя.
// 2) checkPaymentOnChain / checkUsdtPaymentOnChain — опрашивают toncenter.com
//    и ищут входящую транзакцию с нужной суммой и комментарием (orderId).
//    Ожидаемую сумму передаёт вызывающий код (routes/payment.js) — это ТА
//    сумма, что была реально показана пользователю при создании платежа
//    (с учётом скидки), а не «чистая» цена без скидки из .env.

import fetch from 'node-fetch';
import { Address, beginCell, Cell } from '@ton/core';

const RECEIVER = process.env.PAYMENT_RECEIVER_ADDRESS;
const AMOUNT_TON = Number(process.env.TON_PAYMENT_AMOUNT || '0.5');
const NETWORK = process.env.TON_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
const TONCENTER_BASE = NETWORK === 'testnet'
  ? 'https://testnet.toncenter.com/api/v2'
  : 'https://toncenter.com/api/v2';
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || '';

const USDT_JETTON_MASTER = process.env.USDT_JETTON_MASTER_ADDRESS;
const USDT_DECIMALS = Number(process.env.USDT_DECIMALS || '6');
const USDT_AMOUNT = Number(process.env.USDT_PAYMENT_AMOUNT || '0.5');

function toncenterHeaders() {
  return TONCENTER_API_KEY ? { 'X-API-Key': TONCENTER_API_KEY } : {};
}

function applyDiscount(amount, discountPercent) {
  const pct = Math.min(10, Math.max(0, Number(discountPercent) || 0));
  return amount * (1 - pct / 100);
}

/**
 * Формирует объект с данными для оплаты — его frontend напрямую передаст
 * в TonConnect UI (см. PaymentScreen.jsx). Комментарий = orderId, чтобы
 * потом однозначно найти эту транзакцию в истории кошелька.
 */
export function createPaymentRequest(orderId, discountPercent = 0) {
  if (!RECEIVER) throw new Error('PAYMENT_RECEIVER_ADDRESS не задан в .env');

  const amountTon = applyDiscount(AMOUNT_TON, discountPercent);

  return {
    // Раньше здесь был перевод в raw-формат (workchain:hex) по документации
    // TonConnect — но на практике реальный кошелёк отклонил такую транзакцию
    // с ошибкой "Wrong 'address' format" (проверено на реальном платеже).
    // Возвращаем как есть — обычный user-friendly формат (UQ.../EQ...) из .env,
    // именно его реально ждёт клиентская валидация TonConnect SDK.
    receiverAddress: RECEIVER,
    amountTon,
    amountNano: Math.round(amountTon * 1e9).toString(),
    comment: orderId, // будет закодирован во frontend через beginCell().storeUint(0,32).storeStringTail(comment)
    network: NETWORK,
    discountPercent: Math.min(10, Math.max(0, Number(discountPercent) || 0)),
  };
}

/**
 * Проверяет по блокчейну, пришла ли на RECEIVER транзакция с суммой
 * >= expectedAmountTon и текстовым комментарием, совпадающим с orderId.
 * expectedAmountTon — сумма, которую реально попросили заплатить при
 * создании платежа (уже с учётом скидки, если она была).
 */
export async function checkPaymentOnChain(orderId, expectedAmountTon) {
  const url = new URL(`${TONCENTER_BASE}/getTransactions`);
  url.searchParams.set('address', RECEIVER);
  url.searchParams.set('limit', '30');
  url.searchParams.set('to_lt', '0');
  url.searchParams.set('archival', 'false');

  const headers = {};
  if (TONCENTER_API_KEY) headers['X-API-Key'] = TONCENTER_API_KEY;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`toncenter вернул ошибку ${response.status}`);
  }
  const data = await response.json();
  const transactions = data?.result || [];

  const expected = Number(expectedAmountTon) || AMOUNT_TON;

  for (const tx of transactions) {
    const inMsg = tx.in_msg;
    if (!inMsg) continue;

    const comment = (inMsg.message || '').trim();
    const valueNano = Number(inMsg.value || 0);
    const minNano = Math.round(expected * 1e9 * 0.98); // небольшой допуск на комиссии/округление

    if (comment === orderId && valueNano >= minNano) {
      return tx.transaction_id?.hash || tx.hash || 'unknown_hash';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// USDT (jetton на TON, стандарт TEP-74)
// ---------------------------------------------------------------------------

/**
 * У каждого jetton (в т.ч. USDT) есть отдельный контракт-"кошелёк" на каждого
 * владельца. Чтобы отправить USDT, TonConnect-транзакция идёт не напрямую на
 * адрес получателя, а на jetton-кошелёк ОТПРАВИТЕЛЯ, вызывая на нём метод
 * transfer. Поэтому сначала нужно вычислить адрес этого кошелька через
 * get_wallet_address на jetton-мастер-контракте.
 */
export async function getJettonWalletAddress(ownerAddress) {
  if (!USDT_JETTON_MASTER) throw new Error('USDT_JETTON_MASTER_ADDRESS не задан в .env');

  const ownerSlice = beginCell().storeAddress(Address.parse(ownerAddress)).endCell();
  const bocBase64 = ownerSlice.toBoc().toString('base64');

  const response = await fetch(`${TONCENTER_BASE}/runGetMethod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...toncenterHeaders() },
    body: JSON.stringify({
      address: USDT_JETTON_MASTER,
      method: 'get_wallet_address',
      stack: [['tvm.Slice', bocBase64]],
    }),
  });

  if (!response.ok) throw new Error(`toncenter runGetMethod вернул ошибку ${response.status}`);
  const data = await response.json();

  const stackItem = data?.result?.stack?.[0];
  if (!stackItem) throw new Error('toncenter не вернул адрес jetton-кошелька');

  const cellBytesB64 = stackItem[1]?.bytes || stackItem.object?.bytes;
  const resultCell = Cell.fromBoc(Buffer.from(cellBytesB64, 'base64'))[0];
  const jettonWalletAddress = resultCell.beginParse().loadAddress();

  // Тот же откат, что и для основного адреса выше: TonConnect SDK на практике
  // ждёт user-friendly формат, а не raw workchain:hex.
  return jettonWalletAddress.toString({ bounceable: true });
}

/**
 * Формирует данные, нужные фронтенду для отправки USDT: адрес jetton-мастера,
 * сумма в минимальных единицах (с учётом decimals и скидки) и комментарий-orderId.
 */
export function createUsdtPaymentRequest(orderId, discountPercent = 0) {
  if (!RECEIVER) throw new Error('PAYMENT_RECEIVER_ADDRESS не задан в .env');
  if (!USDT_JETTON_MASTER) throw new Error('USDT_JETTON_MASTER_ADDRESS не задан в .env');

  const amountUsdt = applyDiscount(USDT_AMOUNT, discountPercent);
  const amountUnits = Math.round(amountUsdt * 10 ** USDT_DECIMALS).toString();

  return {
    jettonMasterAddress: USDT_JETTON_MASTER,
    receiverAddress: RECEIVER,
    amountUsdt,
    amountUnits,
    decimals: USDT_DECIMALS,
    comment: orderId,
    network: NETWORK,
    discountPercent: Math.min(10, Math.max(0, Number(discountPercent) || 0)),
  };
}

/**
 * Проверяет по блокчейну входящий jetton-перевод USDT на кошелёк администратора.
 * expectedAmountUsdt — сумма (с учётом скидки), которую реально попросили
 * заплатить при создании платежа.
 *
 * ВАЖНО: перед продакшеном обязательно проверьте разбор на реальных
 * транзакциях в тестовой сети — форматы forward_payload у разных кошельков
 * (Tonkeeper/@wallet/MyTonWallet) могут заворачивать комментарий чуть по-разному.
 */
export async function checkUsdtPaymentOnChain(orderId, expectedAmountUsdt) {
  const url = new URL(`${TONCENTER_BASE}/getTransactions`);
  url.searchParams.set('address', RECEIVER);
  url.searchParams.set('limit', '30');
  url.searchParams.set('archival', 'false');

  const response = await fetch(url, { headers: toncenterHeaders() });
  if (!response.ok) throw new Error(`toncenter вернул ошибку ${response.status}`);
  const data = await response.json();
  const transactions = data?.result || [];

  const expected = Number(expectedAmountUsdt) || USDT_AMOUNT;
  const minUnits = BigInt(Math.round(expected * 10 ** USDT_DECIMALS * 0.98));

  for (const tx of transactions) {
    const inMsg = tx.in_msg;
    const bodyB64 = inMsg?.msg_data?.body;
    if (!bodyB64) continue;

    try {
      const cell = Cell.fromBoc(Buffer.from(bodyB64, 'base64'))[0];
      const slice = cell.beginParse();
      const op = slice.loadUint(32);

      const TRANSFER_NOTIFICATION_OP = 0x7362d09c;
      if (op !== TRANSFER_NOTIFICATION_OP) continue;

      slice.loadUint(64); // query_id — не используем
      const jettonAmount = slice.loadCoins();
      slice.loadAddress(); // адрес отправителя (sender) — можно логировать при желании

      const hasForwardPayload = slice.remainingBits > 0 || slice.remainingRefs > 0;
      let comment = '';
      if (hasForwardPayload) {
        const forwardSlice = slice.remainingRefs > 0 ? slice.loadRef().beginParse() : slice;
        if (forwardSlice.remainingBits >= 32) {
          const prefix = forwardSlice.loadUint(32);
          if (prefix === 0) {
            comment = forwardSlice.loadStringTail().trim();
          }
        }
      }

      if (comment === orderId && jettonAmount >= minUnits) {
        return tx.transaction_id?.hash || tx.hash || 'unknown_hash';
      }
    } catch (err) {
      continue;
    }
  }

  return null;
}
