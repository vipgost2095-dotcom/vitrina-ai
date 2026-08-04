import React, { useEffect, useRef, useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { beginCell, Address } from '@ton/core';
import {
  createPayment,
  checkPaymentStatus,
  finalDownloadUrl,
  finalDownloadAllUrl,
  finalCopyTextUrl,
  getUsdtJettonWallet,
} from '../api.js';
import { getTelegramWebApp, hapticSuccess, hapticError } from '../telegram.js';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут ждём подтверждение в блокчейне
const GENERATION_POLL_TIMEOUT_MS = 5 * 60 * 1000; // отдельный запас на саму генерацию после оплаты
const VARIANTS_COUNT = 3;

// Тот же маппинг шагов, что в UploadForm.jsx — нужен здесь для отображения
// прогресса генерации, которая в этом сценарии (лимит исчерпан) запускается
// уже ПОСЛЕ оплаты, пока пользователь смотрит на этот самый экран.
const STEP_LABEL_KEYS = {
  queued: 'progressStepQueued',
  prepare: 'progressStepPrepare',
  cutout: 'progressStepCutout',
  variant1: 'progressStepVariant1',
  variant2: 'progressStepVariant2',
  variant3: 'progressStepVariant3',
  watermarking: 'progressStepWatermarking',
  copywriting: 'progressStepCopywriting',
  done: 'progressStepDone',
};

const METHODS = [
  { id: 'ton', label: 'TON' },
  { id: 'usdt', label: 'USDT' },
  { id: 'stars', label: '⭐ Stars' },
];

// Opcode стандартного jetton transfer (TEP-74)
const JETTON_TRANSFER_OP = 0xf8a7ea5;

export default function PaymentScreen({ t, orderId, hasProductCopy, discountPercent, onBack, onPaid }) {
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();

  const [method, setMethod] = useState('ton');
  const [status, setStatus] = useState('idle'); // idle -> sending -> waiting -> paid -> error
  const [error, setError] = useState(null);
  // Для заказов "оплата → генерация" (лимит бесплатных генераций исчерпан):
  // после статуса "paid" карточек ещё может не быть — отслеживаем это отдельно.
  const [generationPending, setGenerationPending] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState(null);
  const [liveHasProductCopy, setLiveHasProductCopy] = useState(hasProductCopy);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(null);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  // Проверяем статус сразу при открытии экрана — если пользователь уже
  // оплатил (например, вернулся из "Истории" на заказ, который всё ещё
  // генерируется после оплаты), не заставляем платить второй раз.
  useEffect(() => {
    let cancelled = false;
    checkPaymentStatus(orderId)
      .then((result) => {
        if (cancelled || result.status !== 'paid') return;
        setStatus('paid');
        if (result.generationPending) {
          setGenerationPending(true);
          setGenerationProgress(result.generationProgress ?? 0);
          setGenerationStep(result.generationStep ?? null);
          pollDeadline.current = Date.now() + GENERATION_POLL_TIMEOUT_MS;
          clearInterval(pollTimer.current);
          pollTimer.current = setInterval(pollStatus, POLL_INTERVAL_MS);
        } else {
          setLiveHasProductCopy(result.hasProductCopy ?? hasProductCopy);
        }
      })
      .catch(() => {}); // тихо игнорируем — просто увидят обычный экран выбора оплаты
    return () => {
      cancelled = true;
    };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setStatus('paid');

        if (result.generationPending) {
          // Оплачено, но карточки ещё генерируются (заказ "оплата → генерация" —
          // лимит бесплатных генераций был исчерпан). Продолжаем опрос, даём
          // генерации отдельный запас времени — она может занять больше, чем
          // обычное ожидание подтверждения в блокчейне.
          if (!generationPending) pollDeadline.current = Date.now() + GENERATION_POLL_TIMEOUT_MS;
          setGenerationPending(true);
          setGenerationProgress(result.generationProgress ?? 0);
          setGenerationStep(result.generationStep ?? null);
          return;
        }

        clearInterval(pollTimer.current);
        hapticSuccess();
        setGenerationPending(false);
        setLiveHasProductCopy(result.hasProductCopy ?? hasProductCopy);
        onPaid?.();
      } else if (Date.now() > pollDeadline.current) {
        clearInterval(pollTimer.current);
        setStatus('error');
        setError(t.timeoutError);
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
        setError(t.starsNotCompleted);
        clearInterval(pollTimer.current);
      }
    });
  }

  async function handlePay() {
    if ((method === 'ton' || method === 'usdt') && !address) {
      setError(t.connectWalletFirst);
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
      setError(err.message || 'Payment failed');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      {status !== 'paid' && status !== 'sending' && status !== 'waiting' && (
        <button
          onClick={onBack}
          className="flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-tg-hint transition hover:text-tg-text"
        >
          {t.previewBack}
        </button>
      )}

      {status === 'paid' && generationPending ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tg-hint">
              {generationStep && STEP_LABEL_KEYS[generationStep] ? t[STEP_LABEL_KEYS[generationStep]] : t.submitLoading}
            </span>
            <span className="text-sm font-bold tabular-nums">{generationProgress}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-tg-hint/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-tg-hint">{t.paidGeneratingNote}</p>
        </div>
      ) : status === 'paid' ? (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-center shadow-xl backdrop-blur">
            <div className="text-3xl">✅</div>
            <h2 className="mt-2 text-lg font-bold tracking-tight">{t.paidTitle}</h2>
            <p className="mt-1 text-sm text-tg-hint">{t.paidSubtitle}</p>
          </div>

          <div className="flex flex-col gap-2">
            {Array.from({ length: VARIANTS_COUNT }, (_, index) => (
              <a
                key={index}
                href={finalDownloadUrl(orderId, index)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium transition hover:bg-white/[0.06]"
              >
                {t.downloadOne(t.variant(index + 1))}
              </a>
            ))}
          </div>

          <a
            href={finalDownloadAllUrl(orderId)}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 text-center font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98]"
          >
            {t.downloadZip}
          </a>

          {liveHasProductCopy && (
            <a
              href={finalCopyTextUrl(orderId)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium transition hover:bg-white/[0.06]"
            >
              {t.downloadText}
            </a>
          )}
        </>
      ) : (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">{t.paymentMethodTitle}</h2>
              {discountPercent > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  -{discountPercent}%
                </span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  disabled={status === 'sending' || status === 'waiting'}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    method === m.id
                      ? 'border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md'
                      : 'border-white/10 text-tg-hint'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {status === 'waiting' && (
            <p className="text-center text-sm text-tg-hint">
              {method === 'stars' ? t.waitingStars : t.waitingTon}
            </p>
          )}
          {error && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-500">{error}</p>}

          <button
            onClick={handlePay}
            disabled={status === 'sending' || status === 'waiting'}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {status === 'sending' && t.sendingPayment}
            {status === 'waiting' && t.checkingPayment}
            {(status === 'idle' || status === 'error') && t.payVia(METHODS.find((m) => m.id === method).label)}
          </button>
        </>
      )}
    </div>
  );
}
