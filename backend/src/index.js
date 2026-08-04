// index.js — точка входа бэкенда

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { requireTelegramAuth } from './telegramAuth.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payment.js';
import downloadRoutes from './routes/download.js';
import internalRoutes from './routes/internal.js';
import userRoutes from './routes/user.js';

const app = express();

// ВАЖНО: за прокси Railway (или любым другим reverse proxy) express-rate-limit
// падает с ошибкой "X-Forwarded-For header is set but trust proxy is false",
// поэтому обязательно включаем доверие к прокси.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Общий rate-limit на все API-запросы — простая защита от злоупотреблений
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

// Публичные роуты для отдачи файлов (превью можно смотреть без авторизации,
// финальный файл сам проверяет статус оплаты внутри)
app.use('/api', downloadRoutes);

// Всё, что связано с загрузкой фото и оплатой — требует подписи Telegram initData
app.use('/api', requireTelegramAuth, uploadRoutes);
app.use('/api', requireTelegramAuth, paymentRoutes);
app.use('/api', requireTelegramAuth, userRoutes);

// Server-to-server вызовы от бота (подтверждение оплаты Stars) — своя защита секретом
app.use('/api', internalRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Централизованный обработчик ошибок — ОБЯЗАТЕЛЬНО последним middleware.
// Без него ошибки multer (например "файл слишком большой" или "не изображение"
// из fileFilter в upload.js) улетают наружу как HTML-страница по умолчанию от
// Express, а фронтенд ожидает JSON и падает на res.json().
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err);

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой (максимум 15 МБ)' });
  }

  res.status(err?.status || 500).json({
    error: 'Внутренняя ошибка сервера',
    details: String(err?.message || err),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
});
