// orderLifecycle.js — что происходит, когда заказ становится "paid" —
// общая точка входа для всех трёх способов оплаты (TON/USDT/Stars), чтобы
// не дублировать логику доставки карточек и реферальных начислений в
// routes/payment.js и routes/internal.js по отдельности.
//
// Два разных сценария заказа:
// 1) Обычный (в рамках бесплатного лимита) — карточки уже сгенерированы
//    ДО оплаты (с водяным знаком на превью), оплата просто "открывает"
//    уже готовые файлы и запускает их отправку в чат с ботом.
// 2) generate_after_payment (лимит бесплатных генераций исчерпан) —
//    карточек ЕЩЁ НЕТ на момент оплаты: оплата подтверждается первой, и
//    только ПОСЛЕ этого запускается настоящая генерация (см.
//    runPostPaymentGenerationInBackground). Так деньги на ИИ не тратятся
//    впустую на тех, кто не заплатит.

import {
  getOrderVariants,
  markDeliveredOnce,
  markLifecycleProcessedOnce,
  getUser,
  getOrder,
  updateOrder,
  countPaidOrders,
  incrementReferralDiscount,
} from './db.js';
import { sendCardsToUser } from './botDelivery.js';
import { generateCardVariants } from './photoProcessing.js';
import { tryGenerateProductCopy } from './aiCopywriting.js';

const REFERRAL_BONUS_PERCENT = Number(process.env.REFERRAL_BONUS_PERCENT || '2');
const REFERRAL_MAX_DISCOUNT_PERCENT = Number(process.env.REFERRAL_MAX_DISCOUNT_PERCENT || '10');

/**
 * Вызывать сразу после того, как заказ реально перешёл в статус "paid"
 * (независимо от способа оплаты). GET /payment/status вызывает эту функцию
 * при КАЖДОМ опросе уже оплаченного заказа — markLifecycleProcessedOnce
 * гарантирует, что реферальный бонус и запуск генерации происходят РОВНО
 * ОДИН раз, а не на каждый повторный опрос.
 */
export async function onOrderPaid(order) {
  if (order.generate_after_payment) {
    // Карточек ещё нет — сначала (один раз) начисляем реферальный бонус и
    // запускаем генерацию в фоне. Доставка карточек в бот произойдёт УЖЕ
    // ВНУТРИ фоновой генерации, когда файлы реально появятся — здесь
    // deliverCardsIfNeeded вызывать нельзя: getOrderVariants(order).finalPaths
    // сейчас пустой массив, и вызов преждевременно "сжёг" бы markDeliveredOnce,
    // не отправив ничего по-настоящему.
    if (markLifecycleProcessedOnce(order.id)) {
      await rewardReferrerIfFirstPayment(order);
      runPostPaymentGenerationInBackground(order); // не await — фоново
    }
    return;
  }

  await deliverCardsIfNeeded(order);

  if (markLifecycleProcessedOnce(order.id)) {
    await rewardReferrerIfFirstPayment(order);
  }
}

// Генерация карточек ПОСЛЕ подтверждённой оплаты — используется, когда
// пользователь исчерпал бесплатный лимит. Зеркалит runGenerationInBackground
// из routes/upload.js, но: (1) без водяного знака — уже оплачено; (2) не
// увеличивает free_generations_used — платные генерации не тратят лимит.
async function runPostPaymentGenerationInBackground(order) {
  try {
    const finalVariants = await generateCardVariants(
      order.original_path,
      order.id,
      order.pending_description,
      order.pending_width,
      order.pending_height,
      (percent, step) => updateOrder(order.id, { generation_progress: percent, generation_step: step })
    );

    updateOrder(order.id, { generation_progress: 96, generation_step: 'copywriting' });
    const productCopy = await tryGenerateProductCopy({
      imagePath: order.original_path,
      userDescription: order.pending_description,
    });

    updateOrder(order.id, {
      generation_progress: 100,
      generation_step: 'done',
      final_paths_json: JSON.stringify(finalVariants),
      // Уже оплачено — водяной знак не нужен, watermarked = final (используются
      // одни и те же файлы, чтобы существующий UI скачивания работал без изменений).
      watermarked_paths_json: JSON.stringify(finalVariants),
      product_copy_json: productCopy ? JSON.stringify(productCopy) : null,
    });

    const freshOrder = getOrder(order.id);
    await deliverCardsIfNeeded(freshOrder);
  } catch (err) {
    console.error(`Ошибка генерации после оплаты для заказа ${order.id}:`, err);
    updateOrder(order.id, { generation_step: 'error' });
  }
}

async function deliverCardsIfNeeded(order) {
  if (!markDeliveredOnce(order.id)) return; // уже отправляли — выходим
  try {
    const { finalPaths } = getOrderVariants(order);
    if (finalPaths.length === 0) return; // подстраховка — отправлять пока нечего
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
