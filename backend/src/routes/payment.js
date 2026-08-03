// routes/payment.js — создание запроса на оплату и проверка статуса.
// Поддерживает три способа оплаты: ton (прямой TON-перевод), usdt (jetton на TON),
// stars (Telegram Stars через Bot API). Как только заказ переходит в статус
// "paid" — сразу же (один раз) отправляем пользователю все 4 карточки в чат с ботом.

import { Router } from 'express';
import { getOrder, updateOrder, getOrderVariants, markDeliveredOnce } from '../db.js';
import {
  createPaymentRequest,
  checkPaymentOnChain,
  createUsdtPaymentRequest,
  checkUsdtPaymentOnChain,
  getJettonWalletAddress,
} from '../tonPayments.js';
import { createStarsInvoiceLink } from '../starsPayments.js';
import { sendCardsToUser } from '../botDelivery.js';

const router = Router();

const VALID_METHODS = ['ton', 'usdt', 'stars'];

// Общая функция: если заказ только что стал "paid" — один раз отправляет все
// 4 финальные карточки пользователю через Bot API. Ошибка доставки не должна
// ломать ответ API (оплата уже прошла), поэтому просто логируем её.
async function deliverCardsIfNeeded(order) {
  if (!markDeliveredOnce(order.id)) return; // уже отправляли — выходим
  try {
    const { finalPaths } = getOrderVariants(order);
    await sendCardsToUser(order.telegram_id, finalPaths);
  } catch (err) {
    console.error(`Не удалось отправить карточки боту для заказа ${order.id}:`, err);
  }
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

    if (method === 'ton') {
      const paymentRequest = createPaymentRequest(orderId);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'ton',
        amount_ton: paymentRequest.amountTon,
        receiver_address: paymentRequest.receiverAddress,
      });
      return res.json({ method: 'ton', ...paymentRequest });
    }

    if (method === 'usdt') {
      const paymentRequest = createUsdtPaymentRequest(orderId);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'usdt',
        usdt_amount: paymentRequest.amountUsdt,
        receiver_address: paymentRequest.receiverAddress,
      });
      return res.json({ method: 'usdt', ...paymentRequest });
    }

    if (method === 'stars') {
      const { invoiceLink, starsAmount } = await createStarsInvoiceLink(orderId);
      updateOrder(orderId, {
        status: 'awaiting_payment',
        payment_method: 'stars',
        stars_amount: starsAmount,
      });
      return res.json({ method: 'stars', invoiceLink, starsAmount });
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

// Шаг 2: фронтенд периодически опрашивает этот эндпоинт, пока статус не станет "paid".
// Для ton/usdt проверка идёт по блокчейну, для stars — статус уже выставлен ботом
// (см. routes/internal.js), здесь просто отдаём текущее состояние заказа.
router.get('/payment/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (order.status === 'paid') {
      await deliverCardsIfNeeded(order);
      return res.json({ status: 'paid', txHash: order.tx_hash });
    }

    if (order.status === 'awaiting_payment') {
      if (order.payment_method === 'ton') {
        const txHash = await checkPaymentOnChain(orderId);
        if (txHash) {
          updateOrder(orderId, { status: 'paid', tx_hash: txHash });
          order = getOrder(orderId);
          await deliverCardsIfNeeded(order);
          return res.json({ status: 'paid', txHash });
        }
      } else if (order.payment_method === 'usdt') {
        const txHash = await checkUsdtPaymentOnChain(orderId);
        if (txHash) {
          updateOrder(orderId, { status: 'paid', tx_hash: txHash });
          order = getOrder(orderId);
          await deliverCardsIfNeeded(order);
          return res.json({ status: 'paid', txHash });
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
