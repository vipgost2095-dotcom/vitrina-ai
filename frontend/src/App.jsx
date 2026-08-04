import React, { useEffect, useState } from 'react';
import { initTelegram, openTelegramLink } from './telegram.js';
import { getStrings } from './i18n.js';
import { getUserStatus } from './api.js';
import WalletConnect from './components/WalletConnect.jsx';
import ReferralBlock from './components/ReferralBlock.jsx';
import UploadForm from './components/UploadForm.jsx';
import CardPreview from './components/CardPreview.jsx';
import PaymentScreen from './components/PaymentScreen.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import TermsScreen from './components/TermsScreen.jsx';
import ConsentScreen from './components/ConsentScreen.jsx';

// Основные шаги сценария: загрузить фото -> превью -> оплата (кошелёк
// подключается по желанию, только если выбран способ оплаты TON или USDT —
// см. PaymentScreen). HISTORY и TERMS — вспомогательные экраны, доступные
// по ссылкам в подвале экрана загрузки, возврат всегда идёт на UPLOAD.
const STEPS = {
  UPLOAD: 'upload',
  PREVIEW: 'preview',
  PAYMENT: 'payment',
  HISTORY: 'history',
  TERMS: 'terms',
};
const MAIN_STEP_ORDER = [STEPS.UPLOAD, STEPS.PREVIEW, STEPS.PAYMENT];
const SUPPORT_URL = 'https://t.me/WorldOfNamesSupport';

function getInitialLang() {
  try {
    const saved = window.localStorage?.getItem('vitrinaai_lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // localStorage может быть недоступен — просто используем язык по умолчанию
  }
  return 'ru';
}

// Согласие с условиями спрашиваем один раз — дальше запоминаем в localStorage,
// чтобы не переспрашивать при каждом открытии приложения.
function getInitialConsent() {
  try {
    return window.localStorage?.getItem('vitrinaai_terms_accepted') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [orderId, setOrderId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [productCopy, setProductCopy] = useState(null);
  const [hasProductCopy, setHasProductCopy] = useState(false);
  const [paymentOrigin, setPaymentOrigin] = useState(STEPS.PREVIEW); // куда вернуться кнопкой "назад" с экрана оплаты
  const [lang, setLang] = useState(getInitialLang);
  const [userStatus, setUserStatus] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(getInitialConsent);

  useEffect(() => {
    initTelegram();
    getUserStatus().then(setUserStatus).catch(() => {
      // не критично — просто не покажем блок с лимитом/скидкой сразу
    });
  }, []);

  function acceptTerms() {
    setTermsAccepted(true);
    try {
      window.localStorage?.setItem('vitrinaai_terms_accepted', '1');
    } catch {
      // не критично — просто придётся согласиться заново в следующий раз
    }
  }

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
  const isMainStep = MAIN_STEP_ORDER.includes(step);
  const stepIndex = MAIN_STEP_ORDER.indexOf(step);

  return (
    <div className="relative min-h-screen overflow-hidden bg-tg-bg text-tg-text">
      {/* декоративные фоновые пятна — не мешают контенту, просто добавляют глубины */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative flex min-h-screen flex-col">
        <header className="relative px-5 pb-4 pt-6 text-center">
          {termsAccepted && step !== STEPS.HISTORY && (
            <button
              onClick={() => setStep(STEPS.HISTORY)}
              className="absolute left-4 top-6 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-tg-hint transition hover:text-tg-text"
            >
              🕘 {t.footerHistoryLink}
            </button>
          )}

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

          {termsAccepted && isMainStep && (
            <div className="mx-auto mt-4 flex max-w-xs items-center gap-2">
              {MAIN_STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= stepIndex ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500' : 'bg-tg-hint/15'
                  }`}
                />
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 px-4 pb-6">
          {!termsAccepted ? (
            <ConsentScreen t={t} onAccept={acceptTerms} />
          ) : (
            <>
              {step === STEPS.UPLOAD && (
                <div className="flex flex-col gap-4">
                  <WalletConnect t={t} />
                  <ReferralBlock t={t} discountPercent={userStatus?.referralDiscountPercent} />
                  <UploadForm
                    t={t}
                    lang={lang}
                    status={userStatus}
                    onStatusChange={() => getUserStatus().then(setUserStatus).catch(() => {})}
                    onUploaded={(id, urls, uploadedStyles, uploadedLabels, uploadedCopy) => {
                      setOrderId(id);
                      setPreviewUrls(urls);
                      setProductCopy(uploadedCopy);
                      setHasProductCopy(!!uploadedCopy);
                      setPaymentOrigin(STEPS.PREVIEW);
                      setStep(STEPS.PREVIEW);
                    }}
                    onRequiresPayment={(id) => {
                      // Лимит бесплатных генераций исчерпан — карточек ещё нет,
                      // сразу ведём на оплату (генерация начнётся после неё).
                      setOrderId(id);
                      setPreviewUrls([]);
                      setProductCopy(null);
                      setHasProductCopy(false);
                      setPaymentOrigin(STEPS.UPLOAD);
                      setStep(STEPS.PAYMENT);
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
                  hasProductCopy={hasProductCopy}
                  discountPercent={userStatus?.referralDiscountPercent || 0}
                  onBack={() => setStep(paymentOrigin)}
                  onPaid={() => getUserStatus().then(setUserStatus).catch(() => {})}
                />
              )}

              {step === STEPS.HISTORY && (
                <HistoryScreen
                  t={t}
                  onBack={() => setStep(STEPS.UPLOAD)}
                  onSelectOrder={(id, orderHasProductCopy) => {
                    setOrderId(id);
                    setHasProductCopy(orderHasProductCopy);
                    setProductCopy(null); // полный текст карточки для истории не подгружаем — на экране оплаты он не нужен
                    setPaymentOrigin(STEPS.HISTORY);
                    setStep(STEPS.PAYMENT);
                  }}
                />
              )}

              {step === STEPS.TERMS && <TermsScreen t={t} onBack={() => setStep(STEPS.UPLOAD)} />}
            </>
          )}
        </main>

        {termsAccepted && step === STEPS.UPLOAD && (
          <footer className="flex items-center justify-center gap-4 px-4 pb-6 text-xs text-tg-hint">
            <button onClick={() => setStep(STEPS.TERMS)} className="underline underline-offset-2 hover:text-tg-text">
              {t.footerTermsLink}
            </button>
            <span className="opacity-30">•</span>
            <button onClick={() => openTelegramLink(SUPPORT_URL)} className="underline underline-offset-2 hover:text-tg-text">
              {t.footerSupportLink}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
