// index.js — простой бот на Telegraf.
// Приветствует пользователя, открывает Mini App, обрабатывает оплату Stars,
// и обрабатывает реферальные ссылки (t.me/<bot>?start=ref_<telegram_id>).
// Вся остальная бизнес-логика (загрузка фото, оплата, скидки) живёт в бэкенде.

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

// Узнаём собственный username один раз при старте — нужен для построения
// реферальных ссылок вида t.me/<username>?start=ref_<telegram_id>.
let botUsername = null;

// Telegram обязательно требует ответить на pre_checkout_query в течение 10 секунд,
// иначе платёж будет автоматически отменён у пользователя.
bot.on('pre_checkout_query', async (ctx) => {
  try {
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

    await ctx.reply('✅ Оплата получена! Карточки без водяного знака придут следующим сообщением.');
  } catch (err) {
    console.error('Ошибка при уведомлении backend об оплате Stars:', err);
    await ctx.reply('Оплата прошла, но возникла техническая ошибка. Напишите в поддержку, если карточка не откроется.');
  }
});

bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);
  const username = ctx.from.username || null;

  // ctx.startPayload — это то, что идёт после "/start " (Telegraf разбирает
  // сам). Реферальная ссылка выглядит как t.me/<bot>?start=ref_<telegram_id>.
  const payload = ctx.startPayload || '';
  const referredBy = payload.startsWith('ref_') ? payload.slice(4) : null;

  if (BACKEND_URL && INTERNAL_API_SECRET) {
    try {
      await fetch(`${BACKEND_URL}/api/internal/register-referral`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': INTERNAL_API_SECRET,
        },
        body: JSON.stringify({ telegramId, username, referredBy }),
      });
    } catch (err) {
      console.error('Не удалось зарегистрировать реферала:', err);
    }
  }

  const referralLink = botUsername ? `https://t.me/${botUsername}?start=ref_${telegramId}` : null;

  const caption =
    '👋 Привет! Это ВитринаAI — бот для генерации красивых карточек товаров с помощью ИИ.\n\n' +
    '1. Открой приложение кнопкой ниже\n' +
    '2. Загрузи фото товара, при желании опиши стиль/фон и укажи размер\n' +
    '3. Получишь 3 карточки в разных стилях — первые несколько генераций бесплатно\n' +
    '4. Оплати любым удобным способом: TON, USDT или Telegram Stars\n' +
    '   (кошелёк нужен только для оплаты TON/USDT — для Stars не требуется)\n' +
    '5. Получи все карточки без водяного знака прямо здесь, в чате' +
    (referralLink
      ? '\n\n💸 Приглашай друзей и получай скидку до 10% на свои покупки:\n' + referralLink
      : '');

  const keyboard = Markup.inlineKeyboard([
    Markup.button.webApp('🚀 Открыть приложение', WEBAPP_URL),
  ]);

  // Иконка приложения уже лежит во фронтенде (frontend/public/icon-v2.png) —
  // отдельно копировать файл в bot/ не нужно, просто берём его по публичному
  // URL самого задеплоенного фронтенда. Если по какой-то причине картинка
  // недоступна (например WEBAPP_URL временно не отвечает) — не молчим, а
  // откатываемся на обычное текстовое сообщение, чтобы /start не сломался.
  try {
    await ctx.replyWithPhoto(`${WEBAPP_URL}/icon-v2.png`, {
      caption,
      ...keyboard,
    });
  } catch (err) {
    console.error('Не удалось отправить иконку приложения, отправляю обычный текст:', err);
    await ctx.reply(caption, keyboard);
  }
});

bot.help((ctx) =>
  ctx.reply('Просто нажми /start и открой приложение через кнопку.')
);

bot.launch().then(async () => {
  console.log('Бот запущен (long polling)');
  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
    console.log(`Юзернейм бота: @${botUsername}`);
  } catch (err) {
    console.error('Не удалось получить username бота (реферальные ссылки не будут показываться):', err);
  }

  // Постоянная кнопка рядом с полем ввода сообщения (Menu Button) — в
  // отличие от inline-кнопки в /start, эта видна ВСЕГДА, в любой момент
  // переписки, даже если пользователь давно не нажимал /start. Текст
  // ограничен Telegram примерно 16 символами, поэтому берём короткий.
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: 'Открыть', web_app: { url: WEBAPP_URL } },
    });
    console.log('Постоянная кнопка "Открыть" в меню чата установлена');
  } catch (err) {
    console.error('Не удалось установить кнопку меню чата:', err);
  }
});

// Аккуратное завершение процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
