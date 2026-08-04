import React, { useEffect, useState } from 'react';
import { initTelegram } from './telegram.js';
import { getStrings } from './i18n.js';
import { getUserStatus } from './api.js';
import WalletConnect from './components/WalletConnect.jsx';
import ReferralBlock from './components/ReferralBlock.jsx';
import UploadForm from './components/UploadForm.jsx';
import CardPreview from './components/CardPreview.jsx';
import PaymentScreen from './components/PaymentScreen.jsx';

// Шаги сценария: загрузить фото -> превью -> оплата (кошелёк подключается
// по желанию, только если выбран способ оплаты TON или USDT — см. PaymentScreen)
const STEPS = {
  UPLOAD: 'upload',
  PREVIEW: 'preview',
  PAYMENT: 'payment',
};
const STEP_ORDER = [STEPS.UPLOAD, STEPS.PREVIEW, STEPS.PAYMENT];

function getInitialLang() {
  try {
    const saved = window.localStorage?.getItem('vitrinaai_lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // localStorage может быть недоступен — просто используем язык по умолчанию
  }
  return 'ru';
}

export default function App() {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [orderId, setOrderId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [labels, setLabels] = useState([]);
  const [productCopy, setProductCopy] = useState(null);
  const [lang, setLang] = useState(getInitialLang);
  const [userStatus, setUserStatus] = useState(null);

  useEffect(() => {
    initTelegram();
    getUserStatus().then(setUserStatus).catch(() => {
      // не критично — просто не покажем блок с лимитом/скидкой сразу
    });
  }, []);

  function toggleLang() {
    const next = lang === 'ru' ? 'en' : 'ru';
    setLang(next);
    try {
      window.localStorage?.setItem('vitrinaai_lang', next);
    } catch {
      // ничего страшного, если сохранить не получилось — просто не запомнится между визитами
    }
  }

  const t = getStrings(lang);
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="relative min-h-screen overflow-hidden bg-tg-bg text-tg-text">
      {/* декоративные фоновые пятна — не мешают контенту, просто добавляют глубины */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative flex min-h-screen flex-col">
        <header className="relative px-5 pb-4 pt-6 text-center">
          <button
            onClick={toggleLang}
            aria-label="Switch language"
            className="absolute right-4 top-6 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-tg-hint transition hover:text-tg-text"
          >
            {lang === 'ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
          </button>

          <h1 className="bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            {t.appTitle}
          </h1>
          <p className="mt-1 text-xs text-tg-hint">{t.appSubtitle}</p>

          <div className="mx-auto mt-4 flex max-w-xs items-center gap-2">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500' : 'bg-tg-hint/15'
                }`}
              />
            ))}
          </div>
        </header>

        <main className="flex-1 px-4 pb-10">
          {step === STEPS.UPLOAD && (
            <div className="flex flex-col gap-4">
              <WalletConnect t={t} />
              <ReferralBlock t={t} discountPercent={userStatus?.referralDiscountPercent} />
              <UploadForm
                t={t}
                status={userStatus}
                onStatusChange={() => getUserStatus().then(setUserStatus).catch(() => {})}
                onUploaded={(id, urls, uploadedStyles, uploadedLabels, uploadedCopy) => {
                  setOrderId(id);
                  setPreviewUrls(urls);
                  setLabels(uploadedLabels);
                  setProductCopy(uploadedCopy);
                  setStep(STEPS.PREVIEW);
                }}
              />
            </div>
          )}

          {step === STEPS.PREVIEW && (
            <CardPreview
              t={t}
              previewUrls={previewUrls}
              productCopy={productCopy}
              onPay={() => setStep(STEPS.PAYMENT)}
              onBack={() => setStep(STEPS.UPLOAD)}
            />
          )}

          {step === STEPS.PAYMENT && (
            <PaymentScreen
              t={t}
              orderId={orderId}
              hasProductCopy={!!productCopy}
              discountPercent={userStatus?.referralDiscountPercent || 0}
              onBack={() => setStep(STEPS.PREVIEW)}
              onPaid={() => getUserStatus().then(setUserStatus).catch(() => {})}
            />
          )}
        </main>
      </div>
    </div>
  );
}
