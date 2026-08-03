// telegramAuth.js — проверка подлинности данных, которые Mini App присылает
// в заголовке initData (Telegram.WebApp.initData на фронтенде).
// Без этой проверки любой мог бы подделать telegram_id и получать чужие заказы.

import crypto from 'node:crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;

/**
 * Проверяет подпись initData по алгоритму из документации Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // Строим data_check_string из отсортированных пар key=value
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = params.get('user');
  const user = userJson ? JSON.parse(userJson) : null;
  return user; // { id, username, first_name, ... } или null, если что-то не так
}

/**
 * Express-мидлвар: ожидает заголовок X-Telegram-Init-Data, кладёт req.telegramUser.
 * Если подпись невалидна — 401.
 */
export function requireTelegramAuth(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data');
  const user = verifyInitData(initData);

  if (!user) {
    // В деме/локальной разработке можно временно разрешить проход без подписи,
    // но в проде эту ветку обязательно убрать!
    if (process.env.NODE_ENV !== 'production' && req.header('X-Debug-Telegram-Id')) {
      req.telegramUser = { id: req.header('X-Debug-Telegram-Id'), username: 'debug' };
      return next();
    }
    return res.status(401).json({ error: 'Неверная или отсутствующая подпись Telegram initData' });
  }

  req.telegramUser = user;
  next();
}
