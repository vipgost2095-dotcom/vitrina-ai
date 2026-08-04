import React, { useEffect, useRef, useState } from 'react';
import { startUpload, getGenerationStatus } from '../api.js';
import { hapticError, hapticSuccess } from '../telegram.js';
import { PALETTES, MOODS, TEXTURES, getTotalCombinations, composeStylePhrase, randomCombination } from '../styleLibrary.js';

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

export default function UploadForm({ t, lang, status, onUploaded, onStatusChange, onRequiresPayment }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  // Одно общее поле: и фон/стиль, и желаемый текст на карточке (со шрифтом/
  // стилем надписи, если хочется) пользователь описывает вместе, своими
  // словами — отдельного поля для текста больше нет.
  const [description, setDescription] = useState('');
  // Расширенный конструктор стиля: 10 палитр × 10 настроений × 5 текстур =
  // 500 комбинаций (см. styleLibrary.js), выбираемых за 1-3 тапа — каждый
  // выбор пересобирает description целиком.
  const [selectedPalette, setSelectedPalette] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [selectedTexture, setSelectedTexture] = useState(null);
  const [width, setWidth] = useState(DEFAULT_SIZE.width);
  const [height, setHeight] = useState(DEFAULT_SIZE.height);
  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStep, setProgressStep] = useState(null);
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  const labelIndex = lang === 'en' ? 1 : 0;

  function applyStyleSelection(palette, mood, texture) {
    setSelectedPalette(palette);
    setSelectedMood(mood);
    setSelectedTexture(texture);
    setDescription(composeStylePhrase(palette, mood, texture, lang));
  }

  function handlePaletteClick(item) {
    const next = selectedPalette?.[labelIndex] === item[labelIndex] ? null : item;
    applyStyleSelection(next, selectedMood, selectedTexture);
  }

  function handleMoodClick(item) {
    const next = selectedMood?.[labelIndex] === item[labelIndex] ? null : item;
    applyStyleSelection(selectedPalette, next, selectedTexture);
  }

  function handleTextureClick(item) {
    const next = selectedTexture?.[labelIndex] === item[labelIndex] ? null : item;
    applyStyleSelection(selectedPalette, selectedMood, next);
  }

  function handleRandomStyle() {
    const combo = randomCombination();
    applyStyleSelection(combo.palette, combo.mood, combo.texture);
  }

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
  // Фото теперь необязательно — достаточно текстового описания
  const hasAnyInput = !!file || description.trim().length > 0;

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
    if (!hasAnyInput) return;
    setLoading(true);
    setError(null);
    setProgressPercent(0);
    setProgressStep('queued');
    try {
      const result = await startUpload(file, description.trim(), clampSize(width), clampSize(height));
      if (result.requiresPayment) {
        // Бесплатный лимит исчерпан — карточки сгенерируются СРАЗУ ПОСЛЕ
        // оплаты (см. PaymentScreen), а не наоборот. Опрос прогресса
        // генерации в этом случае не нужен — сразу переходим к оплате.
        setLoading(false);
        onRequiresPayment?.(result.orderId);
        return;
      }
      pollGenerationStatus(result.orderId);
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
          rows={4}
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <label className="text-sm font-semibold">{t.extendedStyleLabel(getTotalCombinations())}</label>
            <p className="mt-0.5 text-xs text-tg-hint">{t.extendedStyleSubtitle}</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleRandomStyle}
            className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md disabled:opacity-50"
          >
            {t.randomStyleButton}
          </button>
        </div>

        <p className="mt-3 text-xs font-semibold text-tg-hint">{t.paletteLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PALETTES.map((item) => {
            const isSelected = selectedPalette?.[labelIndex] === item[labelIndex];
            return (
              <button
                key={item[0]}
                type="button"
                disabled={loading}
                onClick={() => handlePaletteClick(item)}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                  isSelected
                    ? 'border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white'
                    : 'border-white/10 bg-white/[0.05] text-tg-hint hover:text-tg-text'
                }`}
              >
                {item[labelIndex]}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs font-semibold text-tg-hint">{t.moodLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MOODS.map((item) => {
            const isSelected = selectedMood?.[labelIndex] === item[labelIndex];
            return (
              <button
                key={item[0]}
                type="button"
                disabled={loading}
                onClick={() => handleMoodClick(item)}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                  isSelected
                    ? 'border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white'
                    : 'border-white/10 bg-white/[0.05] text-tg-hint hover:text-tg-text'
                }`}
              >
                {item[labelIndex]}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs font-semibold text-tg-hint">{t.textureLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TEXTURES.map((item) => {
            const isSelected = selectedTexture?.[labelIndex] === item[labelIndex];
            return (
              <button
                key={item[0]}
                type="button"
                disabled={loading}
                onClick={() => handleTextureClick(item)}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                  isSelected
                    ? 'border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white'
                    : 'border-white/10 bg-white/[0.05] text-tg-hint hover:text-tg-text'
                }`}
              >
                {item[labelIndex]}
              </button>
            );
          })}
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
        disabled={!hasAnyInput || loading}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {loading ? `${stepLabel} ${progressPercent}%` : t.submitIdle}
      </button>
    </div>
  );
}
