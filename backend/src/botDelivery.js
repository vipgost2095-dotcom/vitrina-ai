// botDelivery.js — после подтверждения оплаты бэкенд сам (не бот-процесс)
// отправляет все 4 сгенерированные карточки пользователю прямо в чат с ботом,
// используя Bot API sendMediaGroup. Это работает для любого способа оплаты
// (TON/USDT/Stars), так как вызывается из одного места — сразу после того,
// как заказ помечен статусом "paid".

import fetch from 'node-fetch';
import fs from 'node:fs';
import FormData from 'form-data';

const BOT_TOKEN = process.env.BOT_TOKEN;

/**
 * Отправляет 4 финальные карточки (без водяного знака) в личный чат с
 * пользователем. telegramId — это же chat_id для приватного чата один-на-один
 * с ботом (пользователь обязательно должен был хоть раз написать боту /start,
 * иначе Telegram вернёт ошибку "chat not found").
 */
export async function sendCardsToUser(telegramId, finalPaths) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан в .env бэкенда');
  if (!finalPaths?.length) throw new Error('Нет готовых файлов карточек для отправки');

  const form = new FormData();
  form.append('chat_id', String(telegramId));

  // У sendMediaGroup нет отдельного поля "общая подпись" — подпись вешаем на
  // первый элемент группы, Telegram отображает её под всей группой целиком.
  const media = finalPaths.map((variant, index) => ({
    type: 'photo',
    media: `attach://photo${index}`,
    ...(index === 0
      ? { caption: '🎉 Оплата подтверждена! Вот карточки вашего товара под Wildberries, Ozon и другие площадки.' }
      : {}),
  }));

  form.append('media', JSON.stringify(media));
  finalPaths.forEach((variant, index) => {
    form.append(`photo${index}`, fs.createReadStream(variant.path), `card_${variant.style}.png`);
  });

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram sendMediaGroup вернул ошибку: ${data.description || 'неизвестная ошибка'}`);
  }

  return data.result;
}
