import React, { useState } from 'react';
import { getTelegramUser } from '../telegram.js';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || '';

export default function ReferralBlock({ t, discountPercent }) {
  const [copied, setCopied] = useState(false);
  const user = getTelegramUser();

  if (!BOT_USERNAME || !user?.id) return null; // нет данных для ссылки — просто не показываем блок

  const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер обмена может быть недоступен — тихо игнорируем
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-xl backdrop-blur">
      <h3 className="text-sm font-bold tracking-tight">{t.referralTitle}</h3>
      <p className="mt-1 text-xs text-tg-hint">{t.referralSubtitle(discountPercent || 0)}</p>
      <button
        onClick={copyLink}
        className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-tg-hint transition hover:text-tg-text"
      >
        {copied ? t.referralLinkCopied : t.referralCopyLink}
      </button>
    </div>
  );
}
