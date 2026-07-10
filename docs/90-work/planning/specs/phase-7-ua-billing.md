# SPEC: Phase 7 — український еквайринг (LiqPay + Plata by mono), Stripe у dormant

> **Last validated:** 2026-07-10 by @claude. **Next review:** 2026-10-08.
> **Status:** Scaffolded

<!-- Самодостатня спека. Виконавець (свіжа сесія) реалізує фічу, читаючи лише її +
названі файли + першоджерела в § «API-контракти». Owner-скіли: sergeant-server-api
(+ sergeant-data-and-migrations для міграції, sergeant-web-ui для web). Спершу
прочитай ці SKILL.md. Перед кодом провайдер-логіки — скіл read-the-damn-docs:
API monopay/LiqPay звірити з живою докою, не з памʼяті. -->

## Проблема

Stripe **не можна** оформити на український ФОП/ТОВ — Україна поза списком підтримуваних Stripe країн, а обхід через закордонну юрособу (Atlas LLC / Естонія) тягне КІК-податки й ускладнення. Власник вирішив приймати платежі **тільки на український ФОП напряму**. Отже Sergeant має продавати Pro (₴199/міс, рекурентно) через українські платіжні сервіси, не через Stripe.

Білінг у репо вже спроєктований мультипровайдерним (інтерфейс `BillingProvider` + resolver + migration 075, що дозволяє `liqpay`), але LiqPay — лише scaffold (усі методи кидають `NotImplementedError`), resolver навіть не підключений до routes (route-шар кличе Stripe напряму), а Plata by mono в коді немає зовсім.

## Мета

Український користувач на `/pricing` обирає провайдера (**LiqPay** або **Plata by mono**), проходить checkout, з нього списується ₴199, у `subscriptions` зʼявляється рядок `active` з правильним `provider`, щомісячне рекурентне списання й самостійне скасування (кнопка в застосунку) працюють end-to-end. Stripe-код лишається в репо, але **вимкнений** — resolver ніколи не пропонує його українцям. Обидва провайдери — у v1 паралельно.

**Definition of Done:** усі гейти § «Верифікація» зелені; обидва провайдери проходять sandbox click-through (checkout → webhook → active → рекурентне списання → cancel); контракт-триплет (Hard Rule #3) регенеровано; жоден секрет не в коді (Hard Rule #20/21).

## Рішення дизайну

- **Провайдери:** LiqPay **і** Plata by mono, **обидва в v1** паралельно. LiqPay = еквайринг ПриватБанку (scaffold `liqpay.ts` є); Plata = еквайринг monobank (продукт орієнтований на моно) — новий `plata.ts` з нуля за тим самим `BillingProvider`.
- **Вибір провайдера:** користувач обирає **на checkout** — дві кнопки. Тіло `POST /api/billing/checkout` розширюється полем `provider` (зараз лише `{ plan }`). Відкинуто: env-single-default (менш гнучко), A/B (передчасно).
- **Доля Stripe:** **dormant за флагом**. Код `stripe*.ts`, route `/api/billing/stripe-webhook`, env лишаються; `getEnabledProviders('UA')` повертає лише активні UA-провайдери, Stripe у список не потрапляє. Причина: легкий реверт, менший діф, наявні Stripe-тести не ламаються. Відкинуто: повне видалення.
- **Дві РІЗНІ моделі рекурентки** (ключове — визначає обсяг):
  - **LiqPay = провайдер-керована.** `action:subscribe, subscribe:1, subscribe_periodicity:month` → LiqPay сам щомісяця списує й шле callback `action:regular`. Ми лише обробляємо вхідні callback-и. Скасування — `action:unsubscribe`.
  - **Plata = самокерована (token-billing).** monopay НЕ має auto-subscribe. Перший платіж створюємо з `saveCardData:true` → отримуємо `walletId` + card-token у webhook. Далі **власний scheduler** щомісяця списує через `POST /api/merchant/wallet/payment` (по токену). Скасування = припинити scheduler + (опційно) видалити токен `DELETE /api/merchant/wallet/card`. Це вимагає: (а) зберігати токен зашифровано, (б) щоденний cron, що знаходить `subscriptions` з `current_period_end <= today` і `provider='plata'` та ініціює списання.
- **Скасування/керування:** **власна кнопка** (Settings → «Скасувати Pro»). Ні LiqPay, ні Plata не мають Customer Portal, як Stripe. Кнопка → `POST /api/billing/cancel` → `provider.cancelSubscription()` → LiqPay `unsubscribe` / Plata stop-scheduler. Семантика `cancel_at_period_end` — ADR-1.11; колонка `subscriptions.cancel_at_period_end BOOLEAN` **вже існує** (m056), нова міграція для неї не потрібна.
- **Період оплати: тільки місячний у v1.** Прайсинг (ADR-0068) містить і річний ₴1490/рік, але поточний Stripe-flow продає лише monthly (`STRIPE_PRICE_ID_PRO_MONTHLY`, `BillingCheckoutRequest` не має поля періоду) — тримаємо паритет. Річний тариф — окрема ітерація (обидва API це вміють: LiqPay `subscribe_periodicity:"year"`, Plata — scheduler з річним кроком). Якщо `/pricing` рекламує річний — прибрати/позначити «скоро» у цьому ж PR.
- **Контракт (Hard Rule #3):** `subscriptions.provider` enum росте (SQL CHECK, `ProviderId`, shared `BillingSubscription.provider` — зараз `z.literal("stripe")`) — усі рухаються разом + регенерація OpenAPI/типів + оновлення contract-тестів.
- **Гроші (Hard Rule #1):** ціна в env як **kopiykas: number** (`PRO_MONTHLY_UAH_KOPIYKAS=19900`). LiqPay `amount` — у **гривнях** (`199.00`, decimal) → конвертувати `kopiykas/100` на межі виклику. monopay `amount` — у **копійках** (`19900`, integer) → передавати як є, `ccy:980`. Ніколи не лікати bigint-string.
- **Reverse trial 7d — не чіпаємо.** 7-денний reverse-trial (Pro без картки, потім paywall) — на рівні доступу (`usePlan`/`TrialBanner`), не провайдера. Checkout настає при конверсії **після** trial → перший платіж одразу повний, без trial-періоду на боці провайдера (LiqPay `subscribe_date_start` = момент checkout). Виконавець МУСИТЬ звірити припущення з `apps/web/src/core/billing/` перед стартом.

## API-контракти провайдерів (звірено з першоджерелом)

> Звірити з живою докою (`read-the-damn-docs`) — API-версії дрейфують; нижче — baseline станом на 2026-07.

### LiqPay ([checkout](https://www.liqpay.ua/en/doc), [callback](https://www.liqpay.ua/en/doc/api/callback), [unsubscribe](https://www.liqpay.ua/documentation/en/api/aquiring/unsubscribe/doc))
- **Транспорт:** усюди пара `data` = `base64(JSON)`, `signature` = `base64(sha1(private_key + data + private_key))`. ⚠️ Частина доків згадує SHA3-256 — **звірити фактичну версію API акаунта** й зафіксувати в коді константою.
- **Checkout:** GET-link `https://www.liqpay.ua/api/3/checkout?data=…&signature=…` (повернути в `BillingCheckoutResponse.url`) або POST-форма на той самий endpoint.
- **Subscribe (JSON у `data`):** `version:3`, `public_key`, `action:"subscribe"`, `amount:199.00`, `currency:"UAH"`, `description`, `order_id` (унікальний, наш), `subscribe:1`, `subscribe_date_start:"YYYY-MM-DD HH:MM:SS"`, `subscribe_periodicity:"month"`, `server_url` (наш callback), `result_url` (redirect назад).
- **Server callback (POST form `data`+`signature`):** розпарсити `data`→JSON. Поля: `status`, `action` (`pay`/`subscribe`/`regular`/`unsubscribe`), `order_id`, `payment_id`, `transaction_id`, `amount`, `currency`. Статуси успіху: `success`, `subscribed`, `wait_secure` (pending); неуспіх: `failure`, `error`, `reversed`; тест: `sandbox`.
- **Unsubscribe (server-to-server):** POST `https://www.liqpay.ua/api/request` з `data`+`signature`, `action:"unsubscribe"`, `version:3`, `order_id`.
- **Status query:** POST `.../api/request`, `action:"status"`, `order_id`.

### Plata by mono / monopay ([acquiring API](https://api.monobank.ua/docs/acquiring.html), [en](https://monobank.ua/en/api-docs/acquiring))
- **Auth:** header `X-Token` (merchant token з кабінету моно-еквайрингу).
- **Create invoice:** `POST /api/merchant/invoice/create` — body: `amount` (kopiykas int), `ccy:980`, `merchantPaymInfo:{ reference, destination, basketOrder? }`, `redirectUrl`, `webHookUrl`, `validity` (сек), `paymentType:"debit"`, `saveCardData:{ saveCard:true, walletId }` (для токенізації). Відповідь: `invoiceId`, `pageUrl` (→ `BillingCheckoutResponse.url`).
- **Invoice status:** `GET /api/merchant/invoice/status?invoiceId=…`.
- **Webhook:** POST на `webHookUrl`, header **`X-Sign`** = ECDSA-підпис сирого body. Верифікація: `GET /api/merchant/pubkey` (кешувати), перевірити підпис проти raw body. Body: `invoiceId`, `status` (`created`/`processing`/`success`/`failure`/`reversed`/`expired`), `amount`, `ccy`, `walletData:{ cardToken, walletId }` (після успіху з `saveCard`).
- **Токенізований (рекурентний) платіж:** `POST /api/merchant/wallet/payment` — по `cardToken`, `initiationKind:"merchant"`, `amount`, `ccy:980`. Це наш scheduler кличе щомісяця.
- **Cancel/refund:** `POST /api/merchant/invoice/cancel` (повернення); токен: `DELETE /api/merchant/wallet/card`.
- **Токен зберігати зашифровано** — дзеркалити патерн `mono_connection.token_ciphertext` (m008: BYTEA + app-рівневе шифрування).

### `BillingCheckoutResponse.mode` (обидва провайдери)
Контракт вимагає `mode: "test" | "live"` (зараз Stripe виводить із префікса `sk_live_`). LiqPay: sandbox-ключі мають префікс `sandbox_` у `public_key` — виводити з нього. Plata: monopay не маркує токен — окремий env `PLATA_MODE` (`test`/`live`, default `test`) або виводити з наявності test-merchant; виконавець фіксує вибір у діфі.

## Поверхня змін

Перевірені шляхи (корінь репо). Owner-скіли: `sergeant-server-api`, `sergeant-data-and-migrations`, `sergeant-web-ui`.

### БД (міграції) — `sergeant-data-and-migrations`
- `apps/server/src/migrations/081_subscriptions_provider_plata.sql` (+ `.down`) — додати `'plata'` до `subscriptions_provider_check` (зараз `manual, stripe, apple, google, liqpay` після m075). Additive, two-phase не потрібен. У тій самій міграції розширити `billing_webhook_events_provider_check` (m072, зараз `apple|google`) на `liqpay|plata` (обрана dedup-таблиця — див. § Безпека).
- `apps/server/src/migrations/082_plata_card_token.sql` (+ `.down`) — зберігання monopay токена для рекурентки. Або нова таблиця `plata_card_token(user_id, wallet_id, card_token_ciphertext BYTEA, created_at)`, або колонки на `subscriptions`. Токен — **зашифрований BYTEA** (патерн m008). Виконавець фіксує вибір у діфі.

### Сервер — `sergeant-server-api`
- `apps/server/src/modules/billing/provider.ts` — `ProviderId` → `"stripe" | "liqpay" | "plata"`. Розширити `BillingProvider`: `cancelSubscription(pool, userId): Promise<void>`. Замінити `getProviderForCountry` (один id) на `getEnabledProviders(country): ProviderId[]` (для UI-кнопок; Stripe для UA відсутній) + `resolveProvider(id, country)` (валідує обраний).
- `apps/server/src/modules/billing/liqpay.ts` — замінити всі `NotImplementedError` на live (за § API-контракти): `createCheckoutSession` (subscribe-link), `verifyWebhookSignature` (sha1-формула, timing-safe compare), `processWebhook` (парс `data`, статуси→upsert, idempotent по `order_id`+`payment_id`), `getSubscriptionStatus` (читання з `subscriptions`, дзеркалить `stripe.ts`), `createCustomerPortalSession` (app-URL `…/settings?billing=manage`), `cancelSubscription` (`action:unsubscribe` + `cancel_at_period_end`).
- `apps/server/src/modules/billing/plata.ts` — **новий**, `BillingProvider` під monopay: `createCheckoutSession` (`invoice/create` з `saveCardData`), `verifyWebhookSignature` (ECDSA проти кешованого pubkey), `processWebhook` (зберегти `cardToken`/`walletId` зашифровано, upsert), `cancelSubscription` (stop-scheduler + del-token). Використати наявну crypto-утиліту шифрування (та, що шифрує `mono_connection.token_ciphertext`).
- `apps/server/src/modules/billing/plataScheduler.ts` — **новий**, self-scheduled рекурентка: функція `chargeDuePlataSubscriptions(pool)` знаходить `provider='plata'` з `current_period_end <= now()` і `status='active'` (та `cancel_at_period_end = FALSE`), кличе `/api/merchant/wallet/payment` по токену, оновлює `current_period_end`. **Планування — за наявним in-process poller-патерном** (шаблони: `apps/server/src/modules/webhooks/retentionPoller.ts`, `apps/server/src/modules/mono/enrichmentWorker.ts` — setInterval-воркер з graceful-stop і тестами), НЕ винаходити паралельний cron і НЕ спиратися на n8n (paused у проді). При неуспіху → dunning (нижче). Upsert-и по підписці мусять поважати унікальний partial-index `subscriptions_user_active_idx` (одна active/trialing/past_due row на юзера) — `ON CONFLICT` як у `stripeWebhook.ts`.
- `apps/server/src/modules/billing/stripe.ts` — обгорнути наявні функції у `stripeProvider: BillingProvider` (адаптер; логіку не переписувати).
- `apps/server/src/modules/billing/index.ts` — експортувати live `liqpayProvider`, `plataProvider`, `stripeProvider`, registry `Record<ProviderId, BillingProvider>`, `getEnabledProviders`.
- `apps/server/src/routes/billing.ts` — переписати з прямого Stripe на registry:
  - `POST /api/billing/checkout` — `provider` з тіла → `resolveProvider` → `registry[provider].createCheckoutSession`.
  - `GET /api/billing/status` — через `subscriptions` (уніфіковано).
  - `POST /api/billing/cancel` — **новий**, `requireSession` + rate-limit → `cancelSubscription`.
  - Webhook-и per-provider: лишити `/api/billing/stripe-webhook`; додати `/api/billing/liqpay-callback` (form `data`+`signature`) і `/api/billing/plata-webhook` (JSON + `X-Sign`). Кожен: verify → на mismatch `emitSecurityEvent` (як Stripe) + 400 → dedup → `processWebhook`. **Raw body** для обох (LiqPay form-urlencoded, monopay ECDSA над сирим body — не давати express.json перезаписати; повторити патерн `rawBody()` з наявного stripe-webhook).
- `apps/server/src/env/env.ts` — додати `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `PLATA_TOKEN`, `PLATA_ENABLED` (boolFromEnv false), `PRO_MONTHLY_UAH_KOPIYKAS` (number, 19900). `LIQPAY_ENABLED` вже є. Оновити `assertStartupEnv` (+ `__tests__/assertStartupEnv.test.ts`): коли провайдер enabled — його ключі обовʼязкові (fail-fast, як `STRIPE_PRICE_ID`).
- `apps/server/src/http/bodySizePolicy.ts` — зареєструвати нові webhook-шляхи в raw-body політиці (за прикладом `/api/billing/stripe-webhook`: kind `raw`, 128kb): `/api/billing/liqpay-callback` — `type: application/x-www-form-urlencoded` (LiqPay постить form), `/api/billing/plata-webhook` — `application/json` (ECDSA над сирими байтами). Без цього тіло перезапишеться до verify.
- `apps/server/src/modules/me/dataRights.ts` — **критично (ADR-0016):** `deleteUserData` зараз лише ставить `status='canceled'` у БД — **провайдер про це не знає**. Для `provider='liqpay'` LiqPay продовжить списувати з видаленого юзера; для `plata` лишається card-token (PII). Перед SQL-cancel викликати `provider.cancelSubscription()` (best-effort, не валити deletion на провайдер-помилці — залогувати) + видалити `plata_card_token` row у тій самій транзакції.
- `apps/server/src/routes/internal/billing.ts` — admin-cancel зараз чисто SQL (`SET status='canceled'`); з тієї ж причини пропустити його через `provider.cancelSubscription()` (або мінімум залишити `AI-DANGER`-маркер, що для liqpay/plata ручний SQL-cancel НЕ зупиняє списання).
- `apps/server/src/obs/` — метрики й security-events per provider (нижче § Observability).

### Контракт — `packages/shared` + `packages/api-client` (Hard Rule #3)
- `packages/shared/src/schemas/api.ts` — `BillingCheckoutRequestSchema`: `+ provider: z.enum(["liqpay","plata"])`. `BillingSubscription.provider`: `z.enum(["stripe","liqpay","plata"]).nullable()`. Схема `POST /api/billing/cancel` (req/resp). Опційно `GET /api/billing/providers` → `{ providers: ProviderId[] }` (для UI-кнопок; якщо додаєш — теж триплет).
- `packages/shared/src/openapi/{routes,registry}.ts` — зареєструвати нові/оновлені білінг-маршрути.
- `packages/api-client/src/endpoints/billing.ts` — `createCheckout(body з provider)`, `cancel()`, (опц.) `providers()`. Оновити `billing.test.ts`.
- Регенерація: `pnpm api:generate-openapi` + `pnpm api:generate-openapi-types`. Гейти: `pnpm api:check-openapi` + `pnpm api:check-openapi-types`.

### Web — `sergeant-web-ui`
- `apps/web/src/core/PricingPage.tsx` — вибір провайдера (дві кнопки LiqPay/Plata; список з `GET /api/billing/providers` або status), передати `provider` у `api.billing.createCheckout`.
- `apps/web/src/core/settings/PlanSection.tsx` — кнопка «Скасувати Pro» → confirm-dialog → `api.billing.cancel()` → інвалідувати `billingKeys`.
- `apps/web/src/shared/lib/api/queryKeys.ts` — `billingKeys` вже є (Hard Rule #2 — лише фабрика); додати ключ під providers за потреби.
- i18n `apps/web/src/shared/i18n/{uk,en}.ts` — рядки вибору провайдера + cancel. UA-copy за `docs/01-product/copy/style-guide.uk.md` (1-ша особа однини, `ти`). Design-конвенції (touch ≥44px, focus-visible, токени — Hard Rules #8-17).

## Безпека (best practices)

- **Signature verify — timing-safe.** Порівняння підписів через `crypto.timingSafeEqual`, не `===` (уникнути timing-oracle). LiqPay: sha1-hmac-стиль; Plata: ECDSA-verify проти кешованого pubkey (кеш з TTL, рефетч при зміні).
- **Idempotency.** Кожен вебхук — dedup по `(provider, event_id)` через `billing_webhook_events` (m072). Повторна доставка (retry провайдера) — silently skip, як наявний stripe-flow. `order_id`/`invoiceId` — природний ключ.
- **Raw body.** Не давати `express.json` перезаписати тіло до verify (обидва провайдери підписують сире тіло). Повторити наявний `rawBody()` патерн.
- **Secrets (Hard Rule #20/21).** `LIQPAY_PRIVATE_KEY`, `PLATA_TOKEN`, card-token — ніколи в лог/код/чат. Pino-redaction на нові поля. Live-ключі — лише Railway env, постачає власник.
- **Bad-sig → security event.** `emitSecurityEvent({ event: "<provider>_webhook_bad_sig", severity: "high" })` + 400, як наявний `stripe_webhook_bad_sig`.

## Rollout

- **Незалежні флаги:** `LIQPAY_ENABLED`, `PLATA_ENABLED` — вмикати по черзі. Спершу sandbox-ключі в preview, потім live у prod.
- **Порядок вмикання:** LiqPay (scaffold готовий, менший ризик) → Plata (новий модуль + scheduler). Обидва в одному PR, але прод-вмикання — послідовне через env, без редеплою коду.
- **Kill-switch:** якщо провайдер збоїть — `*_ENABLED=false` прибирає його з `getEnabledProviders`, кнопка зникає, наявні підписки не рвуться (webhook-и лишаються активними).
- **Dunning / past_due (ADR-1.12):** невдале рекурентне списання → `status='past_due'`, graceful degrade, ретраї N днів (LiqPay: власні retry; Plata: scheduler повторює), потім `canceled`. Мінімум для v1: перевести в `past_due` і не зривати доступ миттєво.

## Observability

- Метрики (наявний `apps/server/src/obs/metrics`): `billing_checkout_total{provider,result}`, `billing_webhook_total{provider,status}`, `billing_recurring_charge_total{provider,result}`.
- Security-events на bad-sig (вище).
- Structured log (Pino, redacted) на кожен провайдер-виклик: `order_id`/`invoiceId`, provider, status — без сум-як-PII і без токенів.

## Поза скоупом v1

- **Річний тариф ₴1490/рік** — v1 продає лише monthly (паритет з поточним Stripe-flow); річний — окрема ітерація (LiqPay `subscribe_periodicity:"year"` / Plata річний scheduler-крок). Якщо `/pricing` показує річну ціну — прибрати/«скоро» у цьому PR.
- **USD/EUR мультивалюта** — тільки ₴ (ADR-1.9).
- **Proration при зміні плану** — немає (єдиний Pro).
- **Міграція наявних Stripe-підписок** — чистий старт, не переносимо.
- **Apple/Google IAP** — окремий шлях.
- **Окрема `subscription_events` audit-таблиця** — dedup через `billing_webhook_events`; повний audit — follow-up (ADR-1.2).
- **Видалення Stripe-коду** — свідомо ні (dormant).
- **Retry-tuning dunning** — базовий `past_due` у v1; тонке налаштування ретраїв/листів — follow-up.

## Верифікація (обовʼязково)

### 1. Гейти (зелені)
```bash
pnpm install --frozen-lockfile          # ефемерний worktree без node_modules
pnpm --filter @sergeant/db-schema build
pnpm lint:migrations                     # 081/082 sequential, CHECK валідний
pnpm api:check-openapi && pnpm api:check-openapi-types   # контракт-триплет
pnpm --filter @sergeant/server test      # billing unit + webhook + provider + scheduler
pnpm --filter @sergeant/api-client test
pnpm --filter @sergeant/web test
pnpm check                               # повний CI-гейт
```
Очікування: typecheck ловить, що `provider` тепер enum (не `stripe`-only literal) в усіх споживачах.

### 2. Click-through (локальний стек, sandbox)
Передумови: `pnpm dev:db|dev:server|dev:web`; env sandbox `LIQPAY_*`+`LIQPAY_ENABLED=true`, `PLATA_*`+`PLATA_ENABLED=true`.
1. Логін → `/pricing`. Очікувано: дві кнопки (LiqPay, Plata).
2. **LiqPay:** кнопка → редірект на LiqPay checkout, сума **199,00 ₴** → оплата тест-картою → callback `/api/billing/liqpay-callback` (лог: signature verified). `subscriptions`: `provider='liqpay', status='active', plan='pro'`.
3. `/settings` → Pro активний. «Скасувати Pro» → confirm → `status` → `canceled`/`cancel_at_period_end`, Pro до `current_period_end`.
4. **Plata:** кнопка → monopay `pageUrl`, сума **19900 копійок** → оплата → webhook `/api/billing/plata-webhook` (валідний `X-Sign`) → `provider='plata'`, card-token збережено (зашифровано).
5. **Рекурентка Plata:** ручний прогін `chargeDuePlataSubscriptions` (виставити `current_period_end` у минуле) → успішне списання по токену → `current_period_end` зсунуто на місяць.
6. **Негатив:** підробити signature обох webhook-ів → 400 + security-event, `subscriptions` не змінюється; повторний вебхук (dedup) → skip без дублю.

### 3. Нові/оновлені тести (що ловлять)
- `liqpay.test.ts` — sha1-signature (валід/підроблений, timing-safe), `data`-парсинг, upsert по статусах (`subscribed`/`regular`/`failure`), unsubscribe.
- `plata.test.ts` — ECDSA-verify, invoice-mapping (kopiykas), збереження токена зашифровано, cancel.
- `plataScheduler.test.ts` — вибірка due-підписок, списання по токену, зсув періоду, past_due при відмові.
- `stripe`-адаптер — `stripeProvider` реалізує повний `BillingProvider` (dormant, контракт цілий).
- `provider.test.ts` — `getEnabledProviders('UA')` = `['liqpay','plata']` (без stripe); `resolveProvider('stripe','UA')` відхиляється.
- `billing.route.test.ts` — `/checkout` з `provider`, `/cancel`, три webhook-и; невалідний provider → 400; dedup повторної доставки.
- `dataRights.test` (розширити) — deletion юзера з `provider='liqpay'` викликає provider-unsubscribe; з `provider='plata'` — видаляє card-token row; провайдер-помилка НЕ валить deletion.
- Contract-тести (Hard Rule #3) — `BillingSubscription.provider` enum ↔ OpenAPI ↔ api-client типи.

## Ризики та відкриті питання

- **Plata рекурентка = власний scheduler.** monopay не має auto-subscribe (звірено з докою) — рекурентку тримає наш cron + збережений токен. Це найбільший приріст обсягу проти LiqPay. Якщо scheduler-інфра (cron-воркер) відсутня/незручна — Plata recurring може падати в «поза скоупом v1» (Plata лишається як разовий/manual-renew), LiqPay несе auto-recurring. Рішення — на етапі реалізації, зафіксувати в PR.
- **Reverse-trial інтеграція.** Припущення: trial — access-рівень, checkout після конверсії. Звірити з `apps/web/src/core/billing/usePlan.ts` + `TrialBanner.tsx` ПЕРЕД стартом. Якщо trial бере провайдера наперед — checkout-flow змінюється (відкласти перше списання: LiqPay `subscribe_date_start`, Plata — не токенізувати до кінця trial), спеку доповнити.
- **LiqPay signature-версія.** SHA1 vs SHA3-256 — звірити фактичну версію API акаунта на першому sandbox-callback, зафіксувати константою; не хардкодити наосліп.
- **monopay pubkey rotation.** `/api/merchant/pubkey` може ротуватись — кеш з TTL + рефетч при verify-fail, не вічний кеш.
- **ФОП-реквізити.** Live-ключі LiqPay (кабінет Приват) і monopay `X-Token` (кабінет моно-еквайринг) привʼязані до реального ФОП — власник кладе в Railway env (Hard Rule #20, secrets protocol). Верифікація — лише sandbox/test-ключі.
- **Presentment currency.** Підтвердити ₴199 == 19900 kopiykas і коректний маппінг у кожен API (LiqPay гривні `199.00` vs monopay копійки `19900`, `ccy:980`).
