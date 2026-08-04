import React, { useEffect, useState } from 'react';
import { getHistory, absoluteUrl } from '../api.js';

export default function HistoryScreen({ t, onBack, onSelectOrder }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHistory()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message || t.historyError));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-tg-hint transition hover:text-tg-text"
      >
        {t.previewBack}
      </button>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">{t.historyTitle}</h2>
        <p className="mt-1 text-sm text-tg-hint">{t.historySubtitle}</p>
      </div>

      {error && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      {items && items.length === 0 && (
        <p className="text-center text-sm text-tg-hint">{t.historyEmpty}</p>
      )}

      <div className="flex flex-col gap-2">
        {items?.map((item) => (
          <div
            key={item.orderId}
            onClick={() => onSelectOrder(item.orderId, item.hasProductCopy)}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.06]"
          >
            {item.previewUrl ? (
              <img
                src={absoluteUrl(item.previewUrl)}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="h-14 w-14 shrink-0 rounded-xl bg-white/[0.05]" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-tg-hint">
                {new Date(item.createdAt).toLocaleString()}
              </p>
              <p className={`text-sm font-medium ${item.status === 'paid' ? 'text-emerald-400' : 'text-tg-hint'}`}>
                {item.status === 'paid' ? t.historyPaid : t.historyUnpaid}
              </p>
            </div>

            {item.status !== 'paid' && (
              <button
                onClick={() => onSelectOrder(item.orderId, item.hasProductCopy)}
                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-md"
              >
                {t.historyPayButton}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
