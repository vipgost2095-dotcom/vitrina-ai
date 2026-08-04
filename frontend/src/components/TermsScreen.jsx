import React from 'react';

export default function TermsScreen({ t, onBack }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-tg-hint transition hover:text-tg-text"
      >
        {t.previewBack}
      </button>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">{t.termsTitle}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-tg-hint">{t.termsBody}</p>
      </div>
    </div>
  );
}
