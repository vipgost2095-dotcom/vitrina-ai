import React, { useState } from 'react';
import { getTelegramUser, openTelegramLink } from '../telegram.js';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || '';
const MAX_DISCOUNT = 10;

export default function ReferralBlock({ t, discountPercent }) {
  const [copied, setCopied] = useState(false);
  const user = getTelegramUser();

  if (!BOT_USERNAME || !user?.id) return null; // нет данных для ссылки — просто не показываем блок

  const percent = discountPercent || 0;
  const progressWidth = Math.min(100, Math.round((percent / MAX_DISCOUNT) * 100));
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

  function shareLink() {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t.referralShareText)}`;
    openTelegramLink(shareUrl);
  }

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-xl backdrop-blur">
      {/* цветная шапка с иконкой — визуально перекликается с общим фиолетово-розовым брендингом приложения */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl backdrop-blur">
          🎁
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{t.referralTitle}</h3>
          <p className="text-xs text-white/80">{t.referralSubtitle(percent)}</p>
        </div>
      </div>

      <div className="p-4">
        <p className="text-xs leading-relaxed text-tg-hint">{t.referralDescription}</p>

        {/* прогресс-бар текущей скидки относительно потолка в 10% */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-tg-hint">
            <span>{t.referralProgressLabel(percent)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tg-hint/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-tg-hint transition hover:text-tg-text"
          >
            {copied ? t.referralLinkCopied : t.referralCopyLink}
          </button>
          <button
            onClick={shareLink}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-md"
          >
            {t.referralShareButton}
          </button>
        </div>
      </div>
    </div>
  );
}
