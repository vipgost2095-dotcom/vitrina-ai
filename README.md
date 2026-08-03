# TMA "Product Cards" — Telegram Mini App для генерации карточек товаров

Стек: Telegraf (бот) + Express/Node.js (бэкенд) + SQLite (better-sqlite3) +
React/Vite/Tailwind (фронтенд Mini App) + TonConnect (оплата в TON).

## 1. Архитектура проекта

```
tma-product-cards/
├── bot/                        # Telegram-бот (Telegraf) — только открывает Mini App
│   ├── package.json
│   └── index.js
│
├── backend/                    # Express API
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js            # точка входа, инициализация express, cors, rate-limit
│       ├── db.js                # better-sqlite3: users, orders
│       ├── telegramAuth.js      # проверка initData от Mini App (валидация подписи)
│       ├── photoProcessing.js   # генерация карточки + водяной знак (sharp), ЗАГЛУШКА под внешний API
│       ├── tonPayments.js       # создание платежа TonConnect + проверка транзакции через toncenter API
│       └── routes/
│           ├── upload.js        # POST /api/upload — приём фото, генерация превью с водяным знаком
│           ├── payment.js       # POST /api/payment/create, GET /api/payment/status/:orderId
│           └── download.js      # GET /api/download/:orderId — отдаёт файл без вотемарки после оплаты
│
├── frontend/                   # React + Vite + Tailwind + TonConnect UI
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── public/
│   │   └── tonconnect-manifest.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js               # обёртка над fetch к backend
│       ├── telegram.js          # обёртка над Telegram WebApp SDK
│       └── components/
│           ├── WalletConnect.jsx
│           ├── UploadForm.jsx
│           ├── CardPreview.jsx
│           └── PaymentScreen.jsx
│
└── README.md (этот файл)
```

## 2. Пошаговый план развёртывания

### Шаг 0. Подготовка
1. Создать бота через @BotFather → получить `BOT_TOKEN`.
2. В @BotFather: `/newapp` → привязать Mini App к боту, указать URL фронтенда
   (получите после деплоя фронтенда, см. шаг 3) → получаете короткое имя, ссылка вида
   `t.me/your_bot/appname`.
3. Завести TON-кошелёк администратора (Tonkeeper) — на его адрес будут приходить оплаты.
   Это `PAYMENT_RECEIVER_ADDRESS`.
4. Зарегистрироваться в TonConnect (свой манифест — см. `frontend/public/tonconnect-manifest.json`,
   его нужно будет разместить по публичному HTTPS-адресу фронтенда).
5. (Опционально) Получить API-ключ на https://toncenter.com/ (или https://tonapi.io/) —
   без ключа тоже работает, но с более низким rate-limit.
6. (Опционально) Получить API-ключ для генерации/обработки фото
   (remove.bg, Picsart, или любая генеративная нейросеть) — в коде отмечено место `// TODO: API_KEY`.

### Шаг 1. Backend
```bash
cd backend
npm install
cp .env.example .env
# заполнить .env (см. ниже)
npm run start
```
Backend поднимется на порту из `PORT` (по умолчанию 3001) и создаст файл БД
`data/app.db` автоматически при первом запуске.

### Шаг 2. Bot
```bash
cd bot
npm install
cp .env.example .env
# заполнить BOT_TOKEN и WEBAPP_URL (URL фронтенда после деплоя)
npm run start
```

### Шаг 3. Frontend
```bash
cd frontend
npm install
npm run dev      # локальная разработка
npm run build    # прод-сборка в dist/
```
Задеплоить `dist/` на любой статический хостинг с HTTPS (Vercel/Netlify/Railway static/Cloudflare Pages —
обязательно HTTPS, Telegram Mini App не откроется по http).
Файл `public/tonconnect-manifest.json` должен быть доступен по адресу
`https://ваш-домен/tonconnect-manifest.json` — впишите туда реальный домен.

### Шаг 4. Деплой на Railway (рекомендуемый вариант, 3 сервиса в одном проекте)
Аналогично уже отработанной схеме: один Railway-проект, три сервиса —
1. `bot` (Telegraf, long polling) — Root Directory: `/bot`
2. `backend` (Express) — Root Directory: `/backend`, обязательно `app.set('trust proxy', 1)`
   (за прокси Railway rate-limit иначе падает с ошибкой).
3. `frontend` (статика после `npm run build`, либо через `vite preview` / `serve dist`) —
   Root Directory: `/frontend`.

Для каждого сервиса — свои переменные окружения (см. `.env.example` в каждой папке).
Backend'у нужен постоянный Volume, смонтированный в `DATA_DIR` (например `/data`),
иначе SQLite-файл и загруженные фото пропадут при передеплое.
⚠️ При создании Mount Path вручную с телефона — вводите путь **латинскими** буквами,
визуально похожая кириллическая буква в пути ломает персистентность без явной ошибки.

### Шаг 5. Проверка сквозного сценария
1. Открыть бота → кнопка "Открыть приложение".
2. Загрузить фото товара → бэкенд возвращает 4 превью с водяным знаком.
3. На экране оплаты выбрать способ:
   - **TON/USDT** — сначала подключить кошелёк (TonConnect), затем подтвердить
     транзакцию в кошельке;
   - **Stars** — кошелёк не нужен, откроется нативный экран оплаты Telegram.
4. Дождаться подтверждения — фронтенд поллит `GET /api/payment/status/:orderId`
   (для TON/USDT бэкенд проверяет блокчейн через toncenter, для Stars —
   статус выставляет бот через `/api/internal/mark-paid`).
5. После статуса `paid` — все 4 карточки без водяного знака приходят в чат
   с ботом и доступны для скачивания в приложении (по отдельности или zip).

Рекомендуется проверить все три способа оплаты по очереди, и для USDT/TON —
сначала небольшими суммами, прежде чем выставлять сумму для реальных клиентов.

## Changelog: найденные и исправленные баги (полный аудит проекта)

При аудите всего проекта перед этим релизом нашлись и были исправлены:

1. **Порядок роутов в `download.js`** — `/final/:orderId/all.zip` был объявлен
   после `/final/:orderId/:index`, из-за чего Express матчил "all.zip" как
   значение параметра `:index`, и endpoint для скачивания zip-архива был
   недостижим. Специфичный роут теперь регистрируется первым.
2. **`forward_ton_amount` в USDT-переводе** был выставлен в 1 наноТОН —
   недостаточно, чтобы jetton-кошелёк переслал `transfer_notification`
   администратору, из-за чего бэкенд никогда не увидел бы оплату USDT.
   Увеличено до 0.02 TON.
3. **Обязательное подключение кошелька** блокировало вход в приложение для
   тех, кто хотел платить только Stars (кошелёк для этого не нужен). Шаг
   подключения кошелька стал необязательным — виден на экране загрузки фото,
   но не блокирует сценарий.
4. **Отсутствие централизованного обработчика ошибок** — ошибки multer
   (файл больше 15 МБ, не изображение) улетали фронтенду как HTML вместо
   JSON. Добавлен error-handling middleware в конце цепочки в `index.js`.
5. **Формат адресов для TonConnect** — адрес получателя и jetton-кошелёк
   передавались в user-friendly формате (UQ/EQ), хотя протокол TonConnect
   ожидает raw-формат (`workchain:hex`) в поле `messages[].address`.
   Переведено через `Address.parse(...).toRawString()`.
6. Мелкие правки: неверный путь в комментарии `starsPayments.js`, тексты
   кнопок/сообщений бота приведены к формулировке "4 карточки" вместо "карточка".

## Changelog: способы оплаты, 4 варианта карточки, доставка ботом

Из одного загруженного фото теперь генерируется **4 разных дизайна** карточки
(`backend/src/photoProcessing.js`, массив `CARD_STYLES`): минималистичный
светлый, тёмный "Premium" с золотой плашкой, яркий "Sale" и пастельный "New".
Каждый легко донастроить или добавить пятый — просто дополните массив
`CARD_STYLES` новым объектом с цветами градиента и текстом плашки.

Пользователь видит все 4 превью (с водяным знаком) ещё до оплаты. Как только
заказ переходит в статус `paid` (для любого способа оплаты — TON/USDT/Stars),
бэкенд **сам** отправляет все 4 финальных файла пользователю в чат с ботом
через Bot API `sendMediaGroup` (`backend/src/botDelivery.js`), плюс их можно
скачать в самом приложении — по отдельности или одним zip-архивом
(`GET /api/final/:orderId/all.zip`).

Повторная отправка исключена флагом `delivered` в БД (`markDeliveredOnce` в
`db.js`) — даже если статус-эндпоинт дёрнут несколько раз подряд, карточки
уйдут пользователю ровно один раз.

⚠️ Чтобы бэкенд смог написать пользователю в личку через `sendMediaGroup`,
пользователь должен был хотя бы раз написать боту `/start` — иначе Telegram
вернёт ошибку "chat not found" (в реальном сценарии это всегда так, ведь
именно через бота пользователь и открывает Mini App).

## Способы оплаты: TON, USDT, Telegram Stars

Приложение теперь поддерживает три способа оплаты — пользователь выбирает
кнопкой на экране оплаты.

### TON
Как и раньше: прямой перевод TON на `PAYMENT_RECEIVER_ADDRESS` с комментарием
= orderId, проверка — через toncenter `getTransactions`.

### USDT (jetton на TON)
USDT на TON — это jetton (TEP-74), а не нативная монета, поэтому перевод
устроен сложнее: TonConnect-транзакция отправляется не на адрес получателя,
а на **собственный jetton-кошелёк плательщика**, с вызовом метода `transfer`,
где получателем указан администратор. Бэкенд:
1. вычисляет адрес jetton-кошелька плательщика через `get_wallet_address`
   на jetton-мастере (эндпоинт `POST /api/payment/usdt-wallet`);
2. проверяет оплату через входящее `transfer_notification`-сообщение на
   основном кошельке администратора (`checkUsdtPaymentOnChain` в `tonPayments.js`).

⚠️ Перед продакшеном обязательно протестируйте сценарий на реальных
транзакциях (лучше сначала с маленькой суммой) — разные кошельки (Tonkeeper,
Telegram Wallet, MyTonWallet) могут чуть по-разному упаковывать
`forward_payload`, разбор в `checkUsdtPaymentOnChain` сделан по стандарту
TEP-74, но именно эту часть стоит перепроверить вручную.

Нужные .env-переменные бэкенда: `USDT_JETTON_MASTER_ADDRESS` (по умолчанию
адрес официального USDT на TON mainnet), `USDT_DECIMALS=6`,
`USDT_PAYMENT_AMOUNT`.

### Telegram Stars
Stars — это не блокчейн-платёж, а встроенная валюта Telegram. Схема другая:
1. Бэкенд создаёт ссылку на инвойс через Bot API `createInvoiceLink`
   (currency `XTR`), с `payload = orderId` (`starsPayments.js`).
2. Фронтенд открывает её нативным окном через
   `Telegram.WebApp.openInvoice(invoiceLink, callback)`.
3. Подтверждение приходит НЕ бэкенду напрямую, а **боту** — апдейтом
   `successful_payment`. Поэтому бот (`bot/index.js`) обязательно должен:
   - отвечать на `pre_checkout_query` (`answerPreCheckoutQuery(true)`) в
     течение 10 секунд, иначе Telegram сам отменит платёж;
   - при получении `successful_payment` вызвать внутренний эндпоинт
     бэкенда `POST /api/internal/mark-paid`, защищённый общим секретом
     `INTERNAL_API_SECRET` (должен совпадать в `bot/.env` и `backend/.env`).
4. Фронтенд как обычно поллит `GET /api/payment/status/:orderId`.

Нужные .env-переменные: у бэкенда — `STARS_PAYMENT_AMOUNT`,
`INTERNAL_API_SECRET`; у бота — `BACKEND_URL`, `INTERNAL_API_SECRET` (тот же).

Никаких дополнительных настроек в @BotFather для Stars не требуется — это
уже встроенная возможность Bot API, `provider_token` для Stars не нужен.

## О "1 GRAM"

GRAM как токен на TON не является широко доступным работающим jetton "из коробки" —
это имя тестового прототипа TON 2019 года, а не актуальный токен. Поэтому вместо
него пользователю предлагается выбор: TON, USDT или Telegram Stars (см. раздел
"Способы оплаты" выше). Если у вас всё же есть реальный jetton-адрес "GRAM" —
его легко подставить вместо USDT: в `tonPayments.js` логика
`getJettonWalletAddress` / `checkUsdtPaymentOnChain` универсальна для любого
TEP-74 jetton, достаточно поменять `USDT_JETTON_MASTER_ADDRESS` и
`USDT_DECIMALS` в `.env` (и, по-хорошему, переименовать переменные/эндпоинты
под ваш токен).
