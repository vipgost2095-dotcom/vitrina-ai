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

    descriptionLabel: 'Опишите желаемый фон/стиль',
    descriptionOptional: '(необязательно)',
    descriptionPlaceholder: 'Например: премиум чёрный фон с золотыми акцентами, или пастельный минимализм',

    sizeLabel: 'Размер карточки, px',
    sizeWidth: 'Ширина',
    sizeHeight: 'Высота',

    stylePresetsLabel: 'Быстрый выбор стиля',
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

    textOnCardLabel: '📝 Текст на карточке',
    textOnCardOptional: '(необязательно)',
    textOnCardPlaceholder: 'Например: СКИДКА 50%',
    textStylePresetsLabel: 'Стиль и шрифт надписи',
    textStylePresetBold: 'Жирный',
    textStylePresetBoldHint: 'крупным жирным шрифтом без засечек',
    textStylePresetNeon: 'Неон',
    textStylePresetNeonHint: 'светящимся неоновым шрифтом',
    textStylePresetHandwritten: 'Рукописный',
    textStylePresetHandwrittenHint: 'изящным рукописным каллиграфическим шрифтом',
    textStylePresetGraffiti: 'Граффити',
    textStylePresetGraffitiHint: 'уличным шрифтом граффити с эффектом баллончика',
    textStylePresetElegant: 'Элегантный',
    textStylePresetElegantHint: 'тонким элегантным шрифтом с засечками, минимализм',

    sizePresetsLabel: 'Быстрый выбор размера',
    sizePresetSquare: 'Квадрат',
    sizePresetPortrait: 'Портрет',
    sizePresetStory: 'Сторис',

    referralTitle: '💸 Реферальная программа',
    referralSubtitle: (percent) => `Ваша скидка: ${percent}% — приглашайте друзей, скидка растёт до 10%`,
    referralCopyLink: 'Копировать ссылку',
    referralLinkCopied: 'Ссылка скопирована',

    freeGenerationsRemaining: (n, limit) => `Бесплатных генераций осталось: ${n} из ${limit}`,
    freeGenerationsLimitReached: 'Бесплатный лимит генераций исчерпан навсегда. Новые карточки создать нельзя, но можно оплатить и скачать без водяного знака любую из уже сделанных ранее — см. «История». Приглашайте друзей, чтобы получить скидку до 10% на оплату.',

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

    descriptionLabel: 'Describe the background/style you want',
    descriptionOptional: '(optional)',
    descriptionPlaceholder: 'E.g.: premium black background with gold accents, or pastel minimalism',

    sizeLabel: 'Card size, px',
    sizeWidth: 'Width',
    sizeHeight: 'Height',

    stylePresetsLabel: 'Quick style pick',
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

    textOnCardLabel: '📝 Text on the card',
    textOnCardOptional: '(optional)',
    textOnCardPlaceholder: 'E.g.: 50% OFF',
    textStylePresetsLabel: 'Text style and font',
    textStylePresetBold: 'Bold',
    textStylePresetBoldHint: 'large bold sans-serif font',
    textStylePresetNeon: 'Neon',
    textStylePresetNeonHint: 'glowing neon-style font',
    textStylePresetHandwritten: 'Handwritten',
    textStylePresetHandwrittenHint: 'elegant handwritten calligraphy font',
    textStylePresetGraffiti: 'Graffiti',
    textStylePresetGraffitiHint: 'street graffiti font with a spray-paint effect',
    textStylePresetElegant: 'Elegant',
    textStylePresetElegantHint: 'thin elegant serif font, minimalist',

    sizePresetsLabel: 'Quick size pick',
    sizePresetSquare: 'Square',
    sizePresetPortrait: 'Portrait',
    sizePresetStory: 'Story',

    referralTitle: '💸 Referral program',
    referralSubtitle: (percent) => `Your discount: ${percent}% — invite friends, discount grows up to 10%`,
    referralCopyLink: 'Copy link',
    referralLinkCopied: 'Link copied',

    freeGenerationsRemaining: (n, limit) => `Free generations left: ${n} of ${limit}`,
    freeGenerationsLimitReached: 'Your free generation limit is used up for good. You can no longer create new cards, but you can still pay to download any of your previous ones without a watermark — see History. Invite friends to get up to 10% off.',

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
