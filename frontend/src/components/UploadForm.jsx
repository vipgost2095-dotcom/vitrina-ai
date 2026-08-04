import React, { useEffect, useRef, useState } from 'react';
import { startUpload, getGenerationStatus } from '../api.js';
import { hapticError, hapticSuccess } from '../telegram.js';

const DEFAULT_SIZE = { width: 1000, height: 1000 };
const MIN_SIZE = 200;
const MAX_SIZE = 2048;
const POLL_INTERVAL_MS = 1200;

const STEP_LABEL_KEYS = {
  queued: 'progressStepQueued',
  prepare: 'progressStepPrepare',
  cutout: 'progressStepCutout',
  variant1: 'progressStepVariant1',
  variant2: 'progressStepVariant2',
  variant3: 'progressStepVariant3',
  watermarking: 'progressStepWatermarking',
  copywriting: 'progressStepCopywriting',
  done: 'progressStepDone',
};

export default function UploadForm({ t, status, onUploaded, onStatusChange }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState('');
  const [width, setWidth] = useState(DEFAULT_SIZE.width);
  const [height, setHeight] = useState(DEFAULT_SIZE.height);
  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStep, setProgressStep] = useState(null);
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  const stylePresets = [
    [t.stylePresetMinimal, t.stylePresetMinimalText],
    [t.stylePresetLuxury, t.stylePresetLuxuryText],
    [t.stylePresetBright, t.stylePresetBrightText],
    [t.stylePresetNature, t.stylePresetNatureText],
    [t.stylePresetTech, t.stylePresetTechText],
    [t.stylePresetRetro, t.stylePresetRetroText],
  ];

  const sizePresets = [
    [t.sizePresetSquare, 1000, 1000],
    [t.sizePresetPortrait, 1080, 1350],
    [t.sizePresetStory, 1080, 1920],
  ];

  const limitReached = status && status.freeGenerationsRemaining <= 0;

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  function clampSize(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return DEFAULT_SIZE.width;
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
  }

  function pollGenerationStatus(orderId) {
    pollTimer.current = setInterval(async () => {
      try {
        const result = await getGenerationStatus(orderId);
        setProgressPercent(result.progressPercent ?? 0);
        setProgressStep(result.step ?? null);

        if (result.status === 'generated') {
          clearInterval(pollTimer.current);
          hapticSuccess();
          setLoading(false);
          onUploaded(orderId, result.previewUrls, result.styles, result.labels, result.productCopy);
          onStatusChange?.(); // сигнал родителю: перезапросить актуальный статус (лимит генераций обновился на бэкенде)
        } else if (result.status === 'error') {
          clearInterval(pollTimer.current);
          hapticError();
          setLoading(false);
          setError(t.progressGenericError);
        }
      } catch (err) {
        // Разовая сетевая ошибка не должна прерывать опрос — попробуем на следующем тике
        console.warn('Ошибка при опросе статуса генерации:', err);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit() {
    if (!file || limitReached) return;
    setLoading(true);
    setError(null);
    setProgressPercent(0);
    setProgressStep('queued');
    try {
      const { orderId } = await startUpload(file, description, clampSize(width), clampSize(height));
      pollGenerationStatus(orderId);
    } catch (err) {
      hapticError();
      setError(err.message);
      setLoading(false);
    }
  }

  const stepLabel = progressStep && STEP_LABEL_KEYS[progressStep] ? t[STEP_LABEL_KEYS[progressStep]] : t.submitLoading;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      {status && (
        <p className={`text-center text-xs ${limitReached ? 'text-red-400' : 'text-tg-hint'}`}>
          {limitReached
            ? t.freeGenerationsLimitReached
            : t.freeGenerationsRemaining(status.freeGenerationsRemaining, status.freeGenerationsLimit)}
        </p>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">{t.uploadTitle}</h2>
        <p className="mt-1 text-sm text-tg-hint">{t.uploadSubtitle}</p>

        <label className="mt-4 block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-tg-hint/30 transition hover:border-tg-button">
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={loading} />
          {preview ? (
            <img src={preview} alt="Предпросмотр" className="max-h-64 w-full object-contain p-2" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-tg-hint">
              <span className="text-3xl">📷</span>
              <span className="text-sm">{t.uploadPlaceholder}</span>
            </div>
          )}
        </label>
      </div>

      {loading && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tg-hint">{stepLabel}</span>
            <span className="text-sm font-bold tabular-nums">{progressPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-tg-hint/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <label className="text-sm font-semibold">
          {t.descriptionLabel} <span className="font-normal text-tg-hint">{t.descriptionOptional}</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.descriptionPlaceholder}
          rows={3}
          maxLength={500}
          disabled={loading}
          className="mt-2 w-full resize-none rounded-2xl border border-tg-hint/20 bg-transparent p-3 text-sm outline-none placeholder:text-tg-hint/60 focus:border-tg-button disabled:opacity-50"
        />

        <p className="mt-3 text-xs font-semibold text-tg-hint">{t.stylePresetsLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {stylePresets.map(([label, text]) => (
            <button
              key={label}
              type="button"
              disabled={loading}
              onClick={() => setDescription(text)}
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-tg-hint transition hover:text-tg-text disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <label className="text-sm font-semibold">{t.sizeLabel}</label>
        <div className="mt-2 flex gap-3">
          <div className="flex-1">
            <span className="text-xs text-tg-hint">{t.sizeWidth}</span>
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={width}
              disabled={loading}
              onChange={(e) => setWidth(e.target.value)}
              className="mt-1 w-full rounded-xl border border-tg-hint/20 bg-transparent p-2.5 text-sm outline-none focus:border-tg-button disabled:opacity-50"
            />
          </div>
          <div className="flex-1">
            <span className="text-xs text-tg-hint">{t.sizeHeight}</span>
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={height}
              disabled={loading}
              onChange={(e) => setHeight(e.target.value)}
              className="mt-1 w-full rounded-xl border border-tg-hint/20 bg-transparent p-2.5 text-sm outline-none focus:border-tg-button disabled:opacity-50"
            />
          </div>
        </div>

        <p className="mt-3 text-xs font-semibold text-tg-hint">{t.sizePresetsLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sizePresets.map(([label, w, h]) => (
            <button
              key={label}
              type="button"
              disabled={loading}
              onClick={() => {
                setWidth(w);
                setHeight(h);
              }}
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-tg-hint transition hover:text-tg-text disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || loading || limitReached}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {loading ? `${stepLabel} ${progressPercent}%` : t.submitIdle}
      </button>
    </div>
  );
}
