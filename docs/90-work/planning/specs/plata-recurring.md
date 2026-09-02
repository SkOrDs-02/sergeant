# SPEC: Plata by mono — перехід на нативні підписки monobank

> **Last touched:** 2026-09-02 by @Skords-01. **Next review:** 2026-12-21.
> **Status:** Scaffolded

## Проблема

Провайдер `plata` (еквайринг monobank, [plata.ts](../../../../apps/server/src/modules/billing/plata.ts)) тримає рекурентні платежі самотужки: разовий інвойс із `saveCardData`, збережений card-token у власній таблиці під AES-256-GCM і власний денний планувальник, який щомісяця б'є в `POST /api/merchant/wallet/payment`. Підстава для цієї конструкції записана в коді дослівно: «monopay НЕ має провайдер-керованої auto-subscribe». Це вже неправда. У monobank є розділ «Регулярні платежі» з повним набором методів (`subscription/create`, `status`, `payments`, `list`, `remove`, `edit`), тобто ~530 рядків коду з тестами, окрема таблиця з шифрованим секретом і claim-транзакція проти подвійного списання існують заради того, що провайдер робить сам.

Та сама самописна рекурентка несе чотири дефекти в грошовому шляху, кожен із яких зникає разом із кодом, що його породив:

1. `DELETE /api/merchant/wallet/card` приймає `cardToken` **query-параметром**, а ми шлемо його в тілі ([plata.ts:373](../../../../apps/server/src/modules/billing/plata.ts#L373)) і не перевіряємо `response.ok`. Токен на боці monobank лишається живим після скасування підписки, і ми про це не дізнаємось.
2. `wallet/payment` легально повертає `status: "processing"` (і може віддати `tdsUrl`), а ми трактуємо все, крім `success`, як провал (`plataScheduler.ts:73`).
3. У тілі списання не передані ні `webHookUrl`, ні `merchantPaymInfo.reference`, хоча обидва поля підтримуються. Фінальний статус до нас не доїде ніколи, а якби доїхав, `processWebhook` викинув би його як `plata_webhook_unresolved` через порожній `reference` ([plata.ts:284](../../../../apps/server/src/modules/billing/plata.ts#L284)). Разом із пунктом 2 це означає: кошти списані, юзер у `past_due`.
4. `past_due` це глухий кут. Планувальник відбирає лише `status='active'` (`plataScheduler.ts:106`), а [getUserPlan](../../../../apps/server/src/modules/billing/getUserPlan.ts) вимагає `current_period_end > NOW()`. Одна транзієнтна 500-ка від monopay гасить Pro назавжди, без жодної повторної спроби.

Прапорець `PLATA_ENABLED` за замовчуванням `false` ([env.ts:394](../../../../apps/server/src/env/env.ts#L394)), провайдер у продакшн не пущено, живих підписок і збережених card-token немає. Це вікно, коли міграція коштує видалення коду, а не міграції даних.

## Мета

Провайдер `plata` створює підписку через `POST /api/merchant/subscription/create` і більше нічим не керує: періодичність, списання і ретраї лишаються на боці monobank. Наш код лише слухає два webhook-и, звіряється полінгом `subscription/status` і відображає стан у `subscriptions`. Файлів `plataScheduler.ts` і таблиці `plata_card_token` у репозиторії не існує; жоден рядок коду не читає, не пише і не шифрує card-token. Скасування з Settings доводить підписку до `status: "canceled"` у monobank, а Pro живе до `nextChargeDate`.

## Довідка з API monobank (перевірено 2026-09-01)

Ця секція існує тому, що виконавець не має доступу до розмови, у якій API вивчали. Дані зняті зі сторінок `monobank.ua/api-docs/acquiring/methods/subscription/*`. База: `https://api.monobank.ua/api/merchant`, автентифікація заголовком `X-Token`.

**`POST /api/merchant/subscription/create`**

```json
{
  "amount": 4200,
  "ccy": 980,
  "redirectUrl": "https://example.com/result",
  "webHookUrls": {
    "chargeUrl": "https://example.com/mono/subscription/charge/webhook",
    "statusUrl": "https://example.com/mono/subscription/status/webhook"
  },
  "interval": "1m",
  "validity": 3600
}
```

Обовʼязкові: `amount` (int64, копійки), `interval` (`{число}{одиниця}`: `1d`, `2w`, `1m`, `1y`). `ccy` за замовчуванням 980. `validity` це строк життя посилання на оплату в секундах, дефолт 24 години, максимум 30 днів (більше обрізається мовчки).

Відповідь: `{"subscriptionId": "s2_AbrCdXyZ13", "pageUrl": "https://pay.mbnk.biz/s2_AbrCdXyZ13"}`.

**Поля `reference` у цьому методі немає.** Це головна відмінність від `invoice/create` і причина окремої таблиці нижче: звʼязок «юзер ↔ subscriptionId» ми зобовʼязані зафіксувати самі, у момент створення, до редиректу.

**`GET /api/merchant/subscription/status?subscriptionId=…`**

```json
{
  "subscriptionId": "s2_AbrCdXyZ13",
  "status": "active",
  "startDate": "2024-06-01T14:15:22Z",
  "endDate": "2024-06-20T09:30:15Z",
  "amount": 4200,
  "ccy": 980,
  "interval": "1m",
  "nextChargeDate": "2024-07-01T14:15:22Z",
  "cancellationDesc": "Скасовано за запитом користувача",
  "summary": { "totalPaid": 3, "totalFailed": 1 },
  "walletData": {
    "cardToken": "67XZtXdR4NpKU3",
    "walletId": "c1376a611e17b059aeaf96b73258da9c",
    "status": "created",
    "failureDescription": "Недостатньо коштів на картці"
  }
}
```

Повний перелік значень `status` у доках не наведено; підтверджене прикладом значення `active`, плюс `cancellationDesc` вказує на скасований стан. Обробляти рядок треба толерантно (див. § Ризики).

**`POST /api/merchant/subscription/edit`** — `{"subscriptionId": "…", "action": "cancel", "refundAmount": 4200}`. `action` наразі має єдине значення `cancel`. `refundAmount` необовʼязковий: без нього повернення не робиться. Відповідь 200 з порожнім тілом.

**`POST /api/merchant/subscription/remove`** — `{"subscriptionId": "…"}`. Працює **лише поки за підпискою не було жодної оплати**. Відповідь 200 з порожнім тілом.

**`GET /api/merchant/subscription/payments`** — `subscriptionId` (обовʼязково), `dateFrom` (обовʼязково, RFC 3339), `dateTo`, `limit` (дефолт 20), `page` (дефолт 1). Віддає `{payments: [{amount, status, chargedAt, ccy}], pagination: {…}}`. У v1 не використовуємо.

**Помилки** усіх методів: 400 (невалідний параметр), 403 (невалідний токен), 404 (не знайдено), 405, 429 (rate limit), 500. Тіло помилки: `{"errCode": "BAD_REQUEST", "errText": "empty 'subscriptionId'"}`.

**Webhook-и.** `chargeUrl` викликається на кожне списання, `statusUrl` на зміну стану підписки. Підпис той самий, що вже реалізований для invoice-webhook: заголовок `X-Sign`, base64, ECDSA над **сирими байтами тіла**, хеш SHA-256, підпис у DER; публічний ключ береться з `GET /api/merchant/pubkey` (поле `key`, base64 PEM). **Структура тіла цих двох webhook-ів у документації не описана.** Це відомий і свідомо прийнятий ризик, від якого захищає дизайн нижче.

## Рішення дизайну

**Повна заміна, не паралельна робота.** Провайдер `plata` цілком переходить на `subscription/*`. Invoice-флоу (`invoice/create` + `saveCardData`), `wallet/payment`, `wallet/card`, планувальник і таблиця card-token видаляються. Відкинуто варіант «нові підписки через subscription/\*, старі через scheduler»: жодної старої підписки не існує (`PLATA_ENABLED=false`), тож фолбек охороняв би порожню множину, а платив би за це двома живими шляхами в проді. Відкинуто також варіант «лише багфікси»: він лишає ~530 рядків коду, який дублює провайдера.

**Мапінг «юзер ↔ subscriptionId» живе в окремій таблиці `plata_subscription`.** Записується в момент `subscription/create`, до редиректу на `pageUrl`. Рядок у `subscriptions` зʼявляється тільки після першого підтвердженого успішного списання. Відкинуто варіант «одразу писати `subscriptions` зі `status='incomplete'`»: він змішує намір з підтвердженим правом доступу і лишає покинуті `incomplete`-рядки, які треба окремо чистити.

**Джерело правди подвійне: webhook як швидкий сигнал, `subscription/status` як арбітр.** Жоден webhook не змінює `subscriptions` напряму. Він виконує рівно одну дію: витягує `subscriptionId` з тіла і ставить підписку в чергу негайної звірки, після чого стан застосовується з відповіді `GET /api/merchant/subscription/status`. Це знімає залежність від незадокументованого payload (нам потрібне з нього одне поле) і робить втрачену доставку нешкідливою. Відкинуто «тільки webhook» (мовчазна втрата підписки при недоставці) і «тільки полінг» (активація Pro чекала б до доби).

**Два темпи полінгу.** Швидкий тик кожні 5 хвилин по рядках `plata_subscription`, створених менш ніж годину тому і ще не підтверджених. Повільний тик раз на добу по всіх активних і `past_due` підписках. Швидкий тик існує рівно для того, щоб активація Pro не чекала доби, якщо webhook не дійшов; після години рядок або підтверджений, або покинутий і випадає зі швидкої вибірки.

**Скасування: `edit action=cancel` без повернення, доступ до кінця періоду.** У `subscriptions` виставляємо `cancel_at_period_end = TRUE` і лишаємо `current_period_end` як є, тобто Pro живе до `nextChargeDate`. Це поточна поведінка LiqPay і ADR-1.11, розходитись між провайдерами не можна. Якщо monobank відповів 404 або 400 з ознакою «оплат не було», повторюємо викликом `subscription/remove` (він і призначений для підписок без оплат). `refundAmount` не передаємо ніколи.

**Невдале списання: грейс 3 дні з доступом.** Коли звірка бачить зростання `summary.totalFailed` або статус, відмінний від активного, при непорожньому `walletData.failureDescription`, ставимо `status = 'past_due'` і **зсуваємо `current_period_end` на 3 дні вперед від поточного моменту**, тобто Pro ще живе. Наступні тики продовжують звіряти цю підписку; якщо monobank дотиснув списання і `totalPaid` виріс, повертаємо `active` і виставляємо `current_period_end = nextChargeDate`. Якщо за 3 дні не дотиснув, `current_period_end` спливає сам і `getUserPlan` перестає віддавати Pro без жодної додаткової дії. Грейс застосовується один раз на цикл: повторний перехід у `past_due`, коли `current_period_end` уже в майбутньому через попередній грейс, дату не зсуває.

**Два webhook-роути замість одного.** `POST /api/billing/plata-charge` (для `chargeUrl`) і `POST /api/billing/plata-status` (для `statusUrl`). Старий `POST /api/billing/plata-webhook` видаляється разом з invoice-флоу. Обидва нові роути потребують запису в [bodySizePolicy.ts](../../../../apps/server/src/http/bodySizePolicy.ts) з `kind: "raw"` — без сирих байтів ECDSA-верифікація не працює.

**Прибирання одним PR.** Код і `DROP TABLE plata_card_token` їдуть разом, без two-phase. Це свідоме відхилення від Hard Rule #4, і воно має бути назване в описі PR разом із підставою: фіча ніколи не була ввімкнена (`PLATA_ENABLED=false` від народження), таблиця гарантовано порожня, ризику втрати даних немає. Down-міграція відтворює таблицю точно за [082_plata_card_token.sql](../../../../apps/server/src/migrations/082_plata_card_token.sql).

**LiqPay лишається другим провайдером.** `getEnabledProviders` для UA і далі віддає `["liqpay", "plata"]`, обидві кнопки на `/pricing` живуть. Резолвер, реєстр і UI-логіка вибору провайдера не змінюються.

**Верифікація живим прогоном.** Реалізація не вважається готовою, поки тестовим `X-Token` не створено реальну підписку і не спіймано справжні тіла `chargeUrl` і `statusUrl`. Спіймані тіла фіксуються як фікстури в тестах.

## Поверхня змін

Owner-скіл за routing-таблицею AGENTS.md: **`sergeant-module-billing`**. Дотичні: `sergeant-server-api` (контракт і OpenAPI), `sergeant-data-and-migrations` (міграція).

**Видалити повністю:**

- `apps/server/src/modules/billing/plataScheduler.ts` і `plataScheduler.test.ts`
- Реєстрацію `PlataRecurringPoller` в [apps/server/src/index.ts](../../../../apps/server/src/index.ts): імпорт (рядок 80), створення і `start()` (247-248), `stop()` у graceful-shutdown (421). Новий поллер звірки реєструється на тих самих трьох місцях.
- З [plata.ts](../../../../apps/server/src/modules/billing/plata.ts): `storePlataCardToken`, `getEncKey`, весь invoice-флоу в `createCheckoutSession`, `parsePlataWebhook`, поточний `processWebhook`, виклики `wallet/card` у `cancelSubscription`

**Переписати:**

- [apps/server/src/modules/billing/plata.ts](../../../../apps/server/src/modules/billing/plata.ts) — `createCheckoutSession` через `subscription/create`; `cancelSubscription` через `subscription/edit` з фолбеком на `remove`; новий модуль звірки, який читає `subscription/status` і застосовує стан. `verifyWebhookSignature`, `ensurePlataPubkey`, `parsePubkey` і кеш pubkey лишаються без змін, вони вже коректні. Слідкуй за Hard Rule #18 (`max-lines: 600`): звірку і поллер логічно винести в окремий `plataSync.ts`.
- [apps/server/src/routes/billing.ts:331](../../../../apps/server/src/routes/billing.ts#L331) — замість одного роута два, кожен verify-then-enqueue
- [apps/server/src/http/bodySizePolicy.ts:165](../../../../apps/server/src/http/bodySizePolicy.ts#L165) — правило `plata-webhook` замінити двома
- [packages/shared/src/openapi/routes.ts:1430](../../../../packages/shared/src/openapi/routes.ts#L1430) — опис `/api/billing/plata-webhook` замінити двома новими; там же підправити текст на рядку 1382 («Plata stop-scheduler» більше не відповідає дійсності). Похідний `openapi.json` перегенерується pre-commit-хуком, руками не чіпай.

**Додати:**

- `apps/server/src/migrations/133_plata_subscription.sql` + `.down.sql`. Створює `plata_subscription` (`user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE`, `subscription_id TEXT NOT NULL UNIQUE`, `confirmed_at TIMESTAMPTZ`, `created_at`, `updated_at`) і дропає `plata_card_token`. Хард-правило #4 щодо послідовності номерів без пропусків діє. Спека планувала номер 132, але поки робота йшла, 132 зайняв `132_fizruk_kcal_and_custom_activities`; перенумеровано на 133 при rebase. Звіряй вільний номер із `origin/main` безпосередньо перед комітом, а не з датою написання спеки.
- Модуль звірки з двома таймерами. Патерн бери з видаленого `plataScheduler.ts`: in-process `setInterval`, `unref()`, idempotent `start`/`stop`, той самий стиль, що `GdprCleanupPoller` і `SilpoSyncPoller`. Транзакція з `FOR UPDATE SKIP LOCKED` тут більше не потрібна: звірка не рухає гроші, вона лише читає стан у monobank, тож повторний прогін нешкідливий.

**Не чіпати:**

- [getUserPlan.ts](../../../../apps/server/src/modules/billing/getUserPlan.ts) — правило «Pro поки `current_period_end > NOW()`» саме реалізує грейс, змінювати не треба
- [provider.ts](../../../../apps/server/src/modules/billing/provider.ts), [registry.ts](../../../../apps/server/src/modules/billing/registry.ts) — інтерфейс `BillingProvider` витримує нову реалізацію без правок
- [apps/web/src/core/PricingPage.tsx](../../../../apps/web/src/core/PricingPage.tsx), [PlanSection.tsx](../../../../apps/web/src/core/settings/PlanSection.tsx) — UI не змінюється
- `metric billing_recurring_charge_total` лишається; оновити тільки коментар у [metrics/billing.ts:34](../../../../apps/server/src/obs/metrics/billing.ts#L34) («Plata — наш scheduler» стає неправдою). Інкрементувати з нового місця звірки з тими самими мітками `charged` / `past_due`.

**Документація (Hard Rule #15, у тому ж PR):**

- [docs/02-engineering/architecture/feature-flags.md](../../../02-engineering/architecture/feature-flags.md) — рядок `PLATA_ENABLED`, опис що саме вмикає
- Новий ADR не потрібен. Але [ADR-0089](../../../04-governance/adr/0089-job-substrates-outbox-broker-timer.md) наводить Plata-рекурентку як приклад вибору timer-субстрату; цей приклад стає неактуальним. Додай туди коротку примітку з посиланням на цю спеку, не переписуючи саме рішення про субстрати.

## Поза скоупом v1

- **пРРО і фіскалізація.** `invoice/fiscal-checks` і вбудований пРРО monopay не чіпаємо. Це юридичне питання (продаж підписки фізособам через ФОП), відповідь потрібна до запуску платежів, але окремо від цього коду.
- **Повернення коштів.** `refundAmount` у `subscription/edit` не використовуємо, UI для рефандів не робимо. Повернутись, коли зʼявиться продуктова політика повернень.
- **Річний тариф і зміна тарифу на льоту.** `interval` завжди `1m`, апгрейд/даунгрейд не робимо.
- **Історія платежів у Settings.** `subscription/payments` не викликаємо і не показуємо. У Settings лишається статус і дата наступного списання, як зараз.
- **`subscription/list`.** Не потрібен: мапінг тримає `plata_subscription`.
- **Увімкнення прапорця.** `PLATA_ENABLED` лишається `false` у дефолтах. Вмикання в проді це окреме рішення власника.

## Верифікація (обовʼязково)

### 1. Автоматичні перевірки

```bash
pnpm check
```

Це `format:check` + `lint` + `check:typecheck-and-test` + `build`. Має бути зелено цілком. Окремо, поки йде робота:

```bash
pnpm --filter @sergeant/server test -- plata
```

Очікувано: усі тести `plata.test.ts` проходять, файлів `plataScheduler.test.ts` більше немає.

```bash
pnpm --filter @sergeant/api-client test
```

Контрактні тести `/api/v1/billing/*` мають лишитись зеленими без правок: відповіді `checkout`, `status`, `providers`, `cancel` не змінюють форму.

Перевірка, що прибирання повне (обидві команди мають дати **нуль** рядків):

```bash
grep -rn "wallet/payment\|wallet/card\|plata_card_token\|PlataRecurringPoller" apps packages
```

```bash
grep -rn "plata-webhook" apps packages docs
```

Міграція вгору і вниз на чистій базі:

```bash
pnpm dev:db
```

Очікувано: 132 застосовується, `\d plata_card_token` у psql дає «did not find any relation», `\d plata_subscription` показує таблицю. Прогін `.down.sql` вручну має повернути `plata_card_token` і прибрати `plata_subscription`.

### 2. Живий прогін проти тестового monobank

Це головний доказ, і без нього робота не готова. Тестовий `X-Token` береться з `https://api.monobank.ua/` (розділ для розробників), у `PLATA_TOKEN`, `PLATA_ENABLED=true`, `PLATA_MODE=test` локально.

Webhook-и мають прийти на публічний URL, тож підніми тунель до локального `:3000` (`cloudflared tunnel --url http://localhost:3000` або будь-який аналог) і віддай його базу в `PUBLIC_WEB_BASE_URL`, щоб `webHookUrls` вказували назовні.

Сценарій:

1. Локально `pnpm dev:db`, `pnpm dev:server`, `pnpm dev:web`. Зайти під тестовим юзером, відкрити `/pricing`, натиснути оплату через Plata.
2. Очікувано: редирект на `https://pay.mbnk.biz/s2_…`; у базі зʼявився рядок `plata_subscription` з `confirmed_at IS NULL`; у `subscriptions` рядка ще **немає**.
3. Оплатити тестовою карткою monobank.
4. **Зафіксувати сирі тіла обох webhook-ів** (`plata-charge` і `plata-status`) з логів і зберегти як фікстури в тестах. Це і є та інформація, якої немає в документації.
5. Очікувано: у `subscriptions` рядок `provider='plata'`, `status='active'`, `plan='pro'`, `current_period_end` дорівнює `nextChargeDate` з `subscription/status`; `plata_subscription.confirmed_at` заповнено. У Settings видно Pro і дату наступного списання.
6. **Перевірка незалежності від webhook.** Повторити пункти 1-3 з вимкненим тунелем (webhook фізично не дійде). Очікувано: протягом 5 хвилин швидкий тик сам активує Pro через `subscription/status`. Це доказ, що звірка справді арбітр, а webhook лише прискорювач.
7. Скасувати Pro в Settings. Очікувано: `GET /api/merchant/subscription/status` віддає скасований стан; у нас `cancel_at_period_end = TRUE`, `current_period_end` не зрушив, Pro у Settings досі активний із поміткою про скасування.
8. **Грейс.** Виставити в базі `current_period_end` у минуле і підкласти в `subscription/status` відповідь із `totalFailed`, більшим за збережений (мок-сервером або тимчасовим стабом `fetch`). Викликати звірку разово. Очікувано: `status='past_due'`, `current_period_end` рівно `NOW() + 3 дні`, `getUserPlan` і далі віддає `pro`. Повторний прогін тієї ж звірки дату **не** зсуває вдруге.

### 3. Нові тести

- `plata.test.ts`: `createCheckoutSession` шле коректне тіло на `subscription/create` (`interval: "1m"`, `amount` з `PRO_MONTHLY_UAH_KOPIYKAS`, обидва `webHookUrls`) і повертає `pageUrl`; пише рядок у `plata_subscription` до повернення відповіді.
- `plata.test.ts`: `cancelSubscription` шле `action: "cancel"` і **не** шле `refundAmount`; при 404 повторює через `subscription/remove`; повторний виклик на вже скасованій це no-op.
- Новий `plataSync.test.ts`: `status=active` + зрослий `totalPaid` дає `active` з `current_period_end = nextChargeDate`; зрослий `totalFailed` дає `past_due` з грейсом рівно 3 дні; другий поспіль `past_due` дату не зсуває; невідомий рядок у полі `status` не валить звірку і не змінює наявний стан.
- Роут-тести: обидва нові роути повертають 400 на підроблений `X-Sign` і емітять `plata_webhook_bad_sig`; на валідному підписі ставлять підписку в чергу звірки і **не** пишуть у `subscriptions` напряму; тіло без розпізнаваного `subscriptionId` дає 200 і лог, а не 500 (monobank не має ретраїти нам через нашу ж помилку парсингу).
- Тест на секрети (Hard Rule #21): у логах звірки і роутів не зʼявляється ні `PLATA_TOKEN`, ні `walletData.cardToken`, який тепер приходить у відповіді `subscription/status`.

## Ризики та відкриті питання

- **Payload `chargeUrl` і `statusUrl` не задокументований.** Пряма загроза, і саме через неї webhook не має права змінювати стан: він лише дістає `subscriptionId` і тригерить звірку. Парсер має бути толерантним, шукати ідентифікатор у кількох ймовірних місцях (`subscriptionId` на верхньому рівні, у вкладеному обʼєкті) і на невдачу відповідати 200 з попередженням у лозі. Закривається кроком 4 живого прогону.
- **Перелік значень `subscription.status` невідомий.** Підтверджене прикладом лише `active`. Звірка мусить мати явний allowlist «активних» рядків і безпечний дефолт: невідоме значення означає «нічого не змінюємо», а не «скасовано».
- **Політика ретраїв на боці monobank не описана.** Скільки разів і з яким кроком банк повторює невдале списання, ми не знаємо. Грейс у 3 дні це припущення; після першого місяця живих платежів звірити з реальністю по `summary.totalFailed` і за потреби підкрутити.
- **Ідемпотентність webhook-ів.** Наявна таблиця `billing_webhook_events` має CHECK на `('apple','google','liqpay','plata')`, тобто `plata` вже дозволена. Дедуп у новій схемі не критичний (звірка ідемпотентна за побудовою), але записувати події туди варто заради аудиту. Ключ `provider_event_id` доведеться підібрати після кроку 4, коли буде видно реальний payload.
- **Відхилення від Hard Rule #4** (DROP без two-phase) має бути явно назване в описі PR із підставою, інакше review-гейт справедливо його заріже.
- **пРРО.** Не блокує цю роботу, але блокує запуск платежів. Тримати як окремий пункт перед вмиканням `PLATA_ENABLED`.
