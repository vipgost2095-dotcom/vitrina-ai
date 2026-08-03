// i18n.js — простой словарь переводов интерфейса. Никаких библиотек — обычный
// объект + функции для строк с параметрами (название, число и т.п.).

export const STRINGS = {
  ru: {
    appTitle: 'ВитринаAI',
    appSubtitle: 'Карточки товара за пару минут, с фоном от ИИ',

    walletHintConnected: (addr) => `Подключён кошелёк: ${addr}`,
    walletHintNotConnected: 'Кошелёк нужен только для оплаты TON/USDT (для Stars не нужен)',

    uploadTitle: 'Фото товара',
    uploadSubtitle: 'Загрузите фото — ИИ уберёт фон и нарисует новый',
    uploadPlaceholder: 'Нажмите, чтобы выбрать фото',

    descriptionLabel: 'Опишите желаемый фон/стиль',
    descriptionOptional: '(необязательно)',
    descriptionPlaceholder: 'Например: премиум чёрный фон с золотыми акцентами, или пастельный минимализм',

    sizeLabel: 'Размер карточки, px',
    sizeWidth: 'Ширина',
    sizeHeight: 'Высота',

    submitLoading: 'Генерируем карточки…',
    submitIdle: 'Создать карточки',

    previewBack: '← Назад',
    previewTitle: 'Карточки готовы',
    previewSubtitle: 'Превью с водяным знаком. Чтобы скачать без него — оплатите доступ.',
    variant: (n) => `Вариант ${n}`,

    aiCopyTitle: '✨ Текст карточки от ИИ',
    aiCopySubtitle: 'Готово для вставки в описание товара на площадке',
    copy: 'Копировать',
    copied: 'Скопировано',

    payButton: 'Оплатить и получить все карточки',

    paymentMethodTitle: 'Способ оплаты',
    waitingStars: 'Ждём подтверждение оплаты от Telegram…',
    waitingTon: 'Ждём подтверждение транзакции в блокчейне TON…',
    payVia: (label) => `Оплатить через ${label}`,
    sendingPayment: 'Открываем оплату…',
    checkingPayment: 'Проверяем оплату…',
    connectWalletFirst: 'Сначала подключите TON-кошелёк',
    starsNotCompleted: 'Оплата Stars не была завершена',
    timeoutError: 'Не удалось подтвердить оплату за отведённое время. Попробуйте ещё раз.',

    paidTitle: 'Оплата подтверждена',
    paidSubtitle: 'Карточки уже отправлены вам в чат с ботом. Также можно скачать их здесь:',
    downloadOne: (label) => `Скачать: ${label}`,
    downloadZip: 'Скачать все карточки (zip)',
    downloadText: 'Скачать текст карточки (txt)',
  },

  en: {
    appTitle: 'VitrinaAI',
    appSubtitle: 'Product cards in a couple of minutes, with an AI-generated background',

    walletHintConnected: (addr) => `Wallet connected: ${addr}`,
    walletHintNotConnected: 'Wallet is only needed for TON/USDT payment (not required for Stars)',

    uploadTitle: 'Product photo',
    uploadSubtitle: 'Upload a photo — AI will remove the background and draw a new one',
    uploadPlaceholder: 'Tap to choose a photo',

    descriptionLabel: 'Describe the background/style you want',
    descriptionOptional: '(optional)',
    descriptionPlaceholder: 'E.g.: premium black background with gold accents, or pastel minimalism',

    sizeLabel: 'Card size, px',
    sizeWidth: 'Width',
    sizeHeight: 'Height',

    submitLoading: 'Generating cards…',
    submitIdle: 'Create cards',

    previewBack: '← Back',
    previewTitle: 'Cards are ready',
    previewSubtitle: 'Preview with a watermark. Pay to download without it.',
    variant: (n) => `Variant ${n}`,

    aiCopyTitle: '✨ AI-written card text',
    aiCopySubtitle: 'Ready to paste into the product description on the marketplace',
    copy: 'Copy',
    copied: 'Copied',

    payButton: 'Pay and get all cards',

    paymentMethodTitle: 'Payment method',
    waitingStars: 'Waiting for payment confirmation from Telegram…',
    waitingTon: 'Waiting for transaction confirmation on the TON blockchain…',
    payVia: (label) => `Pay with ${label}`,
    sendingPayment: 'Opening payment…',
    checkingPayment: 'Checking payment…',
    connectWalletFirst: 'Please connect a TON wallet first',
    starsNotCompleted: 'Stars payment was not completed',
    timeoutError: 'Could not confirm payment in time. Please try again.',

    paidTitle: 'Payment confirmed',
    paidSubtitle: 'All cards have already been sent to you in the bot chat. You can also download them here:',
    downloadOne: (label) => `Download: ${label}`,
    downloadZip: 'Download all cards (zip)',
    downloadText: 'Download card text (txt)',
  },
};

export function getStrings(lang) {
  return STRINGS[lang] || STRINGS.ru;
}
