import React, { useState } from 'react';
import { uploadPhoto } from '../api.js';
import { hapticError } from '../telegram.js';

export default function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
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
      const result = await uploadPhoto(file);
      onUploaded(result.orderId, result.previewUrls, result.styles, result.labels);
    } catch (err) {
      hapticError();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <h2 className="text-lg font-semibold">Загрузите фото товара</h2>

      <label className="w-full max-w-sm cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-tg-button transition">
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {preview ? (
          <img src={preview} alt="Предпросмотр" className="mx-auto max-h-64 rounded-xl object-contain" />
        ) : (
          <span className="text-tg-hint">Нажмите, чтобы выбрать фото</span>
        )}
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full max-w-sm rounded-2xl bg-tg-button px-4 py-3 font-medium text-tg-buttonText disabled:opacity-50"
      >
        {loading ? 'Генерируем карточки под площадки…' : 'Создать карточки'}
      </button>
    </div>
  );
}
