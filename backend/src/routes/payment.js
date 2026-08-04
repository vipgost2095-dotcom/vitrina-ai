// routes/payment.js — создание запроса на оплату и проверка статуса.
// Поддерживает три способа оплаты: ton (прямой TON-перевод), usdt (jetton на TON),
// stars (Telegram Stars через Bot API). Учитывает накопленную реферальную
// скидку пользователя (0-10%, см. db.js/orderLifecycle.js). Как только заказ
// переходит в статус "paid" — см. onOrderPaid() в orderLifecycle.js.

import { Router } from 'express';
import { getOrder, updateOrder, getUser } from '../db.js';
import {
  createPaymentRequest,
  checkPaymentOnChain,
  createUsdtPaymentRequest,
  checkUsdtPaymentOnChain,
  getJettonWalletAddress,
} from '../tonPayments.js';
import { createStarsInvoiceLink } from '../starsPayments.js';
import { onOrderPaid } from '../orderLifecycle.js';

const router = Router();

const VALID_METHODS = ['ton', 'usdt', 'stars'];

function getUserDiscountPercent(telegramId) {
  const user = getUser(telegramId);
  return user?.referral_discount_percent || 0;
}

// Шаг 1: фронтенд запрашивает параметры оплаты для выбранного способа
router.post('/payment/create', async (req, res) => {
  try {
    const { orderId, method } = req.body;
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: `Неизвестный способ оплаты: ${method}` });
    }

    const order = getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const discountPercent = getUserDiscountPercent(order.telegram_id);

    if (method === 'ton') {
      const paymentRequest = createPaymentRequest(orderId, discountPercent);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'ton',
        amount_ton: paymentRequest.amountTon,
        receiver_address: paymentRequest.receiverAddress,
        discount_percent: discountPercent,
      });
      return res.json({ method: 'ton', ...paymentRequest });
    }

    if (method === 'usdt') {
      const paymentRequest = createUsdtPaymentRequest(orderId, discountPercent);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'usdt',
        usdt_amount: paymentRequest.amountUsdt,
        receiver_address: paymentRequest.receiverAddress,
        discount_percent: discountPercent,
      });
      return res.json({ method: 'usdt', ...paymentRequest });
    }

    if (method === 'stars') {
      const { invoiceLink, starsAmount } = await createStarsInvoiceLink(orderId, discountPercent);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'stars',
        stars_amount: starsAmount,
        discount_percent: discountPercent,
      });
      return res.json({ method: 'stars', invoiceLink, starsAmount, discountPercent });
    }
  } catch (err) {
    console.error('Ошибка создания платежа:', err);
    res.status(500).json({ error: 'Не удалось создать платёж', details: String(err.message || err) });
  }
});

// Вспомогательный эндпоинт для USDT: фронтенду нужен адрес jetton-кошелька
// плательщика (свой собственный), чтобы отправить на него transfer-сообщение.
router.post('/payment/usdt-wallet', async (req, res) => {
  try {
    const { ownerAddress } = req.body;
    if (!ownerAddress) return res.status(400).json({ error: 'ownerAddress обязателен' });

    const jettonWalletAddress = await getJettonWalletAddress(ownerAddress);
    res.json({ jettonWalletAddress });
  } catch (err) {
    console.error('Ошибка вычисления jetton-кошелька:', err);
    res.status(500).json({ error: 'Не удалось вычислить jetton-кошелёк', details: String(err.message || err) });
  }
});

// Собирает ответ для статуса "paid" — для обычных заказов ничего, кроме
// txHash, не нужно; для generate_after_payment (лимит был исчерпан) фронтенд
// должен узнать, идёт ли ещё генерация и на каком она проценте.
function buildPaidResponse(order) {
  const generationPending = !!order.generate_after_payment && !order.final_paths_json;
  return {
    status: 'paid',
    txHash: order.tx_hash,
    generationPending,
    generationProgress: order.generation_progress || 0,
    generationStep: order.generation_step || null,
    hasProductCopy: !!order.product_copy_json,
  };
}

// Шаг 2: фронтенд периодически опрашивает этот эндпоинт, пока статус не станет "paid".
// Для ton/usdt проверка идёт по блокчейну (по ТОЙ сумме, что реально была
// показана пользователю — order.amount_ton/usdt_amount, уже с учётом скидки),
// для stars — статус уже выставлен ботом (см. routes/internal.js).
router.get('/payment/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (order.status === 'paid') {
      await onOrderPaid(order);
      order = getOrder(orderId); // перечитываем — onOrderPaid могла начать фоновую генерацию
      return res.json(buildPaidResponse(order));
    }

    if (order.status === 'awaiting_payment') {
      if (order.payment_method === 'ton') {
        const txHash = await checkPaymentOnChain(orderId, order.amount_ton);
        if (txHash) {
          updateOrder(orderId, { status: 'paid', tx_hash: txHash });
          order = getOrder(orderId);
          await onOrderPaid(order);
          order = getOrder(orderId);
          return res.json(buildPaidResponse(order));
        }
      } else if (order.payment_method === 'usdt') {
        const txHash = await checkUsdtPaymentOnChain(orderId, order.usdt_amount);
        if (txHash) {
          updateOrder(orderId, { status: 'paid', tx_hash: txHash });
          order = getOrder(orderId);
          await onOrderPaid(order);
          order = getOrder(orderId);
          return res.json(buildPaidResponse(order));
        }
      }
      // Для 'stars' статус меняет только внутренний эндпоинт (routes/internal.js),
      // сам себя бэкенд не проверяет — подтверждение приходит от Telegram боту.
    }

    res.json({ status: order.status });
  } catch (err) {
    console.error('Ошибка проверки платежа:', err);
    res.status(500).json({ error: 'Не удалось проверить платёж', details: String(err.message || err) });
  }
});

export default router;
