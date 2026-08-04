// routes/upload.js — приём фото, (необязательного) текстового описания
// желаемого фона/стиля и размера карточки, заданного пользователем.
// Генерация 3 карточек в реально разных стилях + превью с водяным знаком,
// плюс (опционально) ИИ-текст карточки: название/описание/буллеты по фото.
//
// Ограничение: FREE_GENERATIONS_LIMIT (по умолчанию 3) бесплатных генераций
// на пользователя — после этого нужно оплатить хотя бы один заказ, чтобы
// счётчик обнулился и снова стало можно генерировать (см. onOrderPaid в
// orderLifecycle.js, где происходит сброс).

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { createOrder, updateOrder, upsertUser, getUser, incrementFreeGenerations } from '../db.js';
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

router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    if (!req.file) {
      return res.status(400).json({ error: 'Фото не передано (поле photo)' });
    }

    const telegramId = String(telegramUser.id);
    upsertUser({ telegramId, username: telegramUser.username });

    // Лимит бесплатных генераций: если исчерпан — не тратим деньги на ИИ,
    // сразу отвечаем ошибкой с понятным кодом, фронтенд покажет объяснение
    // и предложит оплатить один из предыдущих заказов.
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

    // Текстовое описание желаемого фона/стиля — необязательное поле формы.
    const description = typeof req.body.description === 'string' ? req.body.description.slice(0, 500) : '';

    // Размер карточки задаёт сам пользователь.
    const width = normalizeSize(req.body.width);
    const height = normalizeSize(req.body.height);

    const orderId = uuidv4();
    createOrder({ id: orderId, telegramId, originalPath: req.file.path });

    // Генерируем карточки (без вотемарки) — они понадобятся после оплаты
    const finalVariants = await generateCardVariants(req.file.path, orderId, description, width, height);
    // И версии с водяным знаком — именно их видит пользователь на превью
    const watermarkedVariants = await applyWatermarkToVariants(finalVariants, orderId);

    // Необязательный бонус — если не настроен/не удался, просто не покажем блок с текстом
    const productCopy = await tryGenerateProductCopy({ imagePath: req.file.path, userDescription: description });

    updateOrder(orderId, {
      status: 'generated',
      final_paths_json: JSON.stringify(finalVariants),
      watermarked_paths_json: JSON.stringify(watermarkedVariants),
      product_copy_json: productCopy ? JSON.stringify(productCopy) : null,
    });

    // Генерация реально состоялась — засчитываем её в лимит
    incrementFreeGenerations(telegramId);

    res.json({
      orderId,
      previewUrls: watermarkedVariants.map((v, index) => `/api/preview/${orderId}/${index}`),
      styles: watermarkedVariants.map((v) => v.style),
      labels: watermarkedVariants.map((v) => v.label),
      productCopy,
      freeGenerationsUsed: freeGenerationsUsed + 1,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
    });
  } catch (err) {
    console.error('Ошибка при обработке фото:', err);
    res.status(500).json({ error: 'Не удалось обработать фото', details: String(err.message || err) });
  }
});

export default router;
