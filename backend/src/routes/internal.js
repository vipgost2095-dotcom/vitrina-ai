// routes/internal.js — эндпоинты для server-to-server вызовов от bot-процесса.
// НЕ используют requireTelegramAuth (у бота нет initData), вместо этого
// защищены общим секретом INTERNAL_API_SECRET, который знают только backend и bot.

import { Router } from 'express';
import { getOrder, updateOrder, upsertUser, setReferredBy } from '../db.js';
import { onOrderPaid } from '../orderLifecycle.js';

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

  const paidOrder = getOrder(orderId);
  await onOrderPaid(paidOrder); // доставка карточек + реферальный бонус (см. orderLifecycle.js)

  res.json({ ok: true });
});

// Бот вызывает это при /start ?ref_<id> — регистрирует, кто кого пригласил.
// Пользователя может ещё не быть в базе (он не открывал приложение) — создаём
// запись здесь же.
router.post('/internal/register-referral', requireInternalSecret, (req, res) => {
  const { telegramId, username, referredBy } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId обязателен' });

  upsertUser({ telegramId: String(telegramId), username });

  if (referredBy && String(referredBy) !== String(telegramId)) {
    setReferredBy(telegramId, referredBy);
  }

  res.json({ ok: true });
});

export default router;
