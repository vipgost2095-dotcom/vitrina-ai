// orderLifecycle.js — что происходит РОВНО ОДИН РАЗ, когда заказ становится
// "paid" — общая точка входа для всех трёх способов оплаты (TON/USDT/Stars),
// чтобы не дублировать логику доставки карточек и реферальных начислений
// в routes/payment.js и routes/internal.js по отдельности.

import { getOrderVariants, markDeliveredOnce, getUser, countPaidOrders, incrementReferralDiscount } from './db.js';
import { sendCardsToUser } from './botDelivery.js';

const REFERRAL_BONUS_PERCENT = Number(process.env.REFERRAL_BONUS_PERCENT || '2');
const REFERRAL_MAX_DISCOUNT_PERCENT = Number(process.env.REFERRAL_MAX_DISCOUNT_PERCENT || '10');

/**
 * Вызывать сразу после того, как заказ реально перешёл в статус "paid"
 * (независимо от способа оплаты). Делает две вещи, каждая — максимум один
 * раз на заказ/на пользователя:
 * 1) Отправляет все финальные карточки пользователю в чат с ботом.
 * 2) Если это ПЕРВАЯ оплата этого пользователя и его когда-то пригласили по
 *    реферальной ссылке — начисляет пригласившему бонусную скидку (не больше
 *    REFERRAL_MAX_DISCOUNT_PERCENT суммарно).
 */
export async function onOrderPaid(order) {
  await deliverCardsIfNeeded(order);
  await rewardReferrerIfFirstPayment(order);
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
