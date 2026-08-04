// starsPayments.js
// Telegram Stars — это встроенная в Telegram валюта. Оплата проходит НЕ через
// блокчейн, а через Bot API: бэкенд создаёт ссылку-инвойс, фронтенд открывает
// её нативным окном Telegram (Telegram.WebApp.openInvoice), а факт успешной
// оплаты Telegram присылает боту как апдейт `successful_payment`.
// Поэтому подтверждение оплаты Stars приходит не сюда напрямую, а через бота
// (см. bot/index.js), который дергает внутренний эндпоинт
// POST /api/internal/mark-paid с секретом INTERNAL_API_SECRET.

import fetch from 'node-fetch';

const BOT_TOKEN = process.env.BOT_TOKEN;
const STARS_AMOUNT = Number(process.env.STARS_PAYMENT_AMOUNT || '50');

/**
 * Создаёт ссылку на инвойс в Stars через Bot API createInvoiceLink.
 * currency = 'XTR' — это специальный код валюты для Telegram Stars,
 * provider_token для Stars должен быть пустой строкой.
 */
export async function createStarsInvoiceLink(orderId, discountPercent = 0) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан в .env бэкенда');

  const pct = Math.min(10, Math.max(0, Number(discountPercent) || 0));
  // Stars — целое число, поэтому скидку округляем, но не даём уйти в 0
  // (минимум 1 Star, чтобы инвойс вообще имел смысл)
  const starsAmount = Math.max(1, Math.round(STARS_AMOUNT * (1 - pct / 100)));

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Карточка товара без водяного знака',
      description: 'Скачивание готовой карточки товара в высоком качестве',
      payload: orderId, // вернётся в successful_payment.invoice_payload
      currency: 'XTR',
      prices: [{ label: 'Карточка товара', amount: starsAmount }],
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram Bot API вернул ошибку: ${data.description || 'неизвестная ошибка'}`);
  }

  return { invoiceLink: data.result, starsAmount, discountPercent: pct };
}
