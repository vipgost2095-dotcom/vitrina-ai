// styleLibrary.js — 500 готовых комбинаций стиля фона (10 палитр × 10
// настроений × 5 текстур), не как стена из 500 кнопок, а как компактный
// конструктор в 3 ряда: пользователь выбирает по одному пункту в каждом
// ряду (или не выбирает вовсе) — итоговых сочетаний 10×10×5 = 500, при этом
// на экране всего 25 кнопок.
//
// Каждый пункт — [ru-подпись, en-подпись, en-промпт-фрагмент, ru-промпт-фрагмент].
// Итоговая фраза, которая уходит в описание (а оттуда — в промпт для ИИ),
// собирается на языке ТЕКУЩЕГО интерфейса — если выбран русский, фраза
// на русском, если английский — на английском.

export const PALETTES = [
  ['Чёрно-золотой', 'Black & gold', 'black and gold color palette', 'чёрно-золотая цветовая палитра'],
  ['Пастельный', 'Pastel', 'soft pastel color palette', 'мягкая пастельная цветовая палитра'],
  ['Неоновый', 'Neon', 'vibrant neon color palette', 'яркая неоновая цветовая палитра'],
  ['Природный', 'Earthy', 'natural earthy color palette', 'природная земляная цветовая палитра'],
  ['Монохром', 'Monochrome', 'monochrome black and white palette', 'монохромная чёрно-белая палитра'],
  ['Изумрудный', 'Emerald', 'emerald green and gold color palette', 'изумрудно-золотая цветовая палитра'],
  ['Розово-лавандовый', 'Pink & lavender', 'pink and lavender color palette', 'розово-лавандовая цветовая палитра'],
  ['Бирюзово-коралловый', 'Teal & coral', 'turquoise and coral color palette', 'бирюзово-коралловая цветовая палитра'],
  ['Бордово-медный', 'Burgundy & copper', 'burgundy and copper color palette', 'бордово-медная цветовая палитра'],
  ['Серебристо-синий', 'Silver & blue', 'silver and deep blue color palette', 'серебристо-синяя цветовая палитра'],
];

export const MOODS = [
  ['Люкс', 'Luxury', 'luxurious premium mood', 'роскошное премиальное настроение'],
  ['Минимализм', 'Minimalist', 'minimalist clean mood', 'минималистичное чистое настроение'],
  ['Ретро', 'Retro', 'retro vintage mood', 'ретро винтажное настроение'],
  ['Футуристичный', 'Futuristic', 'futuristic sci-fi mood', 'футуристичное настроение в стиле sci-fi'],
  ['Романтичный', 'Romantic', 'romantic soft mood', 'романтичное мягкое настроение'],
  ['Индустриальный', 'Industrial', 'industrial urban mood', 'индустриальное урбанистическое настроение'],
  ['Праздничный', 'Festive', 'festive celebratory mood', 'праздничное торжественное настроение'],
  ['Природный', 'Natural', 'natural organic mood', 'природное органичное настроение'],
  ['Гламурный', 'Glamorous', 'glamorous bold mood', 'гламурное яркое настроение'],
  ['Динамичный', 'Dynamic', 'dynamic energetic sporty mood', 'динамичное энергичное спортивное настроение'],
];

export const TEXTURES = [
  ['Мраморная', 'Marble', 'marble surface texture', 'мраморная текстура поверхности'],
  ['Деревянная', 'Wooden', 'wooden surface texture', 'деревянная текстура поверхности'],
  ['Тканевая', 'Fabric', 'silk and velvet fabric texture', 'текстура шёлка и бархата'],
  ['Металлическая', 'Metallic', 'brushed metal texture', 'текстура матового металла'],
  ['Стеклянная', 'Glass', 'glass and acrylic texture', 'текстура стекла и акрила'],
];

const TOTAL_COMBINATIONS = PALETTES.length * MOODS.length * TEXTURES.length; // 500

export function getTotalCombinations() {
  return TOTAL_COMBINATIONS;
}

// Собирает промпт-фразу из выбранных пунктов (любые могут отсутствовать) —
// на языке lang ('ru' | 'en'): индекс 3 (ru-фрагмент) или 2 (en-фрагмент).
export function composeStylePhrase(palette, mood, texture, lang) {
  const idx = lang === 'en' ? 2 : 3;
  return [palette?.[idx], mood?.[idx], texture?.[idx]].filter(Boolean).join(', ');
}

// Случайная комбинация из всех 500 — для кнопки "🎲 Случайный стиль"
export function randomCombination() {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
  const texture = TEXTURES[Math.floor(Math.random() * TEXTURES.length)];
  return { palette, mood, texture };
}
