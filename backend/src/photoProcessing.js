// photoProcessing.js
// Генерирует карточки товара под разные площадки (Wildberries, Ozon, Яндекс
// Маркет, универсальная) из одного исходного фото. Два независимых этапа:
//
// 1) Вырезание товара с фона — реальный внешний сервис (remove.bg / Picsart),
//    настраивается через .env: PHOTO_API_PROVIDER=removebg|picsart.
//    Возвращает PNG с прозрачным фоном (альфа-канал).
//
// 2) Генерация нового фона под товар — реальный ИИ через OpenAI Images API
//    (модель gpt-image-1, режим /v1/images/edits): на вход идёт PNG с
//    прозрачным фоном из шага 1, ИИ "дорисовывает" прозрачную область по
//    текстовому промпту, товар при этом не трогает (OpenAI использует
//    альфа-канал входного изображения как маску, если явную маску не
//    передавать — именно на этом построена вся эта фича).
//    Настраивается через .env: AI_BACKGROUND_PROVIDER=openai + OPENAI_API_KEY.
//
// Без ключей оба шага работают как раньше — простая заглушка на sharp
// (исходное фото как есть + плоский градиентный фон), чтобы проект был
// рабочим "из коробки" без единого внешнего API.
//
// ⚠️ ВАЖНО про размеры и правила площадок: цифры ниже — общеизвестные на
// момент написания ориентиры, а не гарантированно актуальные требования.
// У Wildberries/Ozon/Я.Маркета периодически меняются правила модерации
// карточек (например, часто ГЛАВНОЕ фото должно быть на чистом/белом фоне
// БЕЗ текста и плашек — цветные варианты с бейджем лучше использовать как
// 2-е/3-е фото в карточке товара, а не как первое). Перед публикацией
// стоит свериться с актуальными требованиями в личном кабинете продавца.

import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';

const GENERATED_DIR = process.env.GENERATED_DIR || './generated';
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// Пресеты под конкретные площадки: свой размер холста (ширина/высота) и
// оформление плашки. Цвета градиента используются только в режиме
// заглушки (без ИИ) — как фон-подложка. Дальше можно легко добавить ещё
// одну площадку — просто новый объект в этот массив.
const MARKETPLACE_STYLES = [
  {
    name: 'wildberries',
    label: 'Wildberries',
    // WB рекомендует карточки 900×1200 (соотношение 3:4)
    width: 900,
    height: 1200,
    gradientFrom: '#6d28d9',
    gradientTo: '#a21caf',
    badgeText: 'WB',
    badgeColor: '#ffffff',
    badgeTextColor: '#6d28d9',
    aiPromptHint: 'elegant studio backdrop in deep purple and magenta tones',
  },
  {
    name: 'ozon',
    label: 'Ozon',
    // Ozon рекомендует квадратные карточки, до 4000×4000, здесь берём 1000×1000
    width: 1000,
    height: 1000,
    gradientFrom: '#0050e6',
    gradientTo: '#3b82f6',
    badgeText: 'OZON',
    badgeColor: '#ffffff',
    badgeTextColor: '#0050e6',
    aiPromptHint: 'clean studio backdrop in cool blue tones',
  },
  {
    name: 'yandex_market',
    label: 'Яндекс Маркет',
    width: 1000,
    height: 1000,
    gradientFrom: '#ffd60a',
    gradientTo: '#ffc300',
    badgeText: 'МАРКЕТ',
    badgeColor: '#1a1a1a',
    badgeTextColor: '#ffd60a',
    aiPromptHint: 'bright studio backdrop in warm yellow tones',
  },
  {
    name: 'universal',
    label: 'Универсальная (соцсети/сайт)',
    // формат 4:5 — удобно и для Instagram/VK, и как доп. фото на любой площадке
    width: 1080,
    height: 1350,
    gradientFrom: '#f5f3ff',
    gradientTo: '#e0e7ff',
    badgeText: null, // без плашки — чистый минималистичный вариант
    badgeColor: '#4f46e5',
    aiPromptHint: 'soft neutral studio backdrop, light and airy',
  },
];

/**
 * Основная функция: принимает путь к загруженному фото, возвращает массив
 * путей к сгенерированным карточкам (без водяного знака) — по одной на
 * площадку из MARKETPLACE_STYLES.
 */
export async function generateCardVariants(originalPath, orderId) {
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';

  let baseBuffer; // то, что дальше кадрируется под каждую площадку
  let aiPhotoBuffer = null;

  if (provider === 'openai_full') {
    // Режим "всё в одном": один вызов OpenAI прямо на исходное фото —
    // и вырезание фона, и генерация нового делаются моделью сама, без
    // отдельного remove.bg/Picsart. См. предупреждение в tryGenerateAiPhotoFull.
    baseBuffer = fs.readFileSync(originalPath);
    aiPhotoBuffer = await tryGenerateAiPhotoFull(baseBuffer);
  } else {
    // Обычный режим: сначала точное вырезание товара специализированным
    // сервисом (remove.bg/Picsart), потом (опционально) ИИ дорисовывает
    // фон СТРОГО в прозрачной области — пиксели товара гарантированно
    // не меняются.
    baseBuffer = await getProductCutout(originalPath);
    aiPhotoBuffer = await tryGenerateAiPhoto(baseBuffer);
  }

  const results = [];
  for (const style of MARKETPLACE_STYLES) {
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
async function tryGenerateAiPhoto(cutoutBuffer) {
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
    return await generateAiPhotoViaOpenAi(cutoutBuffer);
  } catch (err) {
    console.error('Ошибка ИИ-генерации фона (OpenAI), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateAiPhotoViaOpenAi(cutoutBuffer) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

  // Промпт можно полностью переопределить в .env (AI_BACKGROUND_PROMPT),
  // если хочется другого настроения фона (например под конкретную нишу товаров).
  const prompt =
    process.env.AI_BACKGROUND_PROMPT ||
    'Professional e-commerce product photography background: clean, elegant, ' +
      'softly lit studio backdrop with a subtle realistic shadow beneath the product, ' +
      'premium marketplace look, photorealistic, no text, no watermarks, no logos';

  // OpenAI ограничивает размеры фиксированным набором — берём портретный,
  // ближе всего к большинству карточек площадок; под конкретный размер
  // каждой площадки картинка потом докадрируется через sharp (renderCardFromAiPhoto).
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
// маски. Для соцсетей/черновиков — нормально. Для карточки, по которой
// покупатель принимает решение о покупке на маркетплейсе, надёжнее и
// честнее обычный режим с точным вырезанием.
// ---------------------------------------------------------------------------

async function tryGenerateAiPhotoFull(originalBuffer) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai_full, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAiFull(originalBuffer);
  } catch (err) {
    console.error('Ошибка ИИ-генерации (OpenAI, режим openai_full), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateAiPhotoViaOpenAiFull(originalBuffer) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

  const prompt =
    process.env.AI_BACKGROUND_PROMPT_FULL ||
    'Remove the existing background completely and replace it with a clean, softly lit ' +
      'professional studio backdrop, premium e-commerce product photography look, photorealistic. ' +
      'Keep the product itself exactly as in the original photo — same shape, colors, proportions, ' +
      'text and logos on the product — do not redesign, restyle or alter the product in any way. ' +
      'No added text, no watermarks, no extra objects.';

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
 * Кадрирует уже готовое ИИ-фото (товар + сгенерированный фон) под размер
 * конкретной площадки и накладывает плашку (WB/OZON/МАРКЕТ и т.п.).
 */
async function renderCardFromAiPhoto(aiPhotoBuffer, style, orderId) {
  const { width, height } = style;

  const resized = await sharp(aiPhotoBuffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .toBuffer();

  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);

  if (style.badgeText) {
    const badgeSvg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${buildBadgeSvg(style)}
      </svg>
    `);
    await sharp(resized).composite([{ input: badgeSvg, top: 0, left: 0 }]).png().toFile(finalPath);
  } else {
    await sharp(resized).png().toFile(finalPath);
  }

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
      ${style.badgeText ? buildBadgeSvg(style) : ''}
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
  const top = Math.round((height - productMeta.height) / 2) + Math.round(height * 0.03); // чуть ниже центра, чтобы не биться с плашкой

  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);

  await sharp(background)
    .composite([{ input: productResized, left, top }])
    .png()
    .toFile(finalPath);

  return finalPath;
}

// Плашка-бейдж в углу карточки (WB / OZON / МАРКЕТ и т.п.)
function buildBadgeSvg(style) {
  const textColor = style.badgeTextColor || '#ffffff';
  return `
    <g>
      <rect x="40" y="40" width="220" height="64" rx="16" fill="${style.badgeColor}"/>
      <text x="150" y="82" text-anchor="middle" font-family="sans-serif" font-weight="700"
            font-size="26" fill="${textColor}">${style.badgeText}</text>
    </g>
  `;
}

/**
 * Накладывает водяной знак на уже сгенерированные карточки — версии для превью,
 * которые пользователь видит ДО оплаты. Принимает массив {style, width, height, path}
 * из generateCardVariants() и возвращает такой же массив для watermarked-версий.
 * Размер водяного знака подгоняется под РЕАЛЬНЫЙ размер каждой карточки —
 * у площадок он разный (900×1200, 1000×1000, 1080×1350).
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
