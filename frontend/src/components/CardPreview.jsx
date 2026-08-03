import React from 'react';
import { absoluteUrl } from '../api.js';

export default function CardPreview({ previewUrls, labels, onPay, onBack }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-tg-hint transition hover:text-tg-text"
      >
        ← Назад
      </button>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">Карточки готовы</h2>
        <p className="mt-1 text-sm text-tg-hint">
          Превью с водяным знаком. Чтобы скачать без него — оплатите доступ.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {previewUrls.map((url, index) => (
          <div key={url} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg">
            <img
              src={absoluteUrl(url)}
              alt={`Карточка: ${labels?.[index] || `вариант ${index + 1}`}`}
              className="w-full"
            />
            <div className="px-3 py-2 text-center text-xs font-medium text-tg-hint">
              {labels?.[index] || `Вариант ${index + 1}`}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onPay}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98]"
      >
        Оплатить и получить все карточки
      </button>
    </div>
  );
}
