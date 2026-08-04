// routes/user.js — отдаёт фронтенду текущий статус пользователя: сколько
// бесплатных генераций осталось до оплаты и накопленную реферальную скидку.

import { Router } from 'express';
import { getUser } from '../db.js';

const router = Router();

export const FREE_GENERATIONS_LIMIT = Number(process.env.FREE_GENERATIONS_LIMIT || '3');

router.get('/user/status', (req, res) => {
  const telegramUser = req.telegramUser;
  const user = getUser(String(telegramUser.id));

  const freeGenerationsUsed = user?.free_generations_used || 0;
  const referralDiscountPercent = user?.referral_discount_percent || 0;

  res.json({
    freeGenerationsUsed,
    freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
    freeGenerationsRemaining: Math.max(0, FREE_GENERATIONS_LIMIT - freeGenerationsUsed),
    referralDiscountPercent,
  });
});

export default router;
