// routes/history.js — история генераций пользователя. Нужна, чтобы человек
// мог закрыть приложение (или просто уйти со шага оплаты) и позже вернуться
// и оплатить одну из СВОИХ прошлых генераций — без этого orderId жил только
// в памяти фронтенда (React state) и терялся при перезаходе.

import { Router } from 'express';
import { getOrdersByUser } from '../db.js';

const router = Router();

router.get('/history', (req, res) => {
  const telegramUser = req.telegramUser;
  const orders = getOrdersByUser(telegramUser.id, 20);

  const items = orders.map((order) => {
    const watermarked = order.watermarked_paths_json ? JSON.parse(order.watermarked_paths_json) : [];
    return {
      orderId: order.id,
      status: order.status, // 'generated' | 'awaiting_payment' | 'paid'
      createdAt: order.created_at,
      previewUrl: watermarked[0] ? `/api/preview/${order.id}/0` : null,
      hasProductCopy: !!order.product_copy_json,
    };
  });

  res.json({ items });
});

export default router;
