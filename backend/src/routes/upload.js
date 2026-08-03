// routes/upload.js — приём фото, (необязательного) текстового описания
// желаемого фона/стиля и размера карточки, заданного пользователем.
// Генерация 3 карточек в реально разных стилях + превью с водяным знаком,
// плюс (опционально) ИИ-текст карточки: название/описание/буллеты по фото.

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { createOrder, updateOrder, upsertUser } from '../db.js';
import { generateCardVariants, applyWatermarkToVariants, normalizeSize } from '../photoProcessing.js';
import { tryGenerateProductCopy } from '../aiCopywriting.js';

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

    // Текстовое описание желаемого фона/стиля — необязательное поле формы.
    const description = typeof req.body.description === 'string' ? req.body.description.slice(0, 500) : '';

    // Размер карточки задаёт сам пользователь — normalizeSize подстрахует
    // от совсем неадекватных значений (см. MIN_SIZE/MAX_SIZE в photoProcessing.js).
    const width = normalizeSize(req.body.width);
    const height = normalizeSize(req.body.height);

    upsertUser({ telegramId: String(telegramUser.id), username: telegramUser.username });

    const orderId = uuidv4();
    createOrder({ id: orderId, telegramId: String(telegramUser.id), originalPath: req.file.path });

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

    res.json({
      orderId,
      previewUrls: watermarkedVariants.map((v, index) => `/api/preview/${orderId}/${index}`),
      styles: watermarkedVariants.map((v) => v.style),
      labels: watermarkedVariants.map((v) => v.label),
      productCopy,
    });
  } catch (err) {
    console.error('Ошибка при обработке фото:', err);
    res.status(500).json({ error: 'Не удалось обработать фото', details: String(err.message || err) });
  }
});

export default router;
