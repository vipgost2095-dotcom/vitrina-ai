// orderLifecycle.js — что происходит РОВНО ОДИН РАЗ, когда заказ становится
// "paid" — общая точка входа для всех трёх способов оплаты (TON/USDT/Stars),
// чтобы не дублировать логику доставки карточек и реферальных начислений
// в routes/payment.js и routes/internal.js по отдельности.

import { getOrderVariants, markDeliveredOnce, markLifecycleProcessedOnce, getUser, countPaidOrders, incrementReferralDiscount, resetFreeGenerations } from './db.js';
import { sendCardsToUser } from './botDelivery.js';

const REFERRAL_BONUS_PERCENT = Number(process.env.REFERRAL_BONUS_PERCENT || '2');
const REFERRAL_MAX_DISCOUNT_PERCENT = Number(process.env.REFERRAL_MAX_DISCOUNT_PERCENT || '10');

/**
 * Вызывать сразу после того, как заказ реально перешёл в статус "paid"
 * (независимо от способа оплаты). Делает три вещи:
 * 1) Отправляет все финальные карточки пользователю в чат с ботом — само по
 *    себе однократно (см. markDeliveredOnce внутри deliverCardsIfNeeded).
 * 2) Сбрасывает счётчик бесплатных генераций пользователя в 0.
 * 3) Если это ПЕРВАЯ оплата этого пользователя и его когда-то пригласили по
 *    реферальной ссылке — начисляет пригласившему бонусную скидку.
 *
 * Пункты 2 и 3 обёрнуты в markLifecycleProcessedOnce — GET /payment/status
 * вызывает onOrderPaid при КАЖДОМ опросе уже оплаченного заказа, без этой
 * защиты реферальный бонус начислялся бы повторно на каждый опрос.
 */
export async function onOrderPaid(order) {
  await deliverCardsIfNeeded(order);

  if (markLifecycleProcessedOnce(order.id)) {
    resetFreeGenerations(order.telegram_id);
    await rewardReferrerIfFirstPayment(order);
  }
}

async function deliverCardsIfNeeded(order) {
  if (!markDeliveredOnce(order.id)) return; // уже отправляли — выходим
  try {
    const { finalPaths } = getOrderVariants(order);
    await sendCardsToUser(order.telegram_id, finalPaths);
  } catch (err) {
    console.error(`Не удалось отправить карточки боту для заказа ${order.id}:`, err);
  }
}

async function rewardReferrerIfFirstPayment(order) {
  try {
    const paidCount = countPaidOrders(order.telegram_id);
    if (paidCount !== 1) return; // не первая оплата этого пользователя — реферальный бонус уже отработал раньше

    const payer = getUser(order.telegram_id);
    if (!payer?.referred_by) return; // пользователь пришёл не по реферальной ссылке

    incrementReferralDiscount(payer.referred_by, REFERRAL_BONUS_PERCENT, REFERRAL_MAX_DISCOUNT_PERCENT);
  } catch (err) {
    console.error(`Не удалось начислить реферальный бонус за заказ ${order.id}:`, err);
  }
}
