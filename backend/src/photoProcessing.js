// photoProcessing.js
// Генерирует 3 карточки товара из одного исходного фото, каждую — со своим,
// РЕАЛЬНО РАЗНЫМ фоном/настроением (а не одну и ту же картинку, обрезанную
// по-разному). Размер карточки задаёт сам пользователь (ширина/высота).
//
// 1) Вырезание товара с фона — реальный внешний сервис (remove.bg / Picsart),
//    настраивается через .env: PHOTO_API_PROVIDER=removebg|picsart.
//
// 2) Генерация фона под товар — реальный ИИ через OpenAI Images API
//    (модель gpt-image-1, режим /v1/images/edits). Вызывается 3 РАЗА — по
//    разу на каждый из 3 стилевых направлений (STYLE_VARIATIONS), поэтому
//    расход на ИИ теперь примерно в 3 раза выше, чем при одной генерации.
//    Если пользователь что-то написал в описании — это описание используется
//    как есть во всех трёх запросах, а стилевое направление лишь добавляет
//    вариативность настроения/освещения/цвета, не отменяя того, что попросил
//    пользователь.
//
// Без ключей всё работает как раньше — простая заглушка на sharp (исходное
// фото как есть + 3 разных градиентных фона), без единого внешнего API.

import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';

const GENERATED_DIR = process.env.GENERATED_DIR || './generated';
fs.mkdirSync(GENERATED_DIR, { recursive: true });

const MIN_SIZE = 200;
const MAX_SIZE = 2048;
const DEFAULT_SIZE = 1000;

/** Приводит присланный пользователем размер к разумным границам. */
export function normalizeSize(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

// 3 стилевых направления — реально разные фоны/настроение, а не просто
// разный формат кадра. gradientFrom/gradientTo используются только в
// запасном режиме без ИИ (для визуального разнообразия и там тоже).
const STYLE_VARIATIONS = [
  {
    name: 'variant1',
    styleHint: 'clean modern minimalist studio background, soft neutral tones, even lighting',
    gradientFrom: '#f5f3ff',
    gradientTo: '#e0e7ff',
  },
  {
    name: 'variant2',
    styleHint: 'warm golden-hour lighting, cozy lifestyle mood, soft amber and cream tones',
    gradientFrom: '#fff7ed',
    gradientTo: '#fed7aa',
  },
  {
    name: 'variant3',
    styleHint: 'bold vibrant colors, dynamic modern graphic background, high contrast',
    gradientFrom: '#ecfeff',
    gradientTo: '#a5f3fc',
  },
];

// Используется, только если пользователь ничего не написал в описании И для
// этого стилевого направления нет своего styleHint (на практике не бывает —
// styleHint есть всегда, это просто аварийный запасной вариант).
const DEFAULT_BACKGROUND_PROMPT =
  'Professional e-commerce product photography background, clean, elegant, premium look';

// Технические требования — не про стиль фона, поэтому не спорят с описанием
// пользователя, добавляются всегда. Отдельно просим прямой ровный ракурс без
// наклона, чтобы товар не выглядел "перекошенным" на карточке.
const QUALITY_SUFFIX =
  'Photorealistic, no added text, no watermarks, no logos. ' +
  'Photograph the product straight-on and level, centered in the frame, ' +
  'not tilted or rotated, no dramatic diagonal angles.';

// Только для режима openai_full (без точной альфа-маски) — жёсткое условие
// "не трогай товар" обязательно всегда, независимо от того, что написал
// пользователь про фон, иначе есть риск, что модель заодно "улучшит" сам товар.
const PRODUCT_INTEGRITY_INSTRUCTION =
  'Keep the product itself exactly as in the original photo — same shape, colors, ' +
  'proportions, text and logos on the product — do not redesign, restyle or alter ' +
  'the product in any way.';

/**
 * Основная функция: принимает путь к загруженному фото, (необязательное)
 * текстовое описание от пользователя и желаемый размер карточки (ширина,
 * высота в пикселях) — возвращает массив из 3 путей к сгенерированным
 * карточкам (без водяного знака), каждая в своём стиле.
 */
export async function generateCardVariants(originalPath, orderId, userDescription, width, height) {
  const w = normalizeSize(width);
  const h = normalizeSize(height);
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';

  const results = [];

  if (provider === 'openai_full') {
    // Режим "всё в одном": каждый вызов идёт прямо на исходное фото — модель
    // сама и убирает старый фон, и рисует новый. См. предупреждение ниже
    // в tryGenerateAiPhotoFull про отсутствие точной маски.
    const originalBuffer = fs.readFileSync(originalPath);
    for (const style of STYLE_VARIATIONS) {
      const aiPhotoBuffer = await tryGenerateAiPhotoFull(originalBuffer, userDescription, style.styleHint);
      const finalPath = aiPhotoBuffer
        ? await renderCardFromAiPhoto(aiPhotoBuffer, style.name, w, h, orderId)
        : await renderCardWithGradientStub(originalBuffer, style, w, h, orderId);
      results.push({ style: style.name, label: style.name, width: w, height: h, path: finalPath });
    }
  } else {
    // Обычный режим: вырезаем товар ОДИН раз (это не про стиль, это точная
    // маска), а дальше на его основе — 3 разных ИИ-генерации фона.
    const cutoutBuffer = await getProductCutout(originalPath);
    for (const style of STYLE_VARIATIONS) {
      const aiPhotoBuffer = await tryGenerateAiPhoto(cutoutBuffer, userDescription, style.styleHint);
      const finalPath = aiPhotoBuffer
        ? await renderCardFromAiPhoto(aiPhotoBuffer, style.name, w, h, orderId)
        : await renderCardWithGradientStub(cutoutBuffer, style, w, h, orderId);
      results.push({ style: style.name, label: style.name, width: w, height: h, path: finalPath });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Вырезание товара с фона
// ---------------------------------------------------------------------------

async function getProductCutout(originalPath) {
  const provider = process.env.PHOTO_API_PROVIDER || 'stub';

  if (provider === 'removebg') {
    return removeBgViaRemoveBgApi(originalPath);
  }
  if (provider === 'picsart') {
    return removeBgViaPicsartApi(originalPath);
  }
  return fs.readFileSync(originalPath);
}

// ---------------------------------------------------------------------------
// Реальная ИИ-генерация фона (OpenAI Images API, edit endpoint)
// ---------------------------------------------------------------------------

async function tryGenerateAiPhoto(cutoutBuffer, userDescription, styleHint) {
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';
  if (provider !== 'openai') return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  const meta = await sharp(cutoutBuffer).metadata();
  if (!meta.hasAlpha) {
    console.warn(
      'Для ИИ-генерации фона нужен вырезанный товар с прозрачным фоном ' +
        '(PHOTO_API_PROVIDER=removebg|picsart) — сейчас фон не прозрачный, пропускаю ИИ-шаг'
    );
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAi(cutoutBuffer, userDescription, styleHint);
  } catch (err) {
    console.error('Ошибка ИИ-генерации фона (OpenAI), использую запасной вариант с градиентом:', err);
    return null;
  }
}

/**
 * Собирает финальный промпт: описание пользователя (если есть) как есть +
 * стилевое направление этого конкретного варианта + технические требования.
 * Если пользователь ничего не написал — базой становится сам styleHint.
 */
function buildPrompt(userDescription, envOverrideVarName, styleHint, { requireProductIntegrity = false } = {}) {
  const description = (userDescription || '').trim();
  const integrityPart = requireProductIntegrity ? ` ${PRODUCT_INTEGRITY_INSTRUCTION}` : '';
  const envOverride = process.env[envOverrideVarName];

  let corePrompt;
  if (description) {
    corePrompt = `${description}, ${styleHint || DEFAULT_BACKGROUND_PROMPT}`;
  } else {
    corePrompt = `${envOverride ? envOverride + ', ' : ''}${styleHint || DEFAULT_BACKGROUND_PROMPT}`;
  }

  return `${corePrompt}. ${QUALITY_SUFFIX}${integrityPart}`;
}

/** Выбирает размер генерации у OpenAI (фиксированные варианты), ближе всего
 * к соотношению сторон, которое просил пользователь — так меньше приходится
 * докадрировать и композиция страдает меньше. Явный OPENAI_IMAGE_SIZE в .env
 * всегда побеждает, если задан. */
function pickGenerationSize(width, height) {
  const envSize = process.env.OPENAI_IMAGE_SIZE;
  if (envSize) return envSize;

  const ratio = width / height;
  if (ratio > 1.15) return '1536x1024';
  if (ratio < 0.87) return '1024x1536';
  return '1024x1024';
}

async function generateAiPhotoViaOpenAi(cutoutBuffer, userDescription, styleHint) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, 'AI_BACKGROUND_PROMPT', styleHint);
  const size = pickGenerationSize(1024, 1024); // без размера карточки на этом этапе — докадрируем позже

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('model', model);
  form.append('image', cutoutBuffer, { filename: 'product.png', contentType: 'image/png' });
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI images/edits вернул ошибку ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const imgResponse = await fetch(item.url);
    return Buffer.from(await imgResponse.arrayBuffer());
  }
  throw new Error('OpenAI не вернул изображение в ответе');
}

// ---------------------------------------------------------------------------
// Режим "всё в одном" (AI_BACKGROUND_PROVIDER=openai_full)
// ---------------------------------------------------------------------------

async function tryGenerateAiPhotoFull(originalBuffer, userDescription, styleHint) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai_full, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAiFull(originalBuffer, userDescription, styleHint);
  } catch (err) {
    console.error('Ошибка ИИ-генерации (OpenAI, режим openai_full), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateAiPhotoViaOpenAiFull(originalBuffer, userDescription, styleHint) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, 'AI_BACKGROUND_PROMPT_FULL', styleHint, { requireProductIntegrity: true });
  const size = pickGenerationSize(1024, 1024);

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('model', model);
  form.append('image', originalBuffer, { filename: 'product.png', contentType: 'image/png' });
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI images/edits вернул ошибку ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const imgResponse = await fetch(item.url);
    return Buffer.from(await imgResponse.arrayBuffer());
  }
  throw new Error('OpenAI не вернул изображение в ответе');
}

/**
 * Кадрирует уже готовое ИИ-фото под размер, который задал пользователь.
 * position: 'attention' — sharp сам ищет самую "интересную" (контрастную)
 * область при обрезке, обычно это и есть товар.
 */
async function renderCardFromAiPhoto(aiPhotoBuffer, styleName, width, height, orderId) {
  const finalPath = path.join(GENERATED_DIR, `${orderId}_${styleName}_final.png`);

  await sharp(aiPhotoBuffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .png()
    .toFile(finalPath);

  return finalPath;
}

/**
 * Запасной вариант без ИИ: товар на плоском градиентном фоне (свой цвет для
 * каждого из 3 стилей) — работает всегда, даже без единого внешнего API-ключа.
 */
async function renderCardWithGradientStub(productBuffer, style, width, height, orderId) {
  const backgroundSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${style.gradientFrom}"/>
          <stop offset="100%" stop-color="${style.gradientTo}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>
  `);

  const background = await sharp(backgroundSvg).png().toBuffer();

  // Уменьшаем товар, чтобы он умещался по центру карточки с отступами —
  // fit: 'inside' гарантирует пропорциональное (без искажений) уменьшение,
  // а центрирование ниже кладёт его ровно посередине.
  const productResized = await sharp(productBuffer)
    .resize({
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.72),
      fit: 'inside',
    })
    .toBuffer();

  const productMeta = await sharp(productResized).metadata();
  const left = Math.round((width - productMeta.width) / 2);
  const top = Math.round((height - productMeta.height) / 2);

  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);

  await sharp(background)
    .composite([{ input: productResized, left, top }])
    .png()
    .toFile(finalPath);

  return finalPath;
}

/**
 * Накладывает водяной знак на уже сгенерированные карточки — версии для превью.
 */
export async function applyWatermarkToVariants(variants, orderId) {
  const results = [];
  for (const variant of variants) {
    const watermarkSvg = Buffer.from(`
      <svg width="${variant.width}" height="${variant.height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .wm { fill: rgba(255,255,255,0.55); font-size: 84px; font-family: sans-serif; font-weight: 700; }
        </style>
        ${buildWatermarkTiles(variant.width, variant.height)}
      </svg>
    `);

    const watermarkedPath = path.join(GENERATED_DIR, `${orderId}_${variant.style}_watermarked.png`);
    await sharp(variant.path)
      .composite([{ input: watermarkSvg, top: 0, left: 0 }])
      .png()
      .toFile(watermarkedPath);
    results.push({ style: variant.style, label: variant.label, width: variant.width, height: variant.height, path: watermarkedPath });
  }
  return results;
}

// Генерирует несколько повторов надписи по диагонали карточки — шрифт и шаг
// увеличены вдвое по сравнению с прошлой версией (было 42px/200/300).
function buildWatermarkTiles(width, height) {
  let tiles = '';
  for (let y = 160; y < height; y += 340) {
    for (let x = -150; x < width; x += 460) {
      tiles += `<text class="wm" x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})">PREVIEW</text>`;
    }
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Реальные интеграции с сервисами вырезания фона.
// ---------------------------------------------------------------------------

async function removeBgViaRemoveBgApi(originalPath) {
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
