// db.js — работа с SQLite через better-sqlite3.
// Хранит пользователей (по их Telegram id и TON-адресу) и заказы (order = один процесс
// "загрузил фото -> сгенерировал карточку -> оплатил -> скачал").

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

// Таблица пользователей — привязка Telegram-аккаунта к TON-кошельку
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id   TEXT PRIMARY KEY,
  username      TEXT,
  ton_address   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
`);

// Таблица заказов — весь жизненный цикл одной карточки товара
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,     -- uuid, он же используется как payment comment
  telegram_id     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'created', -- created -> generated -> awaiting_payment -> paid -> error
  original_path   TEXT,
  watermarked_path TEXT,
  final_path      TEXT,
  payment_method  TEXT,                 -- ton | usdt | stars
  amount_ton      REAL,
  receiver_address TEXT,
  tx_hash         TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
`);

// Простая миграция для баз, созданных до появления оплаты Stars/USDT —
// добавляем недостающие колонки, если их ещё нет (better-sqlite3 не умеет
// "ADD COLUMN IF NOT EXISTS", поэтому проверяем вручную через pragma).
const existingColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name));
const migrations = [
  ['payment_method', "ALTER TABLE orders ADD COLUMN payment_method TEXT"],
  ['stars_amount', "ALTER TABLE orders ADD COLUMN stars_amount INTEGER"],
  ['usdt_amount', "ALTER TABLE orders ADD COLUMN usdt_amount REAL"],
  ['telegram_payment_charge_id', "ALTER TABLE orders ADD COLUMN telegram_payment_charge_id TEXT"],
  // final_paths_json / watermarked_paths_json хранят JSON-массив из 4 объектов
  // { style, path } — по одному на каждый из 4 сгенерированных дизайнов карточки.
  ['final_paths_json', "ALTER TABLE orders ADD COLUMN final_paths_json TEXT"],
  ['watermarked_paths_json', "ALTER TABLE orders ADD COLUMN watermarked_paths_json TEXT"],
  // delivered = 1, если бот уже отправил все 4 карточки пользователю в чат
  // (нужно, чтобы не отправлять их повторно при каждом опросе статуса оплаты)
  ['delivered', "ALTER TABLE orders ADD COLUMN delivered INTEGER DEFAULT 0"],
  // product_copy_json хранит {title, description, bullets} — текст карточки
  // (название, продающее описание, буллеты характеристик), сгенерированный ИИ
  ['product_copy_json', "ALTER TABLE orders ADD COLUMN product_copy_json TEXT"],
];
for (const [column, sql] of migrations) {
  if (!existingColumns.has(column)) db.exec(sql);
}

export function upsertUser({ telegramId, username, tonAddress }) {
  db.prepare(`
    INSERT INTO users (telegram_id, username, ton_address)
    VALUES (@telegramId, @username, @tonAddress)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      ton_address = COALESCE(excluded.ton_address, users.ton_address)
  `).run({ telegramId, username: username || null, tonAddress: tonAddress || null });
}

export function createOrder({ id, telegramId, originalPath }) {
  db.prepare(`
    INSERT INTO orders (id, telegram_id, status, original_path)
    VALUES (?, ?, 'created', ?)
  `).run(id, telegramId, originalPath);
}

export function updateOrder(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE orders SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...fields, id });
}

export function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

// Достаёт из заказа распарсенные массивы вариантов карточки
export function getOrderVariants(order) {
  return {
    finalPaths: order.final_paths_json ? JSON.parse(order.final_paths_json) : [],
    watermarkedPaths: order.watermarked_paths_json ? JSON.parse(order.watermarked_paths_json) : [],
  };
}

// Атомарно помечает заказ доставленным — возвращает true, только если ИМЕННО
// этот вызов перевёл флаг из 0 в 1 (защита от повторной отправки карточек,
// если статус-эндпоинт дёрнут почти одновременно несколько раз подряд).
export function markDeliveredOnce(id) {
  const result = db.prepare(`UPDATE orders SET delivered = 1 WHERE id = ? AND delivered = 0`).run(id);
  return result.changes === 1;
}

export default db;
