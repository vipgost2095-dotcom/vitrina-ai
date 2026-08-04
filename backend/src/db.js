// db.js — работа с SQLite через better-sqlite3.
// Хранит пользователей (Telegram-аккаунт, TON-кошелёк, лимит бесплатных
// генераций, реферальная программа) и заказы (order = один процесс
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

// Простая миграция для баз, созданных до появления оплаты Stars/USDT/лимитов —
// добавляем недостающие колонки, если их ещё нет (better-sqlite3 не умеет
// "ADD COLUMN IF NOT EXISTS", поэтому проверяем вручную через pragma).
const existingOrderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name));
const orderMigrations = [
  ['payment_method', "ALTER TABLE orders ADD COLUMN payment_method TEXT"],
  ['stars_amount', "ALTER TABLE orders ADD COLUMN stars_amount INTEGER"],
  ['usdt_amount', "ALTER TABLE orders ADD COLUMN usdt_amount REAL"],
  ['telegram_payment_charge_id', "ALTER TABLE orders ADD COLUMN telegram_payment_charge_id TEXT"],
  ['final_paths_json', "ALTER TABLE orders ADD COLUMN final_paths_json TEXT"],
  ['watermarked_paths_json', "ALTER TABLE orders ADD COLUMN watermarked_paths_json TEXT"],
  ['delivered', "ALTER TABLE orders ADD COLUMN delivered INTEGER DEFAULT 0"],
  ['product_copy_json', "ALTER TABLE orders ADD COLUMN product_copy_json TEXT"],
  // discount_percent — скидка (0-10%), применённая к ЭТОМУ заказу при создании
  // платежа; храним именно тут, а не пересчитываем на лету, чтобы проверка
  // оплаты в блокчейне всегда сверялась с той суммой, которую реально попросили
  // заплатить, а не с "чистой" ценой без скидки.
  ['discount_percent', "ALTER TABLE orders ADD COLUMN discount_percent INTEGER DEFAULT 0"],
  // generation_progress/generation_step — реальный прогресс фоновой генерации
  // карточек (0-100%), чтобы фронтенд мог показать честный индикатор вместо
  // "нарисованной" анимации. Статус заказа при этом: created -> generating ->
  // generated -> ... Обновляются по ходу генерации (см. routes/upload.js).
  ['generation_progress', "ALTER TABLE orders ADD COLUMN generation_progress INTEGER DEFAULT 0"],
  ['generation_step', "ALTER TABLE orders ADD COLUMN generation_step TEXT"],
  // lifecycle_processed — защита от повторного выполнения "последствий оплаты"
  // (сброс лимита бесплатных генераций, реферальный бонус): GET /payment/status
  // вызывается при КАЖДОМ опросе, и без этого флага для уже оплаченного заказа
  // эти действия выполнялись бы повторно на каждый опрос, а не один раз.
  ['lifecycle_processed', "ALTER TABLE orders ADD COLUMN lifecycle_processed INTEGER DEFAULT 0"],
];
for (const [column, sql] of orderMigrations) {
  if (!existingOrderColumns.has(column)) db.exec(sql);
}

const existingUserColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
const userMigrations = [
  // free_generations_used — счётчик БЕСПЛАТНЫХ генераций пользователя за всё
  // время. Это ПОЖИЗНЕННЫЙ лимит (см. FREE_GENERATIONS_LIMIT в routes/user.js) —
  // оплата НЕ сбрасывает этот счётчик, после исчерпания лимита бесплатные
  // генерации больше не выдаются никогда. Единственный постоянный бонус за
  // активность — накопленная реферальная скидка на оплату (см. ниже).
  ['free_generations_used', "ALTER TABLE users ADD COLUMN free_generations_used INTEGER DEFAULT 0"],
  // referred_by — telegram_id того, кто пригласил этого пользователя (по
  // реферальной ссылке t.me/bot?start=ref_<id>). Ставится один раз, при первом
  // визите — COALESCE в setReferredBy не даёт переписать более позднему рефереру.
  ['referred_by', "ALTER TABLE users ADD COLUMN referred_by TEXT"],
  // referral_discount_percent — накопленная скидка (0-10%) за приглашённых
  // друзей, которые сделали свою первую оплату. Применяется к СОБСТВЕННЫМ
  // покупкам этого пользователя.
  ['referral_discount_percent', "ALTER TABLE users ADD COLUMN referral_discount_percent INTEGER DEFAULT 0"],
];
for (const [column, sql] of userMigrations) {
  if (!existingUserColumns.has(column)) db.exec(sql);
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

export function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

// Ставит referred_by только один раз (COALESCE не даёт перезаписать, если уже задано)
export function setReferredBy(telegramId, referrerId) {
  db.prepare(`UPDATE users SET referred_by = COALESCE(referred_by, ?) WHERE telegram_id = ?`)
    .run(String(referrerId), String(telegramId));
}

export function incrementFreeGenerations(telegramId) {
  db.prepare(`UPDATE users SET free_generations_used = free_generations_used + 1 WHERE telegram_id = ?`)
    .run(String(telegramId));
}

// Увеличивает накопленную реферальную скидку, не превышая maxPercent
export function incrementReferralDiscount(telegramId, bonusPercent, maxPercent) {
  db.prepare(`
    UPDATE users
    SET referral_discount_percent = MIN(?, referral_discount_percent + ?)
    WHERE telegram_id = ?
  `).run(maxPercent, bonusPercent, String(telegramId));
}

export function countPaidOrders(telegramId) {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE telegram_id = ? AND status = 'paid'`)
    .get(String(telegramId));
  return row.cnt;
}

// История генераций пользователя — только осмысленные статусы (пропускаем
// 'created'/'generating', пока ещё нечего показывать, и зависшие 'error').
// Самые новые — первыми.
export function getOrdersByUser(telegramId, limit = 20) {
  return db.prepare(`
    SELECT id, status, payment_method, amount_ton, usdt_amount, stars_amount,
           discount_percent, watermarked_paths_json, product_copy_json, created_at
    FROM orders
    WHERE telegram_id = ? AND status IN ('generated', 'awaiting_payment', 'paid')
    ORDER BY created_at DESC
    LIMIT ?
  `).all(String(telegramId), limit);
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

// Аналогичная атомарная защита, но для остальных "последствий оплаты"
// (сброс лимита генераций, реферальный бонус) — они не должны повторяться
// при каждом опросе статуса уже оплаченного заказа.
export function markLifecycleProcessedOnce(id) {
  const result = db.prepare(`UPDATE orders SET lifecycle_processed = 1 WHERE id = ? AND lifecycle_processed = 0`).run(id);
  return result.changes === 1;
}

export default db;
