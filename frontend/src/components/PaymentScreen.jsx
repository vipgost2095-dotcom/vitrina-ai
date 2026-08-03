import React, { useEffect, useRef, useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { beginCell, Address } from '@ton/core';
import {
  createPayment,
  checkPaymentStatus,
  finalDownloadUrl,
  finalDownloadAllUrl,
  getUsdtJettonWallet,
} from '../api.js';
import { getTelegramWebApp, hapticSuccess, hapticError } from '../telegram.js';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут ждём подтверждение в блокчейне

const METHODS = [
  { id: 'ton', label: 'TON' },
  { id: 'usdt', label: 'USDT' },
  { id: 'stars', label: '⭐ Stars' },
];

// Opcode стандартного jetton transfer (TEP-74)
const JETTON_TRANSFER_OP = 0xf8a7ea5;

export default function PaymentScreen({ orderId, styles }) {
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();

  const [method, setMethod] = useState('ton');
  const [status, setStatus] = useState('idle'); // idle -> sending -> waiting -> paid -> error
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(null);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  function startPolling() {
    setStatus('waiting');
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    clearInterval(pollTimer.current);
    pollTimer.current = setInterval(pollStatus, POLL_INTERVAL_MS);
  }

  async function pollStatus() {
    try {
      const result = await checkPaymentStatus(orderId);
      if (result.status === 'paid') {
        clearInterval(pollTimer.current);
        hapticSuccess();
        setStatus('paid');
      } else if (Date.now() > pollDeadline.current) {
        clearInterval(pollTimer.current);
        setStatus('error');
        setError('Не удалось подтвердить оплату за отведённое время. Попробуйте ещё раз.');
      }
    } catch (err) {
      // Разовая ошибка сети не должна прерывать поллинг — попробуем на следующем тике
      console.warn('Ошибка при проверке статуса оплаты:', err);
    }
  }

  async function handlePayTon() {
    const payment = await createPayment(orderId, 'ton');

    // Кодируем текстовый комментарий (orderId) в стандартный формат TON-переводов:
    // 32-битный ноль (op-code "простой перевод") + UTF-8 текст комментария.
    const commentCell = beginCell().storeUint(0, 32).storeStringTail(payment.comment).endCell();

    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: payment.receiverAddress,
          amount: payment.amountNano,
          payload: commentCell.toBoc().toString('base64'),
        },
      ],
    });
  }

  async function handlePayUsdt() {
    const payment = await createPayment(orderId, 'usdt');

    // USDT — это jetton, поэтому транзакция идёт не на кошелёк получателя
    // напрямую, а на СОБСТВЕННЫЙ jetton-кошелёк плательщика, с вызовом
    // метода transfer, где destination = адрес получателя.
    const { jettonWalletAddress } = await getUsdtJettonWallet(address);

    const forwardComment = beginCell().storeUint(0, 32).storeStringTail(payment.comment).endCell();

    const transferBody = beginCell()
      .storeUint(JETTON_TRANSFER_OP, 32)
      .storeUint(0, 64) // query_id
      .storeCoins(BigInt(payment.amountUnits)) // сумма в минимальных единицах USDT
      .storeAddress(Address.parse(payment.receiverAddress)) // destination
      .storeAddress(Address.parse(address)) // response_destination (сдача газа обратно плательщику)
      .storeBit(false) // custom_payload отсутствует
      // forward_ton_amount — сколько TON пересылается ВМЕСТЕ с уведомлением
      // (transfer_notification) владельцу jetton-кошелька-получателя. Если
      // поставить здесь околонулевое значение, у пересылаемого сообщения не
      // хватит газа и уведомление до администратора просто не дойдёт — а
      // именно по нему бэкенд определяет, что оплата USDT прошла. 0.02 TON —
      // с запасом хватает на пересылку и не съедает заметную часть суммы.
      .storeCoins(20000000n)
      .storeBit(true) // forward_payload лежит в ref-ячейке
      .storeRef(forwardComment)
      .endCell();

    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: jettonWalletAddress,
          amount: '150000000', // ~0.15 TON на газ выполнения transfer + уведомления
          payload: transferBody.toBoc().toString('base64'),
        },
      ],
    });
  }

  async function handlePayStars() {
    const payment = await createPayment(orderId, 'stars');
    const tg = getTelegramWebApp();

    if (!tg?.openInvoice) {
      throw new Error('Оплата Stars доступна только внутри Telegram');
    }

    // openInvoice открывает нативный экран оплаты Telegram и вызывает callback
    // со статусом ('paid' | 'cancelled' | 'failed' | 'pending'). Настоящее
    // подтверждение всё равно приходит боту отдельным апдейтом, поэтому даже
    // после статуса 'paid' здесь мы просто продолжаем обычный поллинг.
    tg.openInvoice(payment.invoiceLink, (invoiceStatus) => {
      if (invoiceStatus === 'cancelled' || invoiceStatus === 'failed') {
        setStatus('error');
        setError('Оплата Stars не была завершена');
        clearInterval(pollTimer.current);
      }
    });
  }

  async function handlePay() {
    if ((method === 'ton' || method === 'usdt') && !address) {
      setError('Сначала подключите TON-кошелёк');
      return;
    }

    setStatus('sending');
    setError(null);

    try {
      if (method === 'ton') await handlePayTon();
      else if (method === 'usdt') await handlePayUsdt();
      else if (method === 'stars') await handlePayStars();

      startPolling();
    } catch (err) {
      hapticError();
      setStatus('error');
      setError(err.message || 'Оплата не прошла или была отменена');
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      {status === 'paid' ? (
        <>
          <h2 className="text-lg font-semibold">✅ Оплата подтверждена</h2>
          <p className="text-sm text-tg-hint text-center">
            Все 4 карточки уже отправлены вам в чат с ботом. Также можно скачать их здесь:
          </p>

          <div className="flex w-full max-w-sm flex-col gap-2">
            {(styles?.length ? styles : [0, 1, 2, 3]).map((style, index) => (
              <a
                key={index}
                href={finalDownloadUrl(orderId, index)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-medium text-tg-text"
              >
                Скачать вариант {index + 1}
              </a>
            ))}
          </div>

          <a
            href={finalDownloadAllUrl(orderId)}
            className="w-full max-w-sm rounded-2xl bg-tg-button px-4 py-3 text-center font-medium text-tg-buttonText"
          >
            Скачать все 4 карточки (zip)
          </a>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Способ оплаты</h2>

          <div className="flex w-full max-w-sm gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                disabled={status === 'sending' || status === 'waiting'}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  method === m.id
                    ? 'border-tg-button bg-tg-button text-tg-buttonText'
                    : 'border-gray-300 text-tg-text'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {status === 'waiting' && (
            <p className="text-sm text-tg-hint">
              {method === 'stars'
                ? 'Ждём подтверждение оплаты от Telegram…'
                : 'Ждём подтверждение транзакции в блокчейне TON…'}
            </p>
          )}
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            onClick={handlePay}
            disabled={status === 'sending' || status === 'waiting'}
            className="w-full max-w-sm rounded-2xl bg-tg-button px-4 py-3 font-medium text-tg-buttonText disabled:opacity-50"
          >
            {status === 'sending' && 'Открываем оплату…'}
            {status === 'waiting' && 'Проверяем оплату…'}
            {(status === 'idle' || status === 'error') &&
              `Оплатить через ${METHODS.find((m) => m.id === method).label}`}
          </button>
        </>
      )}
    </div>
  );
}
