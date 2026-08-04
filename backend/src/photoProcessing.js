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

// Водяной знак — ГОТОВЫЕ ВЕКТОРНЫЕ КОНТУРЫ слова "PREVIEW", а не текст.
//
// История вопроса (важно, чтобы не наступить на те же грабли повторно):
// 1) Сначала водяной знак рисовался обычным SVG <text> с font-family: sans-serif —
//    полагались на системные шрифты контейнера. В логах Railway встречалась
//    "Fontconfig error: Cannot load default config file" — из-за неё librsvg
//    (через который sharp рендерит SVG) молча рисовал ПУСТОТУ вместо текста,
//    без единой ошибки — операция "успешно" завершалась с невидимым знаком.
// 2) Тогда попробовали вшить шрифт прямо в SVG через @font-face с base64 —
//    в теории должно было исключить зависимость от системных шрифтов вообще.
//    На практике НЕ ПОМОГЛО: судя по всему, версия librsvg на Railway либо не
//    поддерживает @font-face вообще, либо поддерживает не полностью, и всё
//    равно скатывается на системный (сломанный) шрифт.
// 3) Единственный способ, который гарантированно работает в ЛЮБОМ окружении —
//    вообще не просить рендерер искать шрифт. Контуры букв слова "PREVIEW"
//    извлечены ЗАРАНЕЕ (offline, через fontTools) из шрифта Bricolage
//    Grotesque Bold (лицензия SIL OFL, см. assets/FONT-LICENSE.txt) и зашиты
//    ниже как готовые SVG <path>. Во время генерации карточки рендерер просто
//    закрашивает фигуры — ему физически не от кого зависеть, шрифты вообще
//    не участвуют в процессе.
const WATERMARK_GLYPH_UNITS_PER_EM = 1000;
const WATERMARK_TEXT_ADVANCE_WIDTH = 4519; // ширина слова "PREVIEW" в тех же единицах, что и контуры
const WATERMARK_GLYPH_PATHS = `<g transform="translate(0,0)"><path d="M174 186V299H325Q397 299 433.0 328.5Q469 358 469 426Q469 486 435.5 517.5Q402 549 332 549H174V660H336Q400 660 451.5 645.0Q503 630 539.5 600.5Q576 571 595.0 526.5Q614 482 614 422Q614 345 579.0 292.5Q544 240 475.5 213.0Q407 186 305 186ZM73 0V660H217V0Z"/></g><g transform="translate(646,0)"><path d="M73 0V660H341Q395 660 439.0 651.5Q483 643 517.0 627.0Q551 611 574.5 587.5Q598 564 610.0 533.5Q622 503 622 466Q622 431 611.0 402.5Q600 374 578.0 353.0Q556 332 523.0 318.5Q490 305 446 300V285Q497 280 527.5 261.5Q558 243 575.5 212.0Q593 181 606 135L646 0H487L456 125Q447 165 430.0 187.5Q413 210 387.0 219.5Q361 229 324 229H217V0ZM217 337H331Q399 337 436.0 363.0Q473 389 473 444Q473 498 438.5 523.5Q404 549 335 549H217Z"/></g><g transform="translate(1325,0)"><path d="M73 0V660H218V0ZM173 0V117H582V0ZM173 280V387H532V280ZM173 544V660H580V544Z"/></g><g transform="translate(1946,0)"><path d="M236 0 18 660H175L331 122H344L501 660H656L437 0Z"/></g><g transform="translate(2619,0)"><path d="M73 0V660H220V0Z"/></g><g transform="translate(2912,0)"><path d="M73 0V660H218V0ZM173 0V117H582V0ZM173 280V387H532V280ZM173 544V660H580V544Z"/></g><g transform="translate(3533,0)"><path d="M172 0 23 660H180L278 123H289L405 660H588L704 123H716L814 660H963L812 0H611L499 537H490L378 0Z"/></g>`;

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
// Запрет на текст — применяется ТОЛЬКО когда пользователь сам ничего не
// описал (наш собственный запасной фон по умолчанию). Если пользователь
// что-то написал сам — в том числе прямо попросил текст/надпись/элемент на
// карточке — этот запрет ему только мешал бы, поэтому в таком случае вообще
// не добавляется, и модель свободна рисовать то, что описано.
const NO_TEXT_INSTRUCTION =
  'IMPORTANT: absolutely no text, letters, words, titles, labels, numbers or writing of any kind ' +
  'anywhere in the image — not on the background, not as an overlay, not stylized, not decorative. ' +
  'The image must be completely free of any lettering.';

const QUALITY_SUFFIX =
  'Photorealistic, no watermarks, no logos. ' +
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
 *
 * onProgress(percent, step) — необязательный колбэк, вызывается после
 * КАЖДОГО реально завершившегося шага (не имитация — честные отметки по
 * факту готовности), чтобы вызывающий код (routes/upload.js) мог сохранять
 * прогресс в БД и отдавать его фронтенду через опрос статуса.
 */
/**
 * Основная функция: принимает путь к загруженному фото (может быть null —
 * тогда карточка рисуется ЦЕЛИКОМ по текстовому описанию, без исходного
 * фото товара), (необязательное) текстовое описание от пользователя и
 * желаемый размер карточки — возвращает массив из 3 путей к сгенерированным
 * карточкам (без водяного знака), каждая в своём стиле.
 *
 * onProgress(percent, step) — необязательный колбэк, вызывается после
 * КАЖДОГО реально завершившегося шага (не имитация — честные отметки по
 * факту готовности), чтобы вызывающий код (routes/upload.js) мог сохранять
 * прогресс в БД и отдавать его фронтенду через опрос статуса.
 */
export async function generateCardVariants(originalPath, orderId, userDescription, width, height, onProgress) {
  const w = normalizeSize(width);
  const h = normalizeSize(height);
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';

  const results = [];
  // Доли общего прогресса: подготовка — 10%, дальше по ~27% на каждый из
  // 3 вариантов = 91%, округляем последний до 90%.
  const PREP_PERCENT = 10;
  const PER_VARIANT_PERCENT = Math.floor((90 - PREP_PERCENT) / STYLE_VARIATIONS.length);

  if (!originalPath) {
    // Фото не загружали — рисуем карточку целиком по описанию пользователя
    // (text-to-image, без исходного фото товара для редактирования).
    onProgress?.(PREP_PERCENT, 'prepare');
    for (let i = 0; i < STYLE_VARIATIONS.length; i++) {
      const style = STYLE_VARIATIONS[i];
      const aiImageBuffer = await tryGenerateTextToImage(userDescription, style.styleHint, w, h);
      const finalPath = aiImageBuffer
        ? await renderCardFromAiPhoto(aiImageBuffer, style.name, w, h, orderId)
        : await renderGradientOnlyCard(style, w, h, orderId);
      results.push({ style: style.name, label: style.name, width: w, height: h, path: finalPath });
      onProgress?.(PREP_PERCENT + (i + 1) * PER_VARIANT_PERCENT, style.name);
    }
    return results;
  }

  if (provider === 'openai_full') {
    // Режим "всё в одном": каждый вызов идёт прямо на исходное фото — модель
    // сама и убирает старый фон, и рисует новый. См. предупреждение ниже
    // в tryGenerateAiPhotoFull про отсутствие точной маски.
    const originalBuffer = fs.readFileSync(originalPath);
    onProgress?.(PREP_PERCENT, 'prepare');
    for (let i = 0; i < STYLE_VARIATIONS.length; i++) {
      const style = STYLE_VARIATIONS[i];
      const aiPhotoBuffer = await tryGenerateAiPhotoFull(originalBuffer, userDescription, style.styleHint, w, h);
      const finalPath = aiPhotoBuffer
        ? await renderCardFromAiPhoto(aiPhotoBuffer, style.name, w, h, orderId)
        : await renderCardWithGradientStub(originalBuffer, style, w, h, orderId);
      results.push({ style: style.name, label: style.name, width: w, height: h, path: finalPath });
      onProgress?.(PREP_PERCENT + (i + 1) * PER_VARIANT_PERCENT, style.name);
    }
  } else {
    // Обычный режим: вырезаем товар ОДИН раз (это не про стиль, это точная
    // маска), а дальше на его основе — 3 разных ИИ-генерации фона.
    const cutoutBuffer = await getProductCutout(originalPath);
    onProgress?.(PREP_PERCENT, 'cutout');
    for (let i = 0; i < STYLE_VARIATIONS.length; i++) {
      const style = STYLE_VARIATIONS[i];
      const aiPhotoBuffer = await tryGenerateAiPhoto(cutoutBuffer, userDescription, style.styleHint, w, h);
      const finalPath = aiPhotoBuffer
        ? await renderCardFromAiPhoto(aiPhotoBuffer, style.name, w, h, orderId)
        : await renderCardWithGradientStub(cutoutBuffer, style, w, h, orderId);
      results.push({ style: style.name, label: style.name, width: w, height: h, path: finalPath });
      onProgress?.(PREP_PERCENT + (i + 1) * PER_VARIANT_PERCENT, style.name);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Генерация БЕЗ исходного фото — карточка целиком по текстовому описанию
// (OpenAI Images API, endpoint /v1/images/generations — в отличие от
// /v1/images/edits, тут нет входного изображения вообще, только текст).
// ---------------------------------------------------------------------------

async function tryGenerateTextToImage(userDescription, styleHint, width, height) {
  const provider = process.env.AI_BACKGROUND_PROVIDER || 'stub';
  if (provider !== 'openai' && provider !== 'openai_full') return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('Фото не загружено и AI_BACKGROUND_PROVIDER=openai(_full), но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  if (!(userDescription || '').trim()) {
    // Без фото и без описания рисовать вообще нечего — этот случай должен
    // отсекаться ещё в routes/upload.js, но на всякий случай подстрахуемся.
    console.warn('Нет ни фото, ни описания — нечего генерировать, использую запасной вариант с градиентом');
    return null;
  }

  try {
    return await generateTextToImageViaOpenAi(userDescription, styleHint, width, height);
  } catch (err) {
    console.error('Ошибка text-to-image генерации (OpenAI), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateTextToImageViaOpenAi(userDescription, styleHint, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  // Без исходного товара защищать нечего (requireProductIntegrity не нужен) —
  // это уже не редактирование фото, а генерация "с нуля" по описанию.
  const prompt = buildPrompt(userDescription, 'AI_BACKGROUND_PROMPT', styleHint);
  const { size, quality } = buildImageRequestParams(model, width, height);

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, ...(quality ? { quality } : {}), n: 1 }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI images/generations вернул ошибку ${response.status}: ${errText}`);
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
 * Запасной вариант без ИИ и без фото товара — просто цветная градиентная
 * карточка (без исходного фото, оверлеить нечего). Работает всегда, даже
 * без единого внешнего API-ключа — так приложение остаётся рабочим "из
 * коробки" даже для сценария "карточка без фото".
 */
async function renderGradientOnlyCard(style, width, height, orderId) {
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

  const finalPath = path.join(GENERATED_DIR, `${orderId}_${style.name}_final.png`);
  await sharp(backgroundSvg).png().toFile(finalPath);
  return finalPath;
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

async function tryGenerateAiPhoto(cutoutBuffer, userDescription, styleHint, width, height) {
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
    return await generateAiPhotoViaOpenAi(cutoutBuffer, userDescription, styleHint, width, height);
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

  if (description) {
    // Пользователь сам что-то написал — не мешаем запретом на текст: если
    // он попросил надпись/элемент на карточке, пусть модель попробует это
    // нарисовать. Единственное, что всё равно может добавиться —
    // integrityPart (защита самого товара в режиме openai_full).
    const corePrompt = `${description}, ${styleHint || DEFAULT_BACKGROUND_PROMPT}`;
    return `${corePrompt}. ${QUALITY_SUFFIX}${integrityPart}`;
  }

  // Пользователь ничего не написал — это уже наш собственный запасной фон,
  // тут ограничивать нечего, и текст на нём точно не нужен.
  const corePrompt = `${envOverride ? envOverride + ', ' : ''}${styleHint || DEFAULT_BACKGROUND_PROMPT}`;
  return `${NO_TEXT_INSTRUCTION} ${corePrompt}. ${QUALITY_SUFFIX}${integrityPart}`;
}

// gpt-image-2 (текущий флагман на момент написания, август 2026) умеет
// генерировать СРАЗУ произвольный размер WIDTHxHEIGHT (кратный 16, стороны
// от 1:3 до 3:1) — значит для него докадрирование после генерации почти не
// нужно, картинка сразу нужных пропорций. gpt-image-1/1.5 такого не умеют —
// у них фиксированный набор размеров, поэтому для них оставляем прежнюю
// логику "сгенерировать ближайший подходящий формат, потом докадрировать".
function isGptImage2(model) {
  return /gpt-image-2/i.test(model);
}

function buildImageRequestParams(model, width, height) {
  if (isGptImage2(model)) {
    const clampDim = (n) => {
      const rounded = Math.round(Math.max(256, Math.min(2048, n)) / 16) * 16;
      return rounded;
    };
    let w = clampDim(width);
    let h = clampDim(height);
    // ограничение API: соотношение сторон должно быть от 1:3 до 3:1
    const ratio = w / h;
    if (ratio > 3) w = h * 3;
    if (ratio < 1 / 3) h = w * 3;
    return { size: `${w}x${h}` }; // без quality — у gpt-image-2 разрешение само по себе задаёт детализацию
  }

  // gpt-image-1 / gpt-image-1.5 — фиксированный набор размеров + отдельный
  // параметр quality. Явно ставим 'high' — максимум, который поддерживает
  // API (по умолчанию, если не указывать, используется более низкое
  // качество/авто, а не максимальное).
  const envSize = process.env.OPENAI_IMAGE_SIZE;
  let size = envSize;
  if (!size) {
    const ratio = width / height;
    size = ratio > 1.15 ? '1536x1024' : ratio < 0.87 ? '1024x1536' : '1024x1024';
  }
  return { size, quality: process.env.OPENAI_IMAGE_QUALITY || 'high' };
}

async function generateAiPhotoViaOpenAi(cutoutBuffer, userDescription, styleHint, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, 'AI_BACKGROUND_PROMPT', styleHint);
  const { size, quality } = buildImageRequestParams(model, width, height);

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('model', model);
  form.append('image', cutoutBuffer, { filename: 'product.png', contentType: 'image/png' });
  form.append('prompt', prompt);
  form.append('size', size);
  if (quality) form.append('quality', quality);
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

async function tryGenerateAiPhotoFull(originalBuffer, userDescription, styleHint, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_BACKGROUND_PROVIDER=openai_full, но OPENAI_API_KEY не задан — использую запасной вариант с градиентом');
    return null;
  }

  try {
    return await generateAiPhotoViaOpenAiFull(originalBuffer, userDescription, styleHint, width, height);
  } catch (err) {
    console.error('Ошибка ИИ-генерации (OpenAI, режим openai_full), использую запасной вариант с градиентом:', err);
    return null;
  }
}

async function generateAiPhotoViaOpenAiFull(originalBuffer, userDescription, styleHint, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildPrompt(userDescription, 'AI_BACKGROUND_PROMPT_FULL', styleHint, { requireProductIntegrity: true });
  const { size, quality } = buildImageRequestParams(model, width, height);

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('model', model);
  form.append('image', originalBuffer, { filename: 'product.png', contentType: 'image/png' });
  form.append('prompt', prompt);
  form.append('size', size);
  if (quality) form.append('quality', quality);
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
    // Размер шрифта — доля от меньшей стороны карточки. Первая версия была
    // 25%, потом стало 25%×3 после отдельного запроса. Буквальные "ещё ×5"
    // от этого (125% стороны карточки) я проверил рендером — и это ХУЖЕ, не
    // лучше: буквы становятся крупнее самой карточки, повторов на холсте
    // остаётся мало, и между гигантскими буквами образуются большие пустые
    // проёмы — скриншотить становится ЛЕГЧЕ, а не сложнее. Вместо этого
    // добился нужного эффекта (реально невозможно вырезать чистый кусок для
    // скрина) через более умеренное увеличение размера (45% стороны, это
    // почти вдвое крупнее прежнего) вместе с НАМНОГО более плотной сеткой
    // повторов (шаг сетки теперь меньше самой буквы — повторы перекрываются
    // друг с другом). См. buildWatermarkTiles ниже — именно плотность
    // перекрытия, а не голый размер буквы, определяет, останется ли на
    // карточке хоть один чистый участок для скриншота.
    const fontSize = Math.max(28, Math.round(Math.min(variant.width, variant.height) * 0.9));

    const watermarkSvg = Buffer.from(`
      <svg width="${variant.width}" height="${variant.height}" xmlns="http://www.w3.org/2000/svg">
        ${buildWatermarkTiles(variant.width, variant.height, fontSize)}
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

// Плотная сетка перекрывающихся повторов — шаг сетки МЕНЬШЕ размера самой
// буквы (0.55×/0.85× от fontSize), из-за этого соседние повторы слова
// "PREVIEW" накладываются друг на друга и закрывают собой пустоты внутри
// самих букв — именно это (а не голый размер буквы) реально не оставляет на
// карточке чистого участка для скриншота. Каждая плитка — это <g> с
// transform (сдвиг + поворот -30° + масштаб под fontSize), вокруг ОДНИХ И
// ТЕХ ЖЕ готовых контуров WATERMARK_GLYPH_PATHS — сам SVG не содержит ни
// одного текстового узла, поэтому рендереру буквально не от кого зависеть.
function buildWatermarkTiles(width, height, fontSize) {
  const yStep = Math.round(fontSize * 0.55);
  const xStep = Math.round(fontSize * 0.85);
  // scale переводит координаты контуров (в единицах шрифта, unitsPerEm=1000)
  // в пиксели нужного размера; знак "минус" по Y — потому что в контурах
  // шрифта "вверх" это положительный Y, а в SVG "вниз" это положительный Y.
  const scale = fontSize / WATERMARK_GLYPH_UNITS_PER_EM;
  let tiles = '';
  for (let y = fontSize; y < height + fontSize; y += yStep) {
    for (let x = -fontSize; x < width + fontSize; x += xStep) {
      tiles += `<g transform="translate(${x},${y}) rotate(-30) scale(${scale},${-scale})" fill="rgba(255,0,0,0.6)">${WATERMARK_GLYPH_PATHS}</g>`;
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
