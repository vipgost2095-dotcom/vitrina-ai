// styleLibrary.js — 500 готовых комбинаций стиля фона (10 палитр × 10
// настроений × 5 текстур), не как стена из 500 кнопок, а как компактный
// конструктор в 3 ряда: пользователь выбирает по одному пункту в каждом
// ряду (или не выбирает вовсе) — итоговых сочетаний 10×10×5 = 500, при этом
// на экране всего 25 кнопок.
//
// Каждый пункт — [ru-подпись, en-подпись, промпт-фрагмент]. Промпт-фрагмент
// специально на английском — как и остальные промпты в приложении, так
// надёжнее работает с генерацией изображений независимо от языка интерфейса.

export const PALETTES = [
  ['Чёрно-золотой', 'Black & gold', 'black and gold color palette'],
  ['Пастельный', 'Pastel', 'soft pastel color palette'],
  ['Неоновый', 'Neon', 'vibrant neon color palette'],
  ['Природный', 'Earthy', 'natural earthy color palette'],
  ['Монохром', 'Monochrome', 'monochrome black and white palette'],
  ['Изумрудный', 'Emerald', 'emerald green and gold color palette'],
  ['Розово-лавандовый', 'Pink & lavender', 'pink and lavender color palette'],
  ['Бирюзово-коралловый', 'Teal & coral', 'turquoise and coral color palette'],
  ['Бордово-медный', 'Burgundy & copper', 'burgundy and copper color palette'],
  ['Серебристо-синий', 'Silver & blue', 'silver and deep blue color palette'],
];

export const MOODS = [
  ['Люкс', 'Luxury', 'luxurious premium mood'],
  ['Минимализм', 'Minimalist', 'minimalist clean mood'],
  ['Ретро', 'Retro', 'retro vintage mood'],
  ['Футуристичный', 'Futuristic', 'futuristic sci-fi mood'],
  ['Романтичный', 'Romantic', 'romantic soft mood'],
  ['Индустриальный', 'Industrial', 'industrial urban mood'],
  ['Праздничный', 'Festive', 'festive celebratory mood'],
  ['Природный', 'Natural', 'natural organic mood'],
  ['Гламурный', 'Glamorous', 'glamorous bold mood'],
  ['Динамичный', 'Dynamic', 'dynamic energetic sporty mood'],
];

export const TEXTURES = [
  ['Мраморная', 'Marble', 'marble surface texture'],
  ['Деревянная', 'Wooden', 'wooden surface texture'],
  ['Тканевая', 'Fabric', 'silk and velvet fabric texture'],
  ['Металлическая', 'Metallic', 'brushed metal texture'],
  ['Стеклянная', 'Glass', 'glass and acrylic texture'],
];

const TOTAL_COMBINATIONS = PALETTES.length * MOODS.length * TEXTURES.length; // 500

export function getTotalCombinations() {
  return TOTAL_COMBINATIONS;
}

// Собирает промпт-фразу из выбранных пунктов (любые могут отсутствовать)
export function composeStylePhrase(palette, mood, texture) {
  return [palette?.[2], mood?.[2], texture?.[2]].filter(Boolean).join(', ');
}

// Случайная комбинация из всех 500 — для кнопки "🎲 Случайный стиль"
export function randomCombination() {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
  const texture = TEXTURES[Math.floor(Math.random() * TEXTURES.length)];
  return { palette, mood, texture };
}
