import React, { useState } from 'react';

export default function ConsentScreen({ t, onAccept }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">{t.consentTitle}</h2>
        <p className="mt-1 text-sm text-tg-hint">{t.consentSubtitle}</p>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h3 className="text-sm font-bold tracking-tight">{t.termsTitle}</h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-tg-hint">{t.termsBody}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-fuchsia-500"
        />
        <span className="text-sm">{t.consentCheckboxLabel}</span>
      </label>

      <button
        onClick={onAccept}
        disabled={!checked}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {t.consentContinueButton}
      </button>
    </div>
  );
}
