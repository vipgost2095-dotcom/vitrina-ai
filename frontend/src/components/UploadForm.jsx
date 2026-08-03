import React, { useState } from 'react';
import { uploadPhoto } from '../api.js';
import { hapticError } from '../telegram.js';

export default function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await uploadPhoto(file, description);
      onUploaded(result.orderId, result.previewUrls, result.styles, result.labels);
    } catch (err) {
      hapticError();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <h2 className="text-lg font-bold tracking-tight">Фото товара</h2>
        <p className="mt-1 text-sm text-tg-hint">Загрузите фото — ИИ уберёт фон и нарисует новый</p>

        <label className="mt-4 block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-tg-hint/30 transition hover:border-tg-button">
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {preview ? (
            <img src={preview} alt="Предпросмотр" className="max-h-64 w-full object-contain p-2" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-tg-hint">
              <span className="text-3xl">📷</span>
              <span className="text-sm">Нажмите, чтобы выбрать фото</span>
            </div>
          )}
        </label>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur">
        <label className="text-sm font-semibold">Опишите желаемый фон/стиль <span className="font-normal text-tg-hint">(необязательно)</span></label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: премиум чёрный фон с золотыми акцентами, или пастельный минимализм"
          rows={3}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-2xl border border-tg-hint/20 bg-transparent p-3 text-sm outline-none placeholder:text-tg-hint/60 focus:border-tg-button"
        />
      </div>

      {error && (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/20 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {loading ? 'Генерируем карточки…' : 'Создать карточки'}
      </button>
    </div>
  );
}
