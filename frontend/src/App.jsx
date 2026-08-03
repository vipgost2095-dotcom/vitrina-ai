import React, { useEffect, useState } from 'react';
import { initTelegram } from './telegram.js';
import WalletConnect from './components/WalletConnect.jsx';
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

export default function App() {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [orderId, setOrderId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [styles, setStyles] = useState([]);
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    initTelegram();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-4 text-center">
        <h1 className="text-xl font-bold">🖼️ ВитринаAI</h1>
        <p className="text-xs text-tg-hint">Карточки под Wildberries, Ozon и другие площадки за пару минут</p>
      </header>

      <main className="flex-1">
        {step === STEPS.UPLOAD && (
          <>
            <WalletConnect />
            <UploadForm
              onUploaded={(id, urls, uploadedStyles, uploadedLabels) => {
                setOrderId(id);
                setPreviewUrls(urls);
                setStyles(uploadedStyles);
                setLabels(uploadedLabels);
                setStep(STEPS.PREVIEW);
              }}
            />
          </>
        )}

        {step === STEPS.PREVIEW && (
          <CardPreview
            previewUrls={previewUrls}
            labels={labels}
            onPay={() => setStep(STEPS.PAYMENT)}
          />
        )}

        {step === STEPS.PAYMENT && <PaymentScreen orderId={orderId} labels={labels} />}
      </main>
    </div>
  );
}
