// photoProcessing.js
// Генерирует карточки товара из одного исходного фото, с фоном по описанию,
// которое вводит сам пользователь (например "премиум чёрный фон с золотыми
// акцентами" или "пастельный минимализм"). Два независимых этапа:
//
// 1) Вырезание товара с фона — реальный внешний сервис (remove.bg / Picsart),
//    настраивается через .env: PHOTO_API_PROVIDER=removebg|picsart.
//    Возвращает PNG с прозрачным фоном (альфа-канал).
//
// 2) Генерация нового фона под товар — реальный ИИ через OpenAI Images API
//    (модель gpt-image-1, режим /v1/images/edits): на вход идёт PNG с
//    прозрачным фоном из шага 1, ИИ "дорисовывает" прозрачную область по
//    текстовому промпту (описание пользователя + базовый промпт), товар
//    при этом не трогает (OpenAI использует альфа-канал входного
//    изображения как маску, если явную маску не передавать).
//    Настраивается через .env: AI_BACKGROUND_PROVIDER=openai|openai_full + OPENAI_API_KEY.
//
// Без ключей оба шага работают как раньше — простая заглушка на sharp
// (исходное фото как есть + плоский градиентный фон), чтобы проект был
// рабочим "из коробки" без единого внешнего API.

import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';

const GENERATED_DIR = process.env.GENERATED_DIR || './generated';
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// Форматы карточки: одинаковый сгенерированный фон, но 3 распространённых
// соотношения сторон — квадрат, портрет, вертикальная "сторис". Никакой
// привязки к конкретным площадкам — пользователь описывает стиль сам,
// а формат просто даёт выбор под разные места публикации.
const CARD_VARIANTS = [
  { name: 'square', label: 'Квадрат', width: 1000, height: 1000, gradientFrom: '#f5f3ff', gradientTo: '#e0e7ff' },
  { name: 'portrait', label: 'Портрет', width: 1080, height: 1350, gradientFrom: '#fdf2f8', gradientTo: '#fce7f3' },
  { name: 'story', label: 'Сторис', width: 1080, height: 1920, gradientFrom: '#ecfdf5', gradientTo: '#d1fae5' },
];

const DEFAULT_PROMPT =
  'Professional e-commerce product photography background: clean, elegant, ' +
  'softly lit studio backdrop with a subtle realistic shadow beneath the product, ' +
  'premium look, photorealistic, no text, no watermarks, no logos';

const DEFAULT_PROMPT_FULL =
  'Remove the existing background completely and replace it with a clean, softly lit ' +
  'professional studio backdrop, premium e-commerce product photography look, photorealistic. ' +
  'Keep the product itself exactly as in the original photo — same shape, colors, proportions, ' +
  'text and logos on the product — do not redesign, restyle or alter the product in any way. ' +
  'No added text, no watermarks, no extra objects.';

/**
 * Основная функция: принимает путь к загруженному фото и (необязательно)
 * текстовое описание желаемого фона/стиля от пользователя — возвращает
 * массив путей к сгенерированным карточкам (без водяного знака), по одной
 * на каждый формат из CARD_VARIANTS.
 */
export async function generateCardVariants(originalPath, orderId, userDescription) {
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';

  let baseBuffer; // то, что дальше кадрируется под каждый формат
  let aiPhotoBuffer = null;

  if (provider === 'openai_full') {
    // Режим "всё в одном": один вызов OpenAI прямо на исходное фото —
    // и вырезание фона, и генерация нового делаются моделью сама, без
    // отдельного remove.bg/Picsart. См. предупреждение в tryGenerateAiPhotoFull.
    baseBuffer = fs.readFileSync(originalPath);
    aiPhotoBuffer = await tryGenerateAiPhotoFull(baseBuffer, userDescription);
  } else {
    // Обычный режим: сначала точное вырезание товара специализированным
    // сервисом (remove.bg/Picsart), потом (опционально) ИИ дорисовывает
    // фон СТРОГО в прозрачной области — пиксели товара гарантированно
    // не меняются.
    baseBuffer = await getProductCutout(originalPath);
    aiPhotoBuffer = await tryGenerateAiPhoto(baseBuffer, userDescription);
  }

  const results = [];
  for (const style of CARD_VARIANTS) {
    const finalPath = aiPhotoBuffer
      ? await renderCardFromAiPhoto(aiPhotoBuffer, style, orderId)
      : await renderCardWithGradientStub(baseBuffer, style, orderId);
    results.push({ style: style.name, label: style.label, width: style.width, height: style.height, path: finalPath });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Шаг 1: вырезание товара с фона
// ---------------------------------------------------------------------------

async function getProductCutout(originalPath) {
  const provider = process.env.PHOTO_API_PROVIDER || 'stub';

  if (provider === 'removebg') {
    return removeBgViaRemoveBgApi(originalPath);
  }
  if (provider === 'picsart') {
    return removeBgViaPicsartApi(originalPath);
  }
  // ЗАГЛУШКА: просто берём исходное фото как есть, без реального удаления фона
  // (у этого буфера НЕТ альфа-канала, поэтому ИИ-генерация фона в шаге 2
  // автоматически пропускается — ей нужен прозрачный фон, см. tryGenerateAiPhoto).
  return fs.readFileSync(originalPath);
}

// ---------------------------------------------------------------------------
// Шаг 2: реальная ИИ-генерация фона (OpenAI Images API, edit endpoint)
// ---------------------------------------------------------------------------

/**
 * Пытается сгенерировать фон вокруг вырезанного товара через OpenAI.
 * Возвращает Buffer готового фото (товар + новый фон) или null, если ИИ
 * не настроен / не смог — в этом случае вызывающий код использует
 * запасной вариант с плоским градиентом.
 */
async function tryGenerateAiPhoto(cutoutBuffer, userDescription) {
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';
  if (provider !== 'openai') return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  // Для маски по альфа-каналу нужен реально прозрачный фон — если товар не
  // был вырезан (PHOTO_API_PROVIDER=stub), у картинки нет альфа-канала и
  // ИИ-редактирование не будет работать так, как задумано.
  const meta = await sharp(cutoutBuffer).metadata();
  if (!meta.hasAlpha) {
    console.warn(
      'Для ИИ-генерации фона нужен вырезанный товар с прозрачным фоном ' +
        '(PHOTO_API_PROVIDER=removebg|picsart) — сейчас фон не прозрачный, пропускаю ИИ-шаг'
    );
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAi(cutoutBuffer, userDescription);
  } catch (err) {
    console.error('Ошибка ИИ-генерации фона (OpenAI), использую запасной вариант с градиентом:', err);
    return null;
  }
}

function buildPrompt(userDescription, defaultPrompt, envOverrideVarName) {
  const envOverride = process.env[envOverrideVarName];
  const basePrompt = envOverride || defaultPrompt;
  const description = (userDescription || '').trim();
  // Описание пользователя ставим ПЕРВЫМ — так модель приоритезирует именно
  // его как главное творческое задание, а базовый промпт достраивает
  // технические детали (фотореалистично, без текста/водяных знаков и т.п.)
  return description ? `${description}. ${basePrompt}` : basePrompt;
}

async function generateAiPhotoViaOpenAi(cutoutBuffer, userDescription) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, DEFAULT_PROMPT, 'AI_BACKGROUND_PROMPT');

  // OpenAI ограничивает размеры фиксированным набором — берём портретный,
  // ближе всего к большинству карточек; под конкретный формат картинка
  // потом докадрируется через sharp (renderCardFromAiPhoto).
  const size = process.env.OPENAI_IMAGE_SIZE || '1024x1536';

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
// Режим "всё в одном" (AI_BACKGROUND_PROVIDER=openai_full): один вызов OpenAI
// прямо на исходное фото — модель сама и убирает старый фон, и рисует новый,
// без отдельного remove.bg/Picsart.
//
// ⚠️ ВАЖНЫЙ КОМПРОМИСС. В обычном режиме (AI_BACKGROUND_PROVIDER=openai +
// PHOTO_API_PROVIDER=removebg|picsart) прозрачность из remove.bg/Picsart
// используется как ТОЧНАЯ маска — OpenAI физически не может тронуть пиксели
// товара, редактируется только прозрачная область. Здесь же маски нет:
// OpenAI просто получает целое фото и текстовую инструкцию "не меняй товар,
// поменяй только фон" — современные модели соблюдают такую инструкцию
// достаточно хорошо, но НЕ дают гарантии пиксель-в-пиксель, в отличие от
// маски.
// ---------------------------------------------------------------------------

async function tryGenerateAiPhotoFull(originalBuffer, userDescription) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai_full, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAiFull(originalBuffer, userDescription);
  } catch (err) {
    console.error('Ошибка ИИ-генерации (OpenAI, режим openai_full), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateAiPhotoViaOpenAiFull(originalBuffer, userDescription) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, DEFAULT_PROMPT_FULL, 'AI_BACKGROUND_PROMPT_FULL');
  const size = process.env.OPENAI_IMAGE_SIZE || '1024x1536';

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
 * Кадрирует уже готовое ИИ-фото (товар + сгенерированный фон) под нужный формат.
 */
async function renderCardFromAiPhoto(aiPhotoBuffer, style, orderId) {
  const { width, height } = style;
  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);

  await sharp(aiPhotoBuffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .png()
    .toFile(finalPath);

  return finalPath;
}

/**
 * Запасной вариант без ИИ: товар на плоском градиентном фоне — работает
 * всегда, даже без единого внешнего API-ключа.
 */
async function renderCardWithGradientStub(productBuffer, style, orderId) {
  const { width, height } = style;

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

  // Уменьшаем товар, чтобы он умещался по центру карточки с отступами
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
 * Накладывает водяной знак на уже сгенерированные карточки — версии для превью,
 * которые пользователь видит ДО оплаты. Принимает массив {style, width, height, path}
 * из generateCardVariants() и возвращает такой же массив для watermarked-версий.
 */
export async function applyWatermarkToVariants(variants, orderId) {
  const results = [];
  for (const variant of variants) {
    const watermarkSvg = Buffer.from(`
      <svg width="${variant.width}" height="${variant.height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .wm { fill: rgba(255,255,255,0.55); font-size: 42px; font-family: sans-serif; font-weight: 700; }
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

// Генерирует несколько повторов надписи по диагонали карточки под конкретный размер
function buildWatermarkTiles(width, height) {
  let tiles = '';
  for (let y = 100; y < height; y += 200) {
    for (let x = -100; x < width; x += 300) {
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
