// photoProcessing.js
// Генерирует НЕСКОЛЬКО (4) разных по стилю карточек товара из одного исходного фото.
//
// Сейчас это ЗАГЛУШКА на базе sharp: кладёт товар на разные градиентные подложки
// с разным оформлением (акцентная плашка, цвета, тень) — выглядит презентабельно
// и работает без внешних сервисов.
//
// Чтобы подключить реальный внешний сервис (удаление фона / ИИ-генерация фона),
// замените вызов внутри generateCardVariants() — заготовки для remove.bg и
// Picsart ниже, включаются через .env: PHOTO_API_PROVIDER=removebg|picsart.

import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';

const GENERATED_DIR = process.env.GENERATED_DIR || './generated';
fs.mkdirSync(GENERATED_DIR, { recursive: true });

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350; // формат 4:5, удобно под соцсети/маркетплейсы

// Описание 4 стилей карточки. Каждый — свой градиент фона, цвет плашки-бейджа
// и подпись на ней. Дальше можно легко добавить 5-й, 6-й вариант и т.д.
const CARD_STYLES = [
  {
    name: 'minimal',
    gradientFrom: '#f5f3ff',
    gradientTo: '#e0e7ff',
    badgeText: null, // без плашки — чистый минималистичный вариант
    badgeColor: '#4f46e5',
  },
  {
    name: 'dark_premium',
    gradientFrom: '#111827',
    gradientTo: '#1f2937',
    badgeText: 'PREMIUM',
    badgeColor: '#d4af37',
    darkBackground: true,
  },
  {
    name: 'bright_sale',
    gradientFrom: '#fb7185',
    gradientTo: '#f97316',
    badgeText: 'SALE',
    badgeColor: '#ffffff',
    badgeTextColor: '#f97316',
  },
  {
    name: 'pastel_new',
    gradientFrom: '#d1fae5',
    gradientTo: '#a7f3d0',
    badgeText: 'NEW',
    badgeColor: '#059669',
  },
];

/**
 * Основная функция: принимает путь к загруженному фото, возвращает массив из
 * 4 путей к сгенерированным карточкам (без водяного знака), по одной на стиль.
 */
export async function generateCardVariants(originalPath, orderId) {
  const productBuffer = await getProductBuffer(originalPath);
  const results = [];

  for (const style of CARD_STYLES) {
    const finalPath = await renderCard(productBuffer, style, orderId);
    results.push({ style: style.name, path: finalPath });
  }

  return results;
}

async function getProductBuffer(originalPath) {
  const provider = process.env.PHOTO_API_PROVIDER || 'stub';

  if (provider === 'removebg') {
    return removeBgViaRemoveBgApi(originalPath);
  }
  if (provider === 'picsart') {
    return removeBgViaPicsartApi(originalPath);
  }
  // ЗАГЛУШКА: просто берём исходное фото как есть, без реального удаления фона.
  return fs.readFileSync(originalPath);
}

async function renderCard(productBuffer, style, orderId) {
  const backgroundSvg = Buffer.from(`
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${style.gradientFrom}"/>
          <stop offset="100%" stop-color="${style.gradientTo}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      ${style.badgeText ? buildBadgeSvg(style) : ''}
    </svg>
  `);

  const background = await sharp(backgroundSvg).png().toBuffer();

  // Уменьшаем товар, чтобы он умещался по центру карточки с отступами
  const productResized = await sharp(productBuffer)
    .resize({
      width: Math.round(CARD_WIDTH * 0.8),
      height: Math.round(CARD_HEIGHT * 0.72),
      fit: 'inside',
    })
    .toBuffer();

  const productMeta = await sharp(productResized).metadata();
  const left = Math.round((CARD_WIDTH - productMeta.width) / 2);
  const top = Math.round((CARD_HEIGHT - productMeta.height) / 2) + 40; // чуть ниже центра, чтобы не биться с плашкой

  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);

  await sharp(background)
    .composite([{ input: productResized, left, top }])
    .png()
    .toFile(finalPath);

  return finalPath;
}

// Плашка-бейдж в углу карточки (PREMIUM / SALE / NEW и т.п.)
function buildBadgeSvg(style) {
  const textColor = style.badgeTextColor || '#ffffff';
  return `
    <g>
      <rect x="40" y="40" width="220" height="64" rx="16" fill="${style.badgeColor}"/>
      <text x="150" y="82" text-anchor="middle" font-family="sans-serif" font-weight="700"
            font-size="28" fill="${textColor}">${style.badgeText}</text>
    </g>
  `;
}

/**
 * Накладывает водяной знак на уже сгенерированные карточки — версии для превью,
 * которые пользователь видит ДО оплаты. Принимает массив {style, path} из
 * generateCardVariants() и возвращает массив {style, path} для watermarked-версий.
 */
export async function applyWatermarkToVariants(variants, orderId) {
  const watermarkSvg = Buffer.from(`
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .wm { fill: rgba(255,255,255,0.55); font-size: 46px; font-family: sans-serif; font-weight: 700; }
      </style>
      ${buildWatermarkTiles()}
    </svg>
  `);

  const results = [];
  for (const variant of variants) {
    const watermarkedPath = path.join(GENERATED_DIR, `${orderId}_${variant.style}_watermarked.png`);
    await sharp(variant.path)
      .composite([{ input: watermarkSvg, top: 0, left: 0 }])
      .png()
      .toFile(watermarkedPath);
    results.push({ style: variant.style, path: watermarkedPath });
  }
  return results;
}

// Генерирует несколько повторов надписи по диагонали карточки
function buildWatermarkTiles() {
  let tiles = '';
  for (let y = 100; y < CARD_HEIGHT; y += 220) {
    for (let x = -100; x < CARD_WIDTH; x += 320) {
      tiles += `<text class="wm" x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})">PREVIEW</text>`;
    }
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Заготовки интеграций с реальными внешними API. Раскомментируйте и впишите
// свой ключ в .env (PHOTO_API_KEY), чтобы включить настоящее удаление фона.
// ---------------------------------------------------------------------------

async function removeBgViaRemoveBgApi(originalPath) {
  // TODO: вставьте свой API-ключ remove.bg в .env как PHOTO_API_KEY
  const apiKey = process.env.PHOTO_API_KEY;
  if (!apiKey) throw new Error('PHOTO_API_KEY не задан для провайдера removebg');

  const form = new (await import('form-data')).default();
  form.append('image_file', fs.createReadStream(originalPath));
  form.append('size', 'auto');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, ...form.getHeaders() },
    body: form,
  });

  if (!response.ok) throw new Error(`remove.bg вернул ошибку: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function removeBgViaPicsartApi(originalPath) {
  // TODO: вставьте свой API-ключ Picsart в .env как PHOTO_API_KEY
  const apiKey = process.env.PHOTO_API_KEY;
  if (!apiKey) throw new Error('PHOTO_API_KEY не задан для провайдера picsart');

  const form = new (await import('form-data')).default();
  form.append('image', fs.createReadStream(originalPath));

  const response = await fetch('https://api.picsart.io/tools/1.0/removebg', {
    method: 'POST',
    headers: { 'X-Picsart-API-Key': apiKey, ...form.getHeaders() },
    body: form,
  });

  if (!response.ok) throw new Error(`Picsart вернул ошибку: ${response.status}`);
  const json = await response.json();
  const imageUrl = json?.data?.url;
  if (!imageUrl) throw new Error('Picsart не вернул ссылку на изображение');

  const imgResponse = await fetch(imageUrl);
  return Buffer.from(await imgResponse.arrayBuffer());
}
