# SPEC: Free і Premium: пакетування, єдиний реєстр доступу, reverse trial

> **Last touched:** 2026-10-03 by @claude (refine фото: механіка «того самого знімка», sec-14). **Next review:** 2027-04-02.
> **Status:** Active - реалізовано в коді: `packages/shared/src/billing/entitlements.ts`, міграція `149_ai_usage_daily_week_buckets`, `apps/server/src/modules/chat/aiQuotaWeekly.ts`, `billing/reverseTrial.ts`, `billing/accessSnapshot.ts`, `apps/web/src/core/billing/TrialBanner.tsx` (`effectiveLimits.ts` і `premiumFeatures.ts` видалені); лишився click-through з § Верифікація п. 5 на живому стенді.

<!-- Інтервʼю провела сесія «Спека free/premium доступу» (4 раунди, 2026-09-27); 5-й раунд (vision Фініка, плани харчування, tool-квоти, функції без AI) додано того ж дня після інвентаризації всіх AI-маршрутів. -->

## Проблема

Що саме входить у Free, а що в Premium, записано в трьох місцях, які розійшлися. Сервер гейтить своє (`effectiveLimits.ts`, `requirePlan`), web своє (`premiumFeatures.ts`), `/pricing` обіцяє третє. Частина обіцянок не підкріплена кодом: ліміт «2 пристрої» для синку ніде не перевіряється, авто-синк Mono на `/pricing` значиться Premium, хоча канон і код тримають його у Free. Колонки trial і grace (міграція 073) не читаються і не пишуться ніде, reverse trial з ADR-0068 не реалізований. Денна квота 5 запитів погано лягає на реальний ритм: людина заходить двічі на тиждень і впирається в стелю в один із цих днів. Правило 8 канону («фото поза загальною квотою») виконане лише частково.

## Мета

Є один типізований реєстр доступу в `@sergeant/shared`. Сервер гейтить за ним і віддає в `/api/billing/status` готовий знімок доступу й лічильників. Web нічого не обчислює сам і лише читає знімок, `/pricing` будує таблицю з того самого реєстру. Free отримує 20 AI-дій на тиждень, окремо 3 фото їжі і 5 vision-сканів у Фініку на тиждень, лічильники скидаються щопонеділка о 00:00 за Києвом. Нові акаунти (за увімкненого прапорця) стартують із 7-денного Premium. Невдала оплата дає 3 дні grace. Перевіряється це так: після змін жодна з трьох копій списку фіч не існує окремо від реєстру, а сценарії з § Верифікація проходять.

## Рішення дизайну

**Пакетування (що в якому плані):**

| Feature id (реєстр)                                                                          | Free                                                                                                        | Premium                                    | Звідки рішення                                           |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `ai.actions`                                                                                 | 20 дій / ISO-тиждень                                                                                        | без ліміту (каскад моделей, див. нижче)    | інтервʼю р.1-2; замінює ADR-0085                         |
| `ai.photo`                                                                                   | 3 фото / ISO-тиждень, окремо                                                                                | без ліміту                                 | інтервʼю р.3; канон правило 8                            |
| `ai.voice`                                                                                   | ні                                                                                                          | так                                        | інтервʼю р.2; рішення 2026-09-11                         |
| `ai.memoryRecall`                                                                            | ні (перегляд і стирання фактів лишаються Free, GDPR)                                                        | так                                        | інтервʼю р.2                                             |
| `export.pdf`                                                                                 | ні                                                                                                          | так                                        | інтервʼю р.2                                             |
| `export.csv`                                                                                 | так                                                                                                         | так                                        | канон правило 16 (експорт-гарантія)                      |
| `bank.monoSync`                                                                              | так, включно з авто-синком                                                                                  | так                                        | інтервʼю р.1; канон правило 7                            |
| `sync.cloud`                                                                                 | так, без ліміту пристроїв                                                                                   | так                                        | інтервʼю р.3                                             |
| `ai.proactive`                                                                               | ні                                                                                                          | так (id зарезервований, гейт не вішається) | канон; поза скоупом v1                                   |
| `ai.finykVision`                                                                             | 5 сканів / ISO-тиждень, окреме відро (фото чека без QR + скрін банку)                                       | без ліміту                                 | інтервʼю р.5-6                                           |
| `nutrition.weekPlan`                                                                         | ні                                                                                                          | так                                        | інтервʼю р.5                                             |
| `nutrition.dayPlan`, рецепти, список покупок, розбір комори                                  | 1 дія з `ai.actions` кожне                                                                                  | без ліміту                                 | інтервʼю р.5 (як зараз)                                  |
| `nutrition.barcode`, пошук їжі                                                               | так                                                                                                         | так                                        | інтервʼю р.5: без AI = ядро                              |
| `finyk.receiptQr`, `finyk.importCsv`                                                         | так                                                                                                         | так                                        | інтервʼю р.5: без AI = ядро                              |
| `insights.weeklyDigest`                                                                      | так, 3 кореляції як зараз                                                                                   | так                                        | інтервʼю р.6; канон product-overview:125 виправляється   |
| `finyk.analyticsHistory`                                                                     | так, уся історія                                                                                            | так                                        | інтервʼю р.6: не важіль                                  |
| ручний трекінг: звички, шаблони тренувань, власні вправи, бюджети, категорії, борги, рахунки | так, без числових лімітів                                                                                   | так                                        | канон «ручний трекінг без лімітів»; у коді лімітів немає |
| `fizruk.importStrong` (CSV зі Strong)                                                        | так                                                                                                         | так                                        | шлях залучення, разова дія                               |
| `integrations.silpo`                                                                         | так, усе: OAuth, синк чеків (фон раз на 8 год), прив'язка чеків до транзакцій, кошик, товари як джерело їжі | так                                        | інтервʼю р.5; у проді увімкнено, LLM не викликає         |

Рядки «без AI = ядро» гейта не мають. Вони живуть у реєстрі лише для того, щоб `/pricing` показував їх явно як Free. Колонка Premium на `/pricing` зараз пише «Витрати у Фініку, Шаблони тренувань, Звички: без ліміту» (`apps/web/src/core/PricingPage.tsx` ~L139-142), ніби у Free вони обмежені. Це неправда, і таблиця з реєстру ці рядки прибирає з Premium-колонки.

Решта рішень:

- **Vision Фініка отримує окреме відро `week:finyk-vision`, 5 на тиждень.** Зараз `POST /api/finyk/receipts/analyze` і `POST /api/finyk/import/screenshot/analyze` (`apps/server/src/routes/finyk.ts` ~L134, ~L163) викликають Anthropic Vision без квоти і без плану, стоїть лише rate limit 20 на хвилину. Це найдорожчий відкритий шлях: до ~28 тис. викликів на добу з одного акаунта. Коли відро вичерпано, сервер повертає 429 `{ code: "AI_FINYK_VISION_QUOTA", resetsAt }`, а web відкриває PaywallModal з новою surface `finyk_vision`. Шлях за QR через ДПС лишається Free без ліміту, тож людина, яка вперлась, завжди може відсканувати QR. Варіант «спільне відро фото на 3» відкинуто: Free, який імпортує виписку скрінами, вперся б одразу. Варіант «лише Premium» відкинуто, бо це найпомітніший гейт у Фініку.
- **Тижневий план харчування тільки в Premium.** На `POST /api/nutrition/week-plan` (`nutrition.ts` ~L144) додається `requirePlan(pool, "pro")`. Денний план, рецепти, список покупок і розбір комори лишаються у Free, по 1 дії з 20. Web: кнопка тижневого плану через `useFeatureGate("nutrition.weekPlan")`, surface `week_plan`. Варіант «вага за важкістю» відкинуто на користь чіткого гейта, який дає причину для апгрейду.
- **Tool-виклики в чаті зливаються в тижневі 20.** Для Free денний бакет `tool:<name>` (`consumeToolQuota`, `aiQuota.ts` ~L501) більше не діє: хід чату з інструментом коштує 1 дію, як уже вирішено для round-trip (AI-5). Для Pro `consumeToolQuota` лишається як захист від зловживань. Варіант «лишити денний tool-бакет» відкинуто: людина впиралась би в невидимий денний ліміт, маючи повні тижневі.
- **PaywallSurface прибирається.** Оголошені, але ніде не передані `mono_auto_sync`, `cloud_sync`, `themes`, `other` видаляються. Додаються `week_plan` і `finyk_vision`. Surface береться з реєстру (поле `surface` у рядку фічі), а не з окремої мапи.
- **Одна спека на пакетування і реєстр.** Лише пакетування без реєстру відкинуто: копії лишились би і розійшлися б знову.
- **Реєстр живе в `packages/shared/src/billing/entitlements.ts`** (нова тека). Формат такий: `FEATURES: Record<FeatureId, { free: Access; pro: Access }>`, де `Access = boolean | { perWeek: number }` (а для Pro `null` означає «без ліміту»). З цього файла читають сервер (гейти й квоти), web (через знімок) і `PricingPage`. Варіант, де web сам рахує доступ із `plan`, відкинуто, бо під час trial і grace два місця обчислення розходяться.
- **Сервер віддає знімок.** `GET /api/billing/status` доповнюється полем `access`:

  ```ts
  access: {
    state: "free" | "trial" | "pro" | "grace";
    trialEndsAt: string | null; // ISO, лише для state=trial
    graceEndsAt: string | null; // ISO, лише для state=grace
    features: Record<FeatureId, boolean>;
    meters: {
      aiActions: {
        used: number;
        limit: number | null;
        resetsAt: string;
      }
      aiPhoto: {
        used: number;
        limit: number | null;
        resetsAt: string;
      }
      finykVision: {
        used: number;
        limit: number | null;
        resetsAt: string;
      }
    }
  }
  ```

  Поле `subscription` лишається як є, щоб не ламати `PlanSection`. Діє Hard Rule #3: серверна схема `BillingStatusResponseSchema` у `packages/shared/src/schemas/api.ts`, тип у `packages/api-client/src/endpoints/billing.ts` і `billing.contract.test.ts` міняються в одному PR.

  Єдине доповнення до `subscription` після релізу: `cancelAtPeriodEnd: boolean` (колонка `subscriptions.cancel_at_period_end`, на клієнті `.default(false)` для rolling deploy). Після «Скасувати Premium» рядок лишається `active`, а доступ діє до `currentPeriodEnd`, тож без цього прапорця UI не відрізнив би «скасовано» від «діє». `PlanSection` тоді замість кнопки пише «Підписку скасовано. Premium діє до …». Для Premium без провайдера (founder, `provider: "manual"`, зокрема reverse trial) кнопки «Скасувати» немає. `POST /api/billing/cancel` віддає `409 NO_ACTIVE_SUBSCRIPTION`, коли жоден провайдер не має що скасовувати, і `502 PROVIDER_CANCEL_FAILED`, коли провайдер відмовив; повторний виклик на вже скасованій підписці ідемпотентний.

- **Тижневе відро Free: 20 дій, скидання в понеділок 00:00 Europe/Kyiv.** Ключ відра = дата понеділка ISO-тижня за Києвом (`YYYY-MM-DD`), який пишеться в наявну колонку `usage_day`. Нова таблиця не потрібна. Бакети: `week:ai` (чат, порада коуча та інші ендпойнти, що зараз списують `default`), `week:photo` і `week:finyk-vision`. Ковзне вікно відкинуто: його складно пояснити і потрібен журнал подій замість лічильника. Функцію «понеділок тижня за Києвом» кладемо поруч із `toLocalISODate()` у `@sergeant/shared` і покриваємо тестом на межі неділя 23:59 / понеділок 00:00 Kyiv, а також на перехід DST.
- **Що вважається однією дією, не змінюється.** Один HTTP-запит до AI-маршруту = 1 (`assertAiQuota`, `aiQuota.ts` ~L382). Другий запит tool round-trip, як і раніше, звільняє `chatRoundTripTicket.ts`. Власний бюджет інтервʼю (`AI_QUOTA_PRESET`) і виведення дайджесту з квоти лишаються без змін.
- **Фото: окреме відро на 3 на тиждень.** `analyze-photo` списує 1 з `week:photo` і не чіпає `week:ai`. `refine-photo` того самого знімка нічого не списує, бо це продовження тієї самої дії. «Той самий знімок» сервер визначає за SHA-256 кадру (`image_base64.trim()`), який `analyze-photo` успішно проаналізував для цього користувача за останні 24 год (`ai_photo_refine_grants`, міграція 153, FK на `"user"` з `ON DELETE CASCADE`, без зміни API-контракту: web шле в refine той самий `image_base64`); refine іншого кадру списує `week:photo` так само, як analyze, а вичерпане відро дає 429 `AI_PHOTO_QUOTA` і пейвол. `requirePlan(pool, "pro")` з обох маршрутів у `apps/server/src/routes/nutrition.ts` знімається. Коли відро вичерпано, сервер повертає 429 `{ code: "AI_PHOTO_QUOTA", resetsAt }`, і web відкриває `PaywallModal` з surface `unlimited_ai_photo`. Варіант «фото = 2 дії зі спільних 20» відкинуто, бо правило 8 канону прямо каже «поза загальною квотою».
- **Відповідь на вичерпане AI-відро.** Код лишається `AI_QUOTA`, додається `resetsAt`. Текст треба змінити, бо денний став хибним: «Тижневий ліміт Сержанта вичерпано. Оновиться в понеділок.» Остаточну копію звірити з `sergeant-copy-and-tone`. `friendlyApiError()` у `apps/web/src/core/lib/hubChatUtils.ts` і `ChatUsageCounter.tsx` переходять на тижневе формулювання.
- **Premium: каскад моделей лишається як стеля витрат.** Premium 20/добу → standard 80/добу → floor без ліміту (`resolveProTier()`, денні бакети `premium`/`standard`). «Без ліміту» для людини означає, що відповідь буде завжди, але після 20 важких запитів модель дешевшає. Варіант «одна найкраща модель без стелі» відкинуто через unit-економіку.
- **Reverse trial 7 днів лише для нових акаунтів.** Під час створення користувача (Better Auth `databaseHooks.user.create.after` у `apps/server/src/auth.ts`, зараз такого хука немає) вставляється рядок `subscriptions`: `plan='pro'`, `status='trialing'`, `provider='manual'`, `trial_ends_at = now()+7d`, `current_period_end = trial_ends_at`, з `ON CONFLICT DO NOTHING`. Окремий cron спливання не потрібен: `getUserPlan` вже вважає `trialing` активним лише доки `current_period_end > now()`, тож на 8-й день людина сама стає Free. Наявні акаунти trial не отримують (інтервʼю р.2). Один trial на акаунт гарантований тим, що рядок пишеться тільки при створенні.
- **Trial вмикається прапорцем `BILLING_REVERSE_TRIAL_ENABLED` (серверний env, дефолт `false`).** Квоти AI діють у проді вже зараз, незалежно від `isBillingEnforced()`. Тому trial без прапорця одразу дав би кожному новому акаунту тиждень AI без ліміту, тобто зміну витрат ще до запуску Premium. Прапорець додається в `docs/engineering/architecture/feature-flags.md` з умовою зняття «Premium запущено, trial став постійною політикою».
- **Grace після невдалої оплати: 3 дні, потім Free.** `past_due` вважається активним, лише доки `COALESCE(grace_period_ends_at, current_period_end + interval '3 days') > now()`. Правка робиться в запиті `getUserPlan.ts` (~L68) і в перевірці `isActive` у `requirePlan.ts` (~L52). Вебхуки LiqPay/Plata колонку можуть не писати, спрацює fallback. 7 днів відкинуто як зайві безкоштовні дні на кожен збій, «без grace» як покарання за збій банку.
- **Стан `state` у знімку** обчислює одна серверна функція (поруч із `getUserPlan`). Founder дає `pro`. `trialing` з майбутнім кінцем дає `trial`. `past_due` у межах grace дає `grace`. Активний `pro` дає `pro`. Усе інше дає `free`.
- **Сповіщення: лише банер у застосунку.** `TrialBanner.tsx` читає `access.state`: для `trial` показує банер за ≤2 дні до кінця (sticky у останню добу), для `grace` банер «Оплата не пройшла, онови картку до <дата>». Прапорець `billing_trial_banner` видаляється разом із записом у feature-flags.md. Push і email відкинуто: серверного планувальника й email-каналу немає.
- **Мертві ліміти прибираються.** `cloudSyncDevices` і `monoAutoSync` ніде не читаються, тож `effectiveLimits.ts` видаляється цілком, а його споживач (`aiQuota.ts` `userDailyLimit()`) переходить на реєстр. Рядки «2 пристрої» і «Mono авто-синк: Premium» зникають з `/pricing`, бо таблиця будується з реєстру.
- **`/pricing` лишається «Скоро».** Ціна, живий checkout і зняття waitlist сюди не входять. Поки `isBillingEnforced()` = false, `requirePlan` у проді не діє, і Premium-гейти (голос, recall, PDF) фактично відкриті. Тижневі квоти при цьому діють. Така асиметрія свідома і вже існує сьогодні.

## Поверхня змін

- `packages/shared/src/billing/entitlements.ts` (новий): реєстр, типи `FeatureId`/`Access`, `weekStartKyiv()`; експорт з `packages/shared/src/index.ts`; тест поруч.
- `packages/shared/src/schemas/api.ts` (~L1728): поле `access` у `BillingStatusResponseSchema`.
- `packages/api-client/src/endpoints/billing.ts` + `src/__tests__/contracts/billing.contract.test.ts`: тип і контракт.
- `apps/server/src/migrations/149_ai_usage_daily_week_buckets.sql` (+ `.down.sql`): CHECK `ai_usage_daily_bucket_format` отримує `bucket LIKE 'week:_%'`. Форма як у 049/077/078: drop і re-add надмножини, idempotent. **Перед стартом перевір, що 149 вільний** (зараз останній 148), Hard Rule #4.
- `apps/server/src/modules/chat/aiQuota.ts`: Free переходить з денного `default` на `week:ai`, додаються `week:photo`, `week:finyk-vision` і `resetsAt` у 429; `userDailyLimit()` перейменовується і читає реєстр; `consumeToolQuota` для Free не діє. Pro-каскад не чіпаємо.
- `apps/server/src/modules/billing/effectiveLimits.ts`: видалити (перед цим зробити grep імпортів по монорепо).
- `apps/server/src/modules/billing/getUserPlan.ts`, `requirePlan.ts`: grace-умова для `past_due`; нова функція стану доступу.
- `apps/server/src/routes/billing.ts` (~L151): `/api/billing/status` віддає `access`, включно з founder-гілкою.
- `apps/server/src/routes/nutrition.ts` (~L101, ~L124): зняти `requirePlan`, під'єднати фото-відро; (~L144) `requirePlan` на `week-plan`.
- `apps/server/src/routes/finyk.ts` (~L134, ~L163): відро `week:finyk-vision` на `receipts/analyze` і `import/screenshot/analyze`.
- `apps/server/src/routes/ai-memory.ts:89`, `apps/server/src/routes/transcribe.ts:68`: `requirePlan` лишається, id фічі береться з реєстру.
- `apps/server/src/auth.ts`: `databaseHooks.user.create.after` для trial за прапорцем; env у `apps/server/src/env/env.ts`.
- `apps/web/src/core/billing/usePlan.ts`, `useFeatureGate.ts`: читають `access` зі знімка. `premiumFeatures.ts` видаляється, `PremiumFeatureId` замінює `FeatureId` з реєстру. Call sites: `apps/web/src/core/hub/HubReports.tsx:173` (PDF), `apps/web/src/modules/nutrition/components/meal-sheet/PhotoStep.tsx:74` (фото стає лічильником, а не булевим гейтом).
- `apps/web/src/core/billing/PaywallModal.tsx`: union `PaywallSurface` звужується до використаних плюс `week_plan`, `finyk_vision`.
- Web call sites нових гейтів: кнопка тижневого плану в модулі nutrition, фото-fallback чека і скрін-імпорт у модулі finyk (знайти через grep викликів `receipts/analyze` і `screenshot/analyze` в `apps/web/src/modules/finyk`).
- `apps/web/src/core/billing/TrialBanner.tsx`: стани `trial` і `grace`, без прапорця.
- `apps/web/src/core/hub/chat/ChatUsageCounter.tsx`, `apps/web/src/core/lib/hubChatUtils.ts`: тижневий лічильник і копія. Лічильник читає `access.meters` через `usePlan`. Якщо в `GET /api/chat/usage` після цього не лишиться споживачів (перевір grep-ом), видалити ендпойнт разом з його типом і тестом.
- `apps/web/src/core/PricingPage.tsx` + i18n `uk.pricing.ts`/`en.pricing.ts`: таблиця з реєстру.
- Доки в тому ж PR: новий ADR (supersedes ADR-0085, уточнює ADR-0068: trial лише для нових акаунтів і за прапорцем, grace 3 дні, наявні акаунти без trial); `docs/product/model/product-overview.md` правила 7, 8 (статус «✅»); `docs/product/modules/hub-coach.md` (~L543, ~L794: 5/добу → 20/тиждень); `docs/product/model/product-overview.md:125` (дайджест Free, не Pro); `docs/engineering/architecture/feature-flags.md` (мінус `billing_trial_banner`, плюс `BILLING_REVERSE_TRIAL_ENABLED`).
- Owner-скіли: `sergeant-module-billing` (основний) + `sergeant-server-api`, `sergeant-web-ui`, `sergeant-data-and-migrations`; для копії `sergeant-copy-and-tone`; для ADR `sergeant-adr`. Це 3+ поверхні з контрактною залежністю, тож виконання через `sergeant-deliver-squad`: міграція → сервер → api-client → web.

## Поза скоупом v1

- Річний план ₴1490 і proration: окрема спека (ADR-0068).
- Адмін-інструмент ручної видачі Premium чи trial. Ручний грант лишається SQL-рядком `provider='manual'`, founder bypass лишається через env.
- Гейт проактивності (push першим, нудж): id `ai.proactive` зарезервований, гейт не вішається, бо серверної проактивності немає.
- Mobile-паритет UI пейволу (`apps/mobile`, пауза ADR-0094). Сервер гейтить однаково для всіх клієнтів.
- Ціна на `/pricing`, живий checkout, увімкнення провайдера, зняття waitlist: окреме рішення founder-а.
- Push чи email про кінець trial або grace.
- Ліміт пристроїв для синку.
- Trial для наявних акаунтів.
- Сторінка «Твій Premium» для тих, хто платить: у спеку запуску.
- Premium-фічі, яких немає в коді: власні теми й акценти, архів дайджестів, заморозка стріку, Strava, віджети. Кожна окремою спекою, якщо колись.

## Верифікація (обовʼязково)

1. `pnpm --filter @sergeant/shared test` зелений. Тест `weekStartKyiv` покриває неділю 23:59 Kyiv → попередній понеділок, понеділок 00:00 Kyiv → цей понеділок, тиждень з переходом DST.
2. `pnpm --filter @sergeant/server test`: нові тести на те, що Free на 21-й дії тижня отримує 429 `AI_QUOTA` з `resetsAt` = наступний понеділок 00:00 Kyiv; що 4-те фото тижня дає 429 `AI_PHOTO_QUOTA` і не чіпає `week:ai`; що `refine-photo` кадру, який `analyze-photo` проаналізував цьому користувачу за 24 год, не списує, а refine кадру без гранту (іншого, чужого чи старшого за 24 год) списує `week:photo` і при вичерпаному відрі дає 429 `AI_PHOTO_QUOTA`; що 6-й скан Фініка тижня дає 429 `AI_FINYK_VISION_QUOTA`, а QR-lookup лишається доступним; що Free на `week-plan` отримує 402 при увімкненому білінгу, а `day-plan` списує 1 дію; що хід чату з tool-викликом у Free списує рівно 1 і не чіпає `tool:<name>`; що trial-рядок створюється при signup лише з прапорцем і що на 8-й день `getUserPlan` віддає free; що `past_due` дає `grace` при `current_period_end + 2d` і `free` при `+4d`; що знімок founder-а має `state: "pro"`.
3. `pnpm --filter @sergeant/api-client test`: `billing.contract.test.ts` з полем `access`.
4. `pnpm dev:db` застосовує 149 і `.down.sql` відкочується чисто (Hard Rule #4).
5. Click-through у `pnpm dev:web` + `pnpm dev:server`, скріншоти в PR:
   - новий акаунт з `BILLING_REVERSE_TRIAL_ENABLED=true`: `PlanSection` показує Premium (trial) і дату кінця; фото їжі працює без пейволу;
   - Free-акаунт: лічильник чату показує `x/20` і «оновиться в понеділок»; 4-те фото тижня відкриває PaywallModal; тижневий план відкриває PaywallModal; 6-й скан чека без QR відкриває PaywallModal; PDF у звітах відкриває PaywallModal; CSV працює;
   - `/pricing`: таблиця збігається з реєстром, немає «2 пристрої», Mono-синк у Free.
6. `pnpm check` зелений; `pnpm lint:specs`, лінк-чекер доків.
7. Grep-гейт: у `apps/**` немає імпортів `effectiveLimits` чи `premiumFeatures`, і жодного хардкоду `aiRequestsPerDay`.

## Ризики та відкриті питання

- **Сторінки «Твій Premium» немає.** Підтвердження оплати є (тост `pricing.toast.subscriptionActive`) і `PlanSection` показує план і дати, але людина, яка платить, ніде не бачить, що їй відкрито і скільки вона використала. Рішення: не у v1, у спеку запуску.
- **Tool-виклики в Pro.** `consumeToolQuota` для Pro лишається денним. Перевір, що його ліміт для Pro не нижчий за реальне використання, інакше Premium побачить відмову, яку каскад обіцяв прибрати.
- **Перехід з денного на тижневе посеред тижня.** У день деплою Free-користувач отримує повні 20 на поточний ISO-тиждень, бо старі денні `default`-рядки не переносяться. Це свідомо, міграцію даних не робимо.
- **Номер міграції.** Паралельні гілки можуть зайняти 149. Звірити з `main` перед комітом.
- **Асиметрія до запуску.** Поки `isBillingEnforced()` = false, Premium-гейти не діють, а квоти діють. Free тоді бачить пейвол на фото (квота) і на PDF (web-гейт), але голос і recall працюють. Це вже так сьогодні, спека цього не міняє.
- **`D3` на `/pricing` («без trial-таймера»)** суперечить reverse trial. Новий ADR має явно зняти D3 для trial-акаунтів, а копія `/pricing` не повинна обіцяти «без trial».
- **Better Auth hook** ще не використовувався в репо. Треба перевірити, що помилка вставки trial-рядка не валить реєстрацію: логувати (pino, Hard Rule #21) і йти далі.
