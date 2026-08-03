import React from 'react';
import { absoluteUrl } from '../api.js';

const STYLE_LABELS = {
  minimal: 'Минимализм',
  dark_premium: 'Premium',
  bright_sale: 'Sale',
  pastel_new: 'New',
};

export default function CardPreview({ previewUrls, styles, onPay }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <h2 className="text-lg font-semibold">Готовы 4 варианта карточки</h2>
      <p className="text-sm text-tg-hint text-center">
        Это превью с водяным знаком. Чтобы скачать все 4 варианта без него — оплатите доступ.
      </p>

      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        {previewUrls.map((url, index) => (
          <div key={url} className="flex flex-col items-center gap-1">
            <img
              src={absoluteUrl(url)}
              alt={`Вариант карточки: ${styles?.[index] || index + 1}`}
              className="w-full rounded-xl shadow"
            />
            <span className="text-xs text-tg-hint">
              {STYLE_LABELS[styles?.[index]] || `Вариант ${index + 1}`}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onPay}
        className="w-full max-w-sm rounded-2xl bg-tg-button px-4 py-3 font-medium text-tg-buttonText"
      >
        Оплатить и получить все 4 карточки
      </button>
    </div>
  );
}
