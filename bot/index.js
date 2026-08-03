// index.js — простой бот на Telegraf.
// Его единственная задача — приветствовать пользователя и открывать Mini App.
// Вся бизнес-логика (загрузка фото, оплата) живёт во фронтенде + бэкенде.

import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import fetch from 'node-fetch';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const BACKEND_URL = process.env.BACKEND_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан в .env');
}
if (!WEBAPP_URL) {
  throw new Error('WEBAPP_URL не задан в .env — нужен публичный HTTPS-адрес фронтенда');
}

const bot = new Telegraf(BOT_TOKEN);

// Telegram обязательно требует ответить на pre_checkout_query в течение 10 секунд,
// иначе платёж будет автоматически отменён у пользователя.
bot.on('pre_checkout_query', async (ctx) => {
  try {
    // Здесь можно добавить свою проверку (например, что заказ ещё существует
    // и не был оплачен ранее) — payload это наш orderId.
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('Ошибка pre_checkout_query:', err);
    await ctx.answerPreCheckoutQuery(false, 'Внутренняя ошибка, попробуйте ещё раз');
  }
});

// Апдейт приходит В ОБЫЧНОМ сообщении с полем successful_payment, когда
// оплата Stars реально прошла — это единственный надёжный сигнал об оплате.
bot.on('message', async (ctx, next) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return next();

  const orderId = payment.invoice_payload;

  try {
    if (BACKEND_URL && INTERNAL_API_SECRET) {
      const response = await fetch(`${BACKEND_URL}/api/internal/mark-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': INTERNAL_API_SECRET,
        },
        body: JSON.stringify({
          orderId,
          telegramPaymentChargeId: payment.telegram_payment_charge_id,
        }),
      });
      if (!response.ok) {
        console.error('Backend отклонил mark-paid:', await response.text());
      }
    } else {
      console.warn('BACKEND_URL/INTERNAL_API_SECRET не заданы — не могу подтвердить оплату Stars бэкенду');
    }

    await ctx.reply('✅ Оплата получена! Все 4 карточки без водяного знака придут следующим сообщением.');
  } catch (err) {
    console.error('Ошибка при уведомлении backend об оплате Stars:', err);
    await ctx.reply('Оплата прошла, но возникла техническая ошибка. Напишите в поддержку, если карточка не откроется.');
  }
});

bot.start(async (ctx) => {
  await ctx.reply(
    '👋 Привет! Это бот для генерации красивых карточек товаров.\n\n' +
      '1. Открой приложение кнопкой ниже\n' +
      '2. Загрузи фото товара — получишь 4 разных дизайна карточки\n' +
      '3. Оплати любым удобным способом: TON, USDT или Telegram Stars\n' +
      '   (кошелёк нужен только для оплаты TON/USDT — для Stars не требуется)\n' +
      '4. Получи все 4 карточки без водяного знака прямо здесь, в чате',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Открыть приложение', WEBAPP_URL),
    ])
  );
});

bot.help((ctx) =>
  ctx.reply('Просто нажми /start и открой приложение через кнопку.')
);

bot.launch().then(() => {
  console.log('Бот запущен (long polling)');
});

// Аккуратное завершение процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
