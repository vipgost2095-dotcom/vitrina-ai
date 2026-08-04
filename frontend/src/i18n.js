// i18n.js — простой словарь переводов интерфейса. Никаких библиотек — обычный
// объект + функции для строк с параметрами (название, число и т.п.).

export const STRINGS = {
  ru: {
    appTitle: 'ВитринаAI',
    appSubtitle: 'Карточки товара за пару минут, с фоном от ИИ',

    walletHintConnected: (addr) => `Подключён кошелёк: ${addr}`,
    walletHintNotConnected: 'Кошелёк нужен только для оплаты TON/USDT (для Stars не нужен)',

    uploadTitle: 'Фото товара',
    uploadSubtitle: 'Загрузите фото — ИИ уберёт фон и нарисует новый. Фото необязательно: можно сгенерировать карточку только по описанию',
    uploadPlaceholder: 'Нажмите, чтобы выбрать фото (необязательно)',

    descriptionLabel: 'Опишите желаемый фон/стиль и/или текст на карточке',
    descriptionOptional: '(необязательно)',
    descriptionPlaceholder: 'Например: премиум чёрный фон с золотыми акцентами; или добавь текст "СКИДКА 50%" крупным неоновым шрифтом',

    sizeLabel: 'Размер карточки, px',
    sizeWidth: 'Ширина',
    sizeHeight: 'Высота',

    stylePresetsLabel: 'Быстрый выбор стиля',
    extendedStyleLabel: (n) => `🎨 Ещё больше стилей — ${n} комбинаций`,
    extendedStyleSubtitle: 'Выберите палитру, настроение и текстуру — соберём фразу автоматически',
    paletteLabel: 'Цветовая палитра',
    moodLabel: 'Настроение',
    textureLabel: 'Текстура/материал',
    randomStyleButton: '🎲 Случайный стиль',
    stylePresetMinimal: 'Минимализм',
    stylePresetMinimalText: 'минималистичный светлый фон, чистые линии, много воздуха',
    stylePresetLuxury: 'Люкс',
    stylePresetLuxuryText: 'премиальный чёрный фон с золотыми акцентами, роскошный вид',
    stylePresetBright: 'Яркий',
    stylePresetBrightText: 'яркий насыщенный цветной фон, динамичный и заметный',
    stylePresetNature: 'Природа',
    stylePresetNatureText: 'натуральные материалы, дерево и зелень, естественное освещение',
    stylePresetTech: 'Технологичный',
    stylePresetTechText: 'футуристичный технологичный фон, неоновые акценты, тёмные тона',
    stylePresetRetro: 'Ретро',
    stylePresetRetroText: 'ретро-стиль 80-х, тёплая плёночная цветокоррекция',

    sizePresetsLabel: 'Быстрый выбор размера',
    sizePresetSquare: 'Квадрат',
    sizePresetPortrait: 'Портрет',
    sizePresetStory: 'Сторис',

    referralTitle: 'Реферальная программа',
    referralDescription: 'Приглашайте друзей в ВитринаAI — за каждого, кто оплатит первую карточку, вы получаете +2% к своей скидке на оплату, максимум 10%',
    referralSubtitle: (percent) => `Ваша скидка: ${percent}%`,
    referralProgressLabel: (percent) => `${percent} из 10%`,
    referralCopyLink: 'Копировать',
    referralLinkCopied: 'Скопировано',
    referralShareButton: 'Поделиться',
    referralShareText: 'Генерирую крутые карточки товаров с ИИ в ВитринаAI — попробуй тоже, по ссылке скидка 👇',

    freeGenerationsRemaining: (n, limit) => `Бесплатных генераций осталось: ${n} из ${limit}`,
    freeGenerationsLimitReached: 'Бесплатный лимит из 3 генераций исчерпан. Дальше — платно, как обычно: нажмите «Создать карточки», оплатите, и карточки сгенерируются сразу после оплаты. Приглашайте друзей, чтобы получить скидку до 10% на оплату.',

    submitLoading: 'Генерируем карточки…',
    submitIdle: 'Создать карточки',

    progressStepQueued: 'Готовим фото…',
    progressStepCutout: 'Вырезаем товар с фона…',
    progressStepPrepare: 'Готовим фото…',
    progressStepVariant1: 'Рисуем вариант 1 из 3…',
    progressStepVariant2: 'Рисуем вариант 2 из 3…',
    progressStepVariant3: 'Рисуем вариант 3 из 3…',
    progressStepWatermarking: 'Готовим превью…',
    progressStepCopywriting: 'Пишем текст карточки…',
    progressStepDone: 'Готово!',
    progressGenericError: 'Не удалось сгенерировать карточки. Попробуйте ещё раз.',

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
    paidGeneratingNote: 'Оплата получена, генерируем карточки — обычно занимает меньше минуты. Можно закрыть приложение, карточки придут в чат с ботом.',
    downloadOne: (label) => `Скачать: ${label}`,
    downloadZip: 'Скачать все карточки (zip)',
    downloadText: 'Скачать текст карточки (txt)',

    footerHistoryLink: 'История',
    footerTermsLink: 'Условия использования',
    footerSupportLink: 'Поддержка',

    historyTitle: 'История генераций',
    historySubtitle: 'Здесь все ваши карточки — можно вернуться и оплатить любую из неоплаченных',
    historyEmpty: 'Пока пусто — сгенерируйте первую карточку',
    historyPaid: 'Оплачено',
    historyUnpaid: 'Не оплачено',
    historyPayButton: 'Оплатить',
    historyError: 'Не удалось загрузить историю',

    termsTitle: 'Условия использования',
    termsBody:
      'Используя ВитринаAI, вы соглашаетесь со следующими условиями.\n\n' +
      '1. Характер услуги\n' +
      'ВитринаAI генерирует карточки товара с помощью искусственного интеллекта на основе загруженного вами фото и (по желанию) текстового описания. Результат — творческая интерпретация ИИ: сервис не гарантирует точное соответствие ожиданиям, отсутствие визуальных артефактов или ошибок, включая некорректный текст на изображении.\n\n' +
      '2. Ваш контент\n' +
      'Вы подтверждаете, что имеете право загружать фото, которые отправляете в сервис, и несёте ответственность за их содержание. Не загружайте изображения, нарушающие права третьих лиц или законодательство.\n\n' +
      '3. Бесплатные генерации и оплата\n' +
      'Сервис даёт ограниченное количество бесплатных генераций. Файлы без водяного знака становятся доступны после оплаты. Оплата принимается в TON, USDT (сеть TON) или Telegram Stars. Платежи в криптовалюте и Stars окончательны и возврату не подлежат, за исключением случаев, прямо предусмотренных законом.\n\n' +
      '4. Реферальная программа\n' +
      'Скидка начисляется за приглашённых пользователей, совершивших первую оплату, в размере и с ограничениями, указанными в приложении. Условия программы могут быть изменены.\n\n' +
      '5. Ограничение ответственности\n' +
      'Сервис предоставляется "как есть". Мы не несём ответственности за косвенные убытки, связанные с использованием сгенерированных материалов, включая их публикацию на маркетплейсах.\n\n' +
      '6. Изменения условий\n' +
      'Условия могут обновляться — актуальная версия всегда доступна в приложении.\n\n' +
      '7. Контакты\n' +
      'По вопросам обращайтесь в поддержку: @WorldOfNamesSupport.',

    consentTitle: 'Прежде чем начать',
    consentSubtitle: 'Пожалуйста, ознакомьтесь с условиями использования сервиса',
    consentCheckboxLabel: 'Я согласен с условиями использования',
    consentContinueButton: 'Продолжить',
  },

  en: {
    appTitle: 'VitrinaAI',
    appSubtitle: 'Product cards in a couple of minutes, with an AI-generated background',

    walletHintConnected: (addr) => `Wallet connected: ${addr}`,
    walletHintNotConnected: 'Wallet is only needed for TON/USDT payment (not required for Stars)',

    uploadTitle: 'Product photo',
    uploadSubtitle: 'Upload a photo — AI will remove the background and draw a new one. Photo is optional: you can generate a card from a description alone',
    uploadPlaceholder: 'Tap to choose a photo (optional)',

    descriptionLabel: 'Describe the background/style and/or text on the card',
    descriptionOptional: '(optional)',
    descriptionPlaceholder: 'E.g.: premium black background with gold accents; or add text "50% OFF" in large neon font',

    sizeLabel: 'Card size, px',
    sizeWidth: 'Width',
    sizeHeight: 'Height',

    stylePresetsLabel: 'Quick style pick',
    extendedStyleLabel: (n) => `🎨 Even more styles — ${n} combinations`,
    extendedStyleSubtitle: 'Pick a palette, mood and texture — we\'ll compose the phrase for you',
    paletteLabel: 'Color palette',
    moodLabel: 'Mood',
    textureLabel: 'Texture/material',
    randomStyleButton: '🎲 Random style',
    stylePresetMinimal: 'Minimal',
    stylePresetMinimalText: 'minimalist light background, clean lines, lots of negative space',
    stylePresetLuxury: 'Luxury',
    stylePresetLuxuryText: 'premium black background with gold accents, luxurious look',
    stylePresetBright: 'Bright',
    stylePresetBrightText: 'bright saturated colorful background, dynamic and eye-catching',
    stylePresetNature: 'Nature',
    stylePresetNatureText: 'natural materials, wood and greenery, natural lighting',
    stylePresetTech: 'Tech',
    stylePresetTechText: 'futuristic tech background, neon accents, dark tones',
    stylePresetRetro: 'Retro',
    stylePresetRetroText: '80s retro style, warm film color grading',

    sizePresetsLabel: 'Quick size pick',
    sizePresetSquare: 'Square',
    sizePresetPortrait: 'Portrait',
    sizePresetStory: 'Story',

    referralTitle: 'Referral program',
    referralDescription: 'Invite friends to VitrinaAI — for each one who pays for their first card, you get +2% off your own payments, up to 10% max',
    referralSubtitle: (percent) => `Your discount: ${percent}%`,
    referralProgressLabel: (percent) => `${percent} of 10%`,
    referralCopyLink: 'Copy',
    referralLinkCopied: 'Copied',
    referralShareButton: 'Share',
    referralShareText: 'Generating cool product photos with AI on VitrinaAI — try it too, discount inside 👇',

    freeGenerationsRemaining: (n, limit) => `Free generations left: ${n} of ${limit}`,
    freeGenerationsLimitReached: 'Your free limit of 3 generations is used up. From now on it\'s paid, as usual: tap "Create cards", pay, and the cards will be generated right after payment. Invite friends to get up to 10% off.',

    submitLoading: 'Generating cards…',
    submitIdle: 'Create cards',

    progressStepQueued: 'Preparing photo…',
    progressStepCutout: 'Removing background…',
    progressStepPrepare: 'Preparing photo…',
    progressStepVariant1: 'Drawing variant 1 of 3…',
    progressStepVariant2: 'Drawing variant 2 of 3…',
    progressStepVariant3: 'Drawing variant 3 of 3…',
    progressStepWatermarking: 'Preparing preview…',
    progressStepCopywriting: 'Writing card text…',
    progressStepDone: 'Done!',
    progressGenericError: 'Could not generate cards. Please try again.',

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
    paidGeneratingNote: 'Payment received, generating your cards — usually under a minute. You can close the app, cards will arrive in the bot chat.',
    downloadOne: (label) => `Download: ${label}`,
    downloadZip: 'Download all cards (zip)',
    downloadText: 'Download card text (txt)',

    footerHistoryLink: 'History',
    footerTermsLink: 'Terms of use',
    footerSupportLink: 'Support',

    historyTitle: 'Generation history',
    historySubtitle: 'All your cards are here — you can come back and pay for any unpaid one',
    historyEmpty: 'Nothing here yet — generate your first card',
    historyPaid: 'Paid',
    historyUnpaid: 'Unpaid',
    historyPayButton: 'Pay',
    historyError: 'Could not load history',

    termsTitle: 'Terms of use',
    termsBody:
      'By using VitrinaAI, you agree to the following terms.\n\n' +
      '1. Nature of the service\n' +
      'VitrinaAI generates product cards using artificial intelligence based on the photo you upload and (optionally) a text description. The result is an AI creative interpretation: the service does not guarantee an exact match to your expectations, absence of visual artifacts, or absence of errors, including incorrect text rendered on the image.\n\n' +
      '2. Your content\n' +
      'You confirm that you have the right to upload the photos you submit to the service and are responsible for their content. Do not upload images that infringe on the rights of third parties or violate the law.\n\n' +
      '3. Free generations and payment\n' +
      'The service provides a limited number of free generations. Files without a watermark become available after payment. Payment is accepted in TON, USDT (TON network), or Telegram Stars. Cryptocurrency and Stars payments are final and non-refundable, except as expressly required by law.\n\n' +
      '4. Referral program\n' +
      'A discount is granted for referred users who complete their first payment, in the amount and subject to the limits shown in the app. The program terms may change.\n\n' +
      '5. Limitation of liability\n' +
      'The service is provided "as is". We are not liable for indirect losses related to the use of generated materials, including their publication on marketplaces.\n\n' +
      '6. Changes to these terms\n' +
      'Terms may be updated — the current version is always available in the app.\n\n' +
      '7. Contact\n' +
      'For questions, contact support: @WorldOfNamesSupport.',

    consentTitle: 'Before you start',
    consentSubtitle: 'Please review the terms of use for this service',
    consentCheckboxLabel: 'I agree to the terms of use',
    consentContinueButton: 'Continue',
  },
};

export function getStrings(lang) {
  return STRINGS[lang] || STRINGS.ru;
}
