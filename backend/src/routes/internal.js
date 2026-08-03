// routes/internal.js — эндпоинты для server-to-server вызовов от bot-процесса.
// НЕ используют requireTelegramAuth (у бота нет initData), вместо этого
// защищены общим секретом INTERNAL_API_SECRET, который знают только backend и bot.

import { Router } from 'express';
import { getOrder, updateOrder, getOrderVariants, markDeliveredOnce } from '../db.js';
import { sendCardsToUser } from '../botDelivery.js';

const router = Router();

function requireInternalSecret(req, res, next) {
  const secret = req.header('X-Internal-Secret');
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Неверный внутренний секрет' });
  }
  next();
}

// Бот вызывает это сразу после получения апдейта successful_payment (Stars)
router.post('/internal/mark-paid', requireInternalSecret, async (req, res) => {
  const { orderId, telegramPaymentChargeId } = req.body;
  const order = getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  updateOrder(orderId, {
    status: 'paid',
    telegram_payment_charge_id: telegramPaymentChargeId || null,
  });

  // Сразу же (один раз) отправляем все 4 карточки пользователю в чат с ботом
  if (markDeliveredOnce(orderId)) {
    try {
      const paidOrder = getOrder(orderId);
      const { finalPaths } = getOrderVariants(paidOrder);
      await sendCardsToUser(paidOrder.telegram_id, finalPaths);
    } catch (err) {
      console.error(`Не удалось отправить карточки боту для заказа ${orderId}:`, err);
    }
  }

  res.json({ ok: true });
});

export default router;
