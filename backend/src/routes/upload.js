// routes/upload.js — приём фото от пользователя, генерация карточек под разные
// площадки (Wildberries, Ozon, Яндекс Маркет, универсальная) + превью с
// водяным знаком для каждой из них

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { createOrder, updateOrder, upsertUser } from '../db.js';
import { generateCardVariants, applyWatermarkToVariants } from '../photoProcessing.js';

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

    upsertUser({ telegramId: String(telegramUser.id), username: telegramUser.username });

    const orderId = uuidv4();
    createOrder({ id: orderId, telegramId: String(telegramUser.id), originalPath: req.file.path });

    // Генерируем 4 разных по стилю карточки (без вотемарки) — они понадобятся после оплаты
    const finalVariants = await generateCardVariants(req.file.path, orderId);
    // И версии с водяным знаком — именно их видит пользователь на превью
    const watermarkedVariants = await applyWatermarkToVariants(finalVariants, orderId);

    updateOrder(orderId, {
      status: 'generated',
      final_paths_json: JSON.stringify(finalVariants),
      watermarked_paths_json: JSON.stringify(watermarkedVariants),
    });

    res.json({
      orderId,
      // URL превью — по одному на каждую площадку (Wildberries/Ozon/Я.Маркет/универсальная)
      previewUrls: watermarkedVariants.map((v, index) => `/api/preview/${orderId}/${index}`),
      styles: watermarkedVariants.map((v) => v.style),
      labels: watermarkedVariants.map((v) => v.label),
    });
  } catch (err) {
    console.error('Ошибка при обработке фото:', err);
    res.status(500).json({ error: 'Не удалось обработать фото', details: String(err.message || err) });
  }
});

export default router;
