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

// Открывает t.me-ссылку (например, чат поддержки) — внутри Telegram через
// нативный метод openTelegramLink, а в обычном браузере (например, при
// локальной разработке) — просто в новой вкладке.
export function openTelegramLink(url) {
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}
