// routes/upload.js — приём фото запускает генерацию карточек В ФОНЕ и сразу
// отвечает orderId (не дожидаясь готовности) — сама генерация занимает
// заметное время (особенно с 3 отдельными вызовами ИИ), поэтому:
// 1) POST /upload — быстро сохраняет фото, запускает фоновую генерацию,
//    сразу отвечает { orderId }.
// 2) GET /upload/status/:orderId — фронтенд опрашивает этот эндпоинт, чтобы
//    получить РЕАЛЬНЫЙ процент готовности (не имитацию) — см. onProgress
//    в photoProcessing.js, который обновляет generation_progress в БД по
//    факту завершения каждого шага.

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { createOrder, updateOrder, getOrder, upsertUser, getUser, incrementFreeGenerations } from '../db.js';
import { generateCardVariants, applyWatermarkToVariants, normalizeSize } from '../photoProcessing.js';
import { tryGenerateProductCopy } from '../aiCopywriting.js';
import { FREE_GENERATIONS_LIMIT } from './user.js';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // до 15 МБ на фото
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Файл должен быть изображением'));
    }
    cb(null, true);
  },
});

// Сама тяжёлая работа — выполняется ПОСЛЕ того, как ответ на POST /upload
// уже ушёл фронтенду, поэтому её ошибки нужно ловить и записывать в заказ,
// а не прокидывать наружу (отвечать в HTTP-ответ уже некому).
async function runGenerationInBackground(orderId, telegramId, originalPath, description, width, height) {
  try {
    const finalVariants = await generateCardVariants(originalPath, orderId, description, width, height, (percent, step) => {
      updateOrder(orderId, { generation_progress: percent, generation_step: step });
    });

    updateOrder(orderId, { generation_progress: 92, generation_step: 'watermarking' });
    const watermarkedVariants = await applyWatermarkToVariants(finalVariants, orderId);

    updateOrder(orderId, { generation_progress: 96, generation_step: 'copywriting' });
    const productCopy = await tryGenerateProductCopy({ imagePath: originalPath, userDescription: description });

    updateOrder(orderId, {
      status: 'generated',
      generation_progress: 100,
      generation_step: 'done',
      final_paths_json: JSON.stringify(finalVariants),
      watermarked_paths_json: JSON.stringify(watermarkedVariants),
      product_copy_json: productCopy ? JSON.stringify(productCopy) : null,
    });

    incrementFreeGenerations(telegramId);
  } catch (err) {
    console.error(`Ошибка фоновой генерации для заказа ${orderId}:`, err);
    updateOrder(orderId, { status: 'error', generation_step: 'error' });
  }
}

router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    const telegramUser = req.telegramUser;

    const description = typeof req.body.description === 'string' ? req.body.description.slice(0, 500) : '';

    // Фото теперь НЕОБЯЗАТЕЛЬНО — можно сгенерировать карточку целиком по
    // текстовому описанию. Но нужно хоть что-то одно: фото ИЛИ описание.
    if (!req.file && !description.trim()) {
      return res.status(400).json({ error: 'Нужно либо загрузить фото, либо хотя бы описать словами, что нарисовать' });
    }

    const telegramId = String(telegramUser.id);
    upsertUser({ telegramId, username: telegramUser.username });

    // Лимит бесплатных генераций проверяем СРАЗУ, синхронно — чтобы не
    // запускать (и не тратить на ИИ) фоновую генерацию, если лимит исчерпан.
    const user = getUser(telegramId);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    if (freeGenerationsUsed >= FREE_GENERATIONS_LIMIT) {
      return res.status(402).json({
        error: 'Достигнут лимит бесплатных генераций. Оплатите один из предыдущих заказов, чтобы получить ещё генераций.',
        limitReached: true,
        freeGenerationsUsed,
        freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      });
    }

    const width = normalizeSize(req.body.width);
    const height = normalizeSize(req.body.height);
    const originalPath = req.file ? req.file.path : null;

    const orderId = uuidv4();
    createOrder({ id: orderId, telegramId, originalPath });
    updateOrder(orderId, { status: 'generating', generation_progress: 0, generation_step: 'queued' });

    // Отвечаем СРАЗУ — не дожидаясь генерации. Сам процесс продолжается
    // асинхронно в фоне (промис не await'ится специально).
    res.json({ orderId });

    runGenerationInBackground(orderId, telegramId, originalPath, description, width, height);
  } catch (err) {
    console.error('Ошибка при запуске обработки фото:', err);
    res.status(500).json({ error: 'Не удалось обработать фото', details: String(err.message || err) });
  }
});

// Фронтенд опрашивает этот эндпоинт после POST /upload, пока не увидит
// status: 'generated' (или 'error'). progressPercent — честная отметка по
// факту завершённых шагов, не имитация.
router.get('/upload/status/:orderId', (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  if (order.status === 'generated') {
    const finalVariants = order.final_paths_json ? JSON.parse(order.final_paths_json) : [];
    const watermarkedVariants = order.watermarked_paths_json ? JSON.parse(order.watermarked_paths_json) : [];
    return res.json({
      status: 'generated',
      progressPercent: 100,
      previewUrls: watermarkedVariants.map((v, index) => `/api/preview/${order.id}/${index}`),
      styles: finalVariants.map((v) => v.style),
      labels: finalVariants.map((v) => v.label),
      productCopy: order.product_copy_json ? JSON.parse(order.product_copy_json) : null,
    });
  }

  if (order.status === 'error') {
    return res.json({ status: 'error', progressPercent: order.generation_progress || 0 });
  }

  res.json({
    status: order.status, // 'generating'
    progressPercent: order.generation_progress || 0,
    step: order.generation_step || null,
  });
});

export default router;
