// aiCopywriting.js
// Реальная ИИ-возможность №3 (после вырезания фона и генерации нового фона):
// написание текста карточки товара — название, продающее описание и буллеты
// характеристик — через мультимодальную модель OpenAI (Chat Completions API
// с image input): модель "смотрит" на фото товара и учитывает то, что о нём
// написал сам пользователь, и выдаёт готовый текст под карточку маркетплейса.
//
// Без ключа (или если провайдер = stub) эта функция просто возвращает null —
// приложение и без неё полностью рабочее, текст на карточке — необязательный бонус.

import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

/**
 * Пытается сгенерировать текст карточки. imagePath может быть null (если
 * пользователь не загружал фото — карточка сгенерирована целиком по
 * описанию) — тогда используется обычный текстовый запрос без картинки.
 * Возвращает { title, description, bullets } или null, если провайдер не
 * настроен / что-то пошло не так (тогда просто не показываем текстовый блок).
 */
export async function tryGenerateProductCopy({ imagePath, userDescription }) {
  const provider = process.env.AI_TEXT_PROVIDER || 'stub';
  if (provider !== 'openai') return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('AI_TEXT_PROVIDER=openai, но OPENAI_API_KEY не задан — текст карточки не генерируется');
    return null;
  }

  if (!imagePath && !(userDescription || '').trim()) {
    return null; // ни фото, ни описания — сгенерировать текст не из чего
  }

  try {
    return imagePath
      ? await generateProductCopyFromImage(imagePath, userDescription, apiKey)
      : await generateProductCopyFromTextOnly(userDescription, apiKey);
  } catch (err) {
    console.error('Ошибка ИИ-генерации текста карточки (OpenAI), текст просто не будет показан:', err);
    return null;
  }
}

function getModel() {
  // gpt-5.4-mini заменён на полную gpt-5.4 — заметно точнее и лучше пишет
  // (mini версия экономичнее, но на "максимуме качества" берём старшую модель).
  // Актуальный флагман на сегодня — gpt-5.6-sol, но это модель с расширенным
  // рассуждением, у которой могут отличаться параметры Chat Completions API
  // (не проверено вживую с этим кодом) — если хотите попробовать её, задайте
  // OPENAI_TEXT_MODEL=gpt-5.6-sol в .env и проверьте на паре тестовых запросов.
  return process.env.OPENAI_TEXT_MODEL || 'gpt-5.4';
}

function parseAndValidateCopy(content) {
  const parsed = JSON.parse(content);
  if (!parsed.title || !parsed.description) throw new Error('OpenAI вернул неполный JSON');

  return {
    title: String(parsed.title).slice(0, 200),
    description: String(parsed.description).slice(0, 1000),
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 8).map((b) => String(b).slice(0, 200)) : [],
  };
}

async function callChatCompletions(model, content, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI chat/completions вернул ошибку ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI не вернул текст в ответе');
  return text;
}

async function generateProductCopyFromImage(imagePath, userDescription, apiKey) {
  const model = getModel();
  const ext = path.extname(imagePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const description = (userDescription || '').trim();

  const instructions =
    'Ты помогаешь продавцу составить карточку товара для маркетплейса (Wildberries/Ozon/Яндекс Маркет). ' +
    'Посмотри на фото товара' +
    (description ? ` и учти, что продавец написал о нём: "${description}".` : '.') +
    ' Составь: 1) короткое цепляющее название товара (до 60 символов, без кавычек), ' +
    '2) продающее описание на 2-3 предложения (без преувеличений, которых не видно на фото), ' +
    '3) ровно 5 буллетов с ключевыми характеристиками/преимуществами (короткие, по 3-8 слов каждый). ' +
    'Пиши по-русски. Ответь СТРОГО в виде JSON без markdown-разметки, формат: ' +
    '{"title": "...", "description": "...", "bullets": ["...", "...", "...", "...", "..."]}';

  const content = [
    { type: 'text', text: instructions },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
  ];

  const text = await callChatCompletions(model, content, apiKey);
  return parseAndValidateCopy(text);
}

/**
 * Тот же текст карточки, но БЕЗ фото — когда пользователь сгенерировал
 * карточку целиком по описанию, а не с фото товара. Модель ориентируется
 * только на текст, который написал пользователь (обязателен в этом случае —
 * без него и без фото сочинять карточку не из чего).
 */
async function generateProductCopyFromTextOnly(userDescription, apiKey) {
  const model = getModel();
  const description = (userDescription || '').trim();

  const instructions =
    'Ты помогаешь составить карточку товара для маркетплейса (Wildberries/Ozon/Яндекс Маркет). ' +
    `Продавец описал товар/карточку так: "${description}". Фото товара нет — ориентируйся только на это описание. ` +
    'Составь: 1) короткое цепляющее название товара (до 60 символов, без кавычек), ' +
    '2) продающее описание на 2-3 предложения, ' +
    '3) ровно 5 буллетов с ключевыми характеристиками/преимуществами (короткие, по 3-8 слов каждый). ' +
    'Пиши по-русски. Ответь СТРОГО в виде JSON без markdown-разметки, формат: ' +
    '{"title": "...", "description": "...", "bullets": ["...", "...", "...", "...", "..."]}';

  const text = await callChatCompletions(model, instructions, apiKey);
  return parseAndValidateCopy(text);
}
