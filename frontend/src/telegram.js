// telegram.js — тонкая обёртка над window.Telegram.WebApp

export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function initTelegram() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand(); // раскрыть Mini App на весь экран
}

// initData — подписанная строка, которую backend проверяет на подлинность
export function getInitData() {
  const tg = getTelegramWebApp();
  return tg?.initData || '';
}

export function getTelegramUser() {
  const tg = getTelegramWebApp();
  return tg?.initDataUnsafe?.user || null;
}

export function hapticSuccess() {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('success');
}

export function hapticError() {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('error');
}
