// routes/download.js — отдаёт превью (с водяным знаком, всегда доступно) и
// финальные файлы (без вотемарки, только если заказ оплачен) — по 4 штуки
// на заказ, каждая по своему индексу (0-3), плюс zip со всеми сразу.

import { Router } from 'express';
import archiver from 'archiver';
import { getOrder, getOrderVariants } from '../db.js';

const router = Router();

// Превью можно смотреть всегда — оно с водяным знаком, ценности не имеет
router.get('/preview/:orderId/:index', (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  const { watermarkedPaths } = getOrderVariants(order);
  const variant = watermarkedPaths[Number(req.params.index)];
  if (!variant) return res.status(404).json({ error: 'Такого варианта карточки нет' });

  res.sendFile(variant.path, { root: '.' });
});

// Все 4 карточки одним zip-архивом — удобно, когда хочется скачать сразу всё.
// ВАЖНО: этот роут должен быть объявлен ДО '/final/:orderId/:index' — иначе
// Express matчит "all.zip" как значение параметра :index, и до этого роута
// запрос просто никогда не доходит.
router.get('/final/:orderId/all.zip', (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.status !== 'paid') {
    return res.status(402).json({ error: 'Заказ ещё не оплачен' });
  }

  const { finalPaths } = getOrderVariants(order);
  if (!finalPaths.length) return res.status(404).json({ error: 'Файлы карточек не найдены' });

  res.attachment(`cards_${order.id}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  finalPaths.forEach((variant) => {
    archive.file(variant.path, { name: `card_${variant.style}.png` });
  });
  archive.finalize();
});

// Финальный файл без вотемарки — только для оплаченных заказов, по индексу 0-3
router.get('/final/:orderId/:index', (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.status !== 'paid') {
    return res.status(402).json({ error: 'Заказ ещё не оплачен' });
  }

  const { finalPaths } = getOrderVariants(order);
  const variant = finalPaths[Number(req.params.index)];
  if (!variant) return res.status(404).json({ error: 'Такого варианта карточки нет' });

  res.download(variant.path, `card_${order.id}_${variant.style}.png`);
});

export default router;
