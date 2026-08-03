// tonPayments.js
// 1) createPaymentRequest — формирует данные транзакции, которые фронтенд
//    передаёт в TonConnect (tonConnectUI.sendTransaction).
// 2) checkPaymentOnChain — опрашивает toncenter.com и ищет входящую транзакцию
//    на PAYMENT_RECEIVER_ADDRESS с нужной суммой и комментарием (orderId).

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

/**
 * Формирует объект с данными для оплаты — его frontend напрямую передаст
 * в TonConnect UI (см. PaymentScreen.jsx). Комментарий = orderId, чтобы
 * потом однозначно найти эту транзакцию в истории кошелька.
 */
export function createPaymentRequest(orderId) {
  if (!RECEIVER) throw new Error('PAYMENT_RECEIVER_ADDRESS не задан в .env');

  return {
    // TonConnect ожидает адрес в raw-формате (workchain:hex) в поле
    // messages[].address — переводим из user-friendly формата на всякий
    // случай, чтобы не зависеть от того, насколько лояльно конкретный
    // кошелёк относится к формату адреса.
    receiverAddress: Address.parse(RECEIVER).toRawString(),
    amountTon: AMOUNT_TON,
    amountNano: Math.round(AMOUNT_TON * 1e9).toString(),
    comment: orderId, // будет закодирован во frontend через beginCell().storeUint(0,32).storeStringTail(comment)
    network: NETWORK,
  };
}

/**
 * Проверяет по блокчейну, пришла ли на RECEIVER транзакция с суммой >= AMOUNT_TON
 * и текстовым комментарием, совпадающим с orderId. Возвращает tx hash или null.
 */
export async function checkPaymentOnChain(orderId) {
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

  for (const tx of transactions) {
    const inMsg = tx.in_msg;
    if (!inMsg) continue;

    const comment = (inMsg.message || '').trim();
    const valueNano = Number(inMsg.value || 0);
    const minNano = Math.round(AMOUNT_TON * 1e9 * 0.98); // небольшой допуск на комиссии/округление

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

  // Формат ответа toncenter v2 для типа "cell"/"slice": { object: { bytes: '<base64 boc>' } } либо [type, {bytes}]
  const cellBytesB64 = stackItem[1]?.bytes || stackItem.object?.bytes;
  const resultCell = Cell.fromBoc(Buffer.from(cellBytesB64, 'base64'))[0];
  const jettonWalletAddress = resultCell.beginParse().loadAddress();

  // Возвращаем в raw-формате (workchain:hex) — именно это поле фронтенд
  // подставит напрямую в messages[].address для TonConnect.
  return jettonWalletAddress.toRawString();
}

/**
 * Формирует данные, нужные фронтенду для отправки USDT: адрес jetton-мастера,
 * сумма в минимальных единицах (с учётом decimals) и комментарий-orderId,
 * который будет вложен в forward_payload transfer-сообщения.
 */
export function createUsdtPaymentRequest(orderId) {
  if (!RECEIVER) throw new Error('PAYMENT_RECEIVER_ADDRESS не задан в .env');
  if (!USDT_JETTON_MASTER) throw new Error('USDT_JETTON_MASTER_ADDRESS не задан в .env');

  const amountUnits = Math.round(USDT_AMOUNT * 10 ** USDT_DECIMALS).toString();

  return {
    jettonMasterAddress: USDT_JETTON_MASTER,
    receiverAddress: RECEIVER,
    amountUsdt: USDT_AMOUNT,
    amountUnits,
    decimals: USDT_DECIMALS,
    comment: orderId,
    network: NETWORK,
  };
}

/**
 * Проверяет по блокчейну входящий jetton-перевод USDT на кошелёк администратора.
 * Технически это internal-сообщение с op = 0x7362d09c (transfer_notification,
 * TEP-74), которое администраторский jetton-кошелёк присылает на основной
 * TON-кошелёк админа (RECEIVER). Разбираем тело сообщения вручную.
 *
 * ВАЖНО: перед продакшеном обязательно проверьте разбор на реальных
 * транзакциях в тестовой сети — форматы forward_payload у разных кошельков
 * (Tonkeeper/@wallet/MyTonWallet) могут заворачивать комментарий чуть по-разному.
 */
export async function checkUsdtPaymentOnChain(orderId) {
  const url = new URL(`${TONCENTER_BASE}/getTransactions`);
  url.searchParams.set('address', RECEIVER);
  url.searchParams.set('limit', '30');
  url.searchParams.set('archival', 'false');

  const response = await fetch(url, { headers: toncenterHeaders() });
  if (!response.ok) throw new Error(`toncenter вернул ошибку ${response.status}`);
  const data = await response.json();
  const transactions = data?.result || [];

  const minUnits = BigInt(Math.round(USDT_AMOUNT * 10 ** USDT_DECIMALS * 0.98));

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

      // forward_payload может лежать прямо в слайсе или в отдельной ref-ячейке
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
      // Не удалось разобрать конкретное сообщение — пропускаем, это может быть
      // просто другая транзакция (например, обычный TON-перевод или газ)
      continue;
    }
  }

  return null;
}
