// api.js — все запросы к backend в одном месте.
// В каждый запрос кладём заголовок X-Telegram-Init-Data — backend проверяет
// его подпись, чтобы быть уверенным, что запрос реально пришёл из Mini App.

import { getInitData } from './telegram.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authHeaders() {
  return { 'X-Telegram-Init-Data': getInitData() };
}

// Запускает генерацию — бэкенд сразу отвечает orderId, не дожидаясь готовности
// (сама генерация занимает время, особенно с несколькими вызовами ИИ).
export async function startUpload(file, description, width, height) {
  const formData = new FormData();
  formData.append('photo', file);
  if (description) formData.append('description', description);
  if (width) formData.append('width', width);
  if (height) formData.append('height', height);

  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось загрузить фото');
  }
  return res.json(); // { orderId }
}

// Опрашивается после startUpload — возвращает честный процент готовности
// (progressPercent), а когда status === 'generated' — сразу все данные для превью.
export async function getGenerationStatus(orderId) {
  const res = await fetch(`${BASE_URL}/api/upload/status/${orderId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось проверить статус генерации');
  }
  return res.json(); // { status, progressPercent, step?, previewUrls?, styles?, labels?, productCopy? }
}

// previewUrls, которые вернул /api/upload, уже полные относительные пути —
// эта функция просто добавляет к ним домен бэкенда
export function absoluteUrl(relativeUrl) {
  return `${BASE_URL}${relativeUrl}`;
}

export async function createPayment(orderId, method) {
  const res = await fetch(`${BASE_URL}/api/payment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ orderId, method }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось создать платёж');
  }
  // ton:   { receiverAddress, amountTon, amountNano, comment, network }
  // usdt:  { jettonMasterAddress, receiverAddress, amountUsdt, amountUnits, decimals, comment, network }
  // stars: { invoiceLink, starsAmount }
  return res.json();
}

export async function getUsdtJettonWallet(ownerAddress) {
  const res = await fetch(`${BASE_URL}/api/payment/usdt-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ownerAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось определить jetton-кошелёк');
  }
  return res.json(); // { jettonWalletAddress }
}

export async function checkPaymentStatus(orderId) {
  const res = await fetch(`${BASE_URL}/api/payment/status/${orderId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось проверить оплату');
  }
  return res.json(); // { status, txHash? }
}

// Скачивание одного из 4 финальных вариантов (index от 0 до 3)
export function finalDownloadUrl(orderId, index) {
  return `${BASE_URL}/api/final/${orderId}/${index}`;
}

// Скачивание всех 4 карточек одним zip-архивом
export function finalDownloadAllUrl(orderId) {
  return `${BASE_URL}/api/final/${orderId}/all.zip`;
}

// Скачивание текста карточки (название/описание/буллеты) отдельным .txt
export function finalCopyTextUrl(orderId) {
  return `${BASE_URL}/api/final/${orderId}/copy.txt`;
}

// Статус пользователя: сколько бесплатных генераций осталось, реферальная скидка
export async function getUserStatus() {
  const res = await fetch(`${BASE_URL}/api/user/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось получить статус пользователя');
  }
  return res.json(); // { freeGenerationsUsed, freeGenerationsLimit, freeGenerationsRemaining, referralDiscountPercent }
}
