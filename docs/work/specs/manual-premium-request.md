# SPEC: ручний Premium за запитом із пейволу (О-3 а)

> **Last touched:** 2026-11-18 by @claude (виконано в гілці `claude/awesome-goodall-8s5uky`, PR не відкрито; § Стан виконання). Раніше того ж дня: внесено відповіді founder-а на Б-1..Б-3 і інженерні рішення головної сесії. **Next review:** 2027-02-18.
> **Status:** Implemented - міграція `169_feedback_premium_request.sql`, `apps/server/src/modules/billing/manualAccess.ts`, `apps/server/src/modules/telegram/manualGrantCallback.ts`, `POST /api/billing/manual-access` у `apps/server/src/routes/billing.ts`, `apps/web/src/core/billing/{PaywallModal,ManualPremiumNotice,useManualAccessRequest}.tsx?`; click-through § Верифікація п. 7 і живі кроки п. 2 не виконано, див. § Стан виконання.

<!-- Інтервʼю: питання П-24, П-25, П-26 поставлено в
docs/work/research/2026-11-17-modules-teardown-vs-leaders.md § 11.8, відповіді
founder-а 2026-11-18 у § 11.9. Три уточнення (тригер видачі, що бачить
людина, ієрархія кнопок) founder дав того ж дня, § 11.9, блок «Уточнення,
які принесли спеки О-2 і О-3». Варіант О-3 (а) ухвалено в § 11.6/§ 11.7.
Розвідку по коду зроблено 2026-11-18. -->

## Проблема

Квоти Free діють у проді (20 дій Сержанта, 3 фото їжі і 5 сканів чеків на ISO-тиждень, `packages/shared/src/billing/entitlements.ts`), а зняти їх нічим: оплата вимкнена (`isBillingEnforced()` = false, `apps/server/src/modules/billing/provider.ts`), пейвол веде на `/pricing` зі статусом «Скоро» і вейтлістом (розбір 2026-11-17, § 6 рядок «Тарифи й оплата», § 11.6 О-3). Людина, яка вперлась у ліміт і готова користуватись більше, не має жодного шляху далі, а founder не знає, що така людина є.

## Мета

До запуску оплати людина з акаунтом, яка дійшла до пейволу, може одним натиском попросити Premium. Запит записується в `feedback_entries`, і founder отримує в Telegram повідомлення з кнопкою. Одним тапом по ній він видає Premium на 30 днів. Після видачі квоти Free для акаунта не діють, бо `getUserPlan` повертає `pro`. Людина бачить рядок про відкритий доступ, а за два дні до кінця попередження. Через 30 днів акаунт сам стає Free. Повторно попросити з того самого акаунта не можна. Перевірка: сценарії з § Верифікація проходять, а в `subscriptions` після тапу є рядок `provider='manual'` з `current_period_end` через 30 днів.

## Рішення дизайну

**Продуктові (від founder-а):**

- **Запит пишеться в таблицю відгуків і летить founder-у в Telegram.** Джерело: П-24 (Б), § 11.9. Лист на support (В) відкинуто.
- **Ручний Premium триває 30 днів.** Джерело: П-25, число назвав founder (§ 11.9). У коді константа `MANUAL_PREMIUM_DAYS = 30` поруч із `REVERSE_TRIAL_DAYS` (`apps/server/src/modules/billing/reverseTrial.ts`) з коментарем-посиланням на П-25. «Безстроково» (А) відкинуто.
- **Просити може кожен, хто дійшов до пейволу; один запит на акаунт за весь час його існування.** Джерело: П-26 (А), § 11.9. Allowlist (Б) відкинуто. Після 30 днів новий запит з того самого акаунта не приймається, а стара кнопка в Telegram доступ не продовжує (див. ідемпотентність видачі).
- **Founder видає доступ кнопкою під повідомленням у Telegram, одним тапом.** Джерело: § 11.9, уточнення до О-3 (Б-1 → (А)). Команду `/grant` і скрипт з internal-ендпоінтом відкинуто.
- **Людина бачить рядок про видачу і попередження перед кінцем, як у пробному періоді.** Джерело: § 11.9, уточнення до О-3 (Б-2 → (Б)). Деталі в технічних рішеннях («Рядок про ручний Premium»).
- **На пейволі «Попросити доступ» головна дія, перехід до планів і списку очікування другорядна.** Джерело: § 11.9, уточнення до О-3 (Б-3 → (А)). Назву кнопки дає § 11.6.
- **Механізм діє лише до запуску оплати.** Джерело: § 11.6 О-3 (а), «до запуску оплати». У коді це `!isBillingEnforced()`: щойно увімкнено будь-якого провайдера, сервер перестає приймати запити, а знімок віддає `available: false`. Окремого прапорця не додаємо.

**Технічні (виведено з коду; продукт не змінюють):**

- **Кнопка на всіх пейволах однією зміною.** Пейвол у web один компонент, `apps/web/src/core/billing/PaywallModal.tsx`. Його викликають пʼять місць: `core/hub/HubChat.tsx`, `core/hub/HubReports.tsx`, `modules/nutrition/components/meal-sheet/PhotoStep.tsx`, `modules/nutrition/components/WeekPlanButton.tsx` і `modules/finyk/components/receiptScan/useFinykVisionPaywall.tsx`. Коли `access.manualAccess.available` = true, основна кнопка футера (`variant="solid"`, `data-autofocus`) стає «Попросити доступ». Наявна CTA «Дивитися плани» (→ `/pricing?source=paywall`) переходить у другорядну (`variant="ghost"`) поруч із «Закрити». Коли `available` = false або поля немає, футер лишається як сьогодні.
- **Запит = рядок `feedback_entries` з новою категорією `premium_request`.** Таблиця (міграція 093) уже є inbox-ом founder-а, і П-24 називає саме її. Клієнтська схема `FeedbackCategorySchema` (`packages/shared/src/schemas/api.ts`, `idea | bug | other`) **не розширюється**: інакше запит можна було б створити через анонімний `POST /api/feedback` в обхід перевірок і Telegram. Категорію пише лише `manualAccess.ts`, власним SQL. Поля рядка:
  - `category='premium_request'`, `user_id` із сесії;
  - `message` формує сервер: `Запит Premium з пейволу: <surface>` (CHECK 1..2000 з міграції 093);
  - `page`/`viewport` як у фідбеку, `user_agent` обрізаний до 256 символів, як у `routes/feedback.ts`, `app_env` як там само;
  - `premium_granted_at` лишається `NULL` до видачі.
- **«Один запит на акаунт» тримає БД.** Частковий унікальний індекс по `user_id` для `category='premium_request'` плюс CHECK, що такий рядок має `user_id`. Вставка робиться з `ON CONFLICT DO NOTHING`. Нуль вставлених рядків дає `409 MANUAL_ACCESS_ALREADY_REQUESTED`, і Telegram не надсилається. Тож один акаунт дає founder-у не більше одного повідомлення.
- **Ендпоінт запиту.** `POST /api/billing/manual-access` (`requireSession()`), тіло `{ surface: PaywallSurface }` (тип з `entitlements.ts`). Відповіді:
  - `200 { ok: true, requestedAt }`;
  - `409 MANUAL_ACCESS_ALREADY_REQUESTED` — запит уже є;
  - `409 MANUAL_ACCESS_NOT_NEEDED` — `accessStateOf` ≠ `free`;
  - `409 MANUAL_ACCESS_CLOSED` — `available` = false (див. нижче).
- **Rate limit: наявний бакет `api:billing:checkout`, нового числа немає.** Ендпоінт ставить `rateLimitExpress` з тими самими опціями, що в `POST /api/billing/checkout` (`apps/server/src/routes/billing.ts`: `key: "api:billing:checkout"`, 10 на годину на IP). Ключ спільний, тож запит і checkout рахуються в одному відрі. До запуску оплати checkout не працює, а після запуску закривається ендпоінт запиту, тож одночасно вони не конкурують. Основний захист від спаму тут унікальний індекс: один акаунт дає один запит. Створення акаунтів стримує наявний `api:auth:sensitive` (`apps/server/src/config/rateLimit.ts`, `AUTH_SENSITIVE_RATE_LIMIT`, числа з env `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SEC`).
- **Стан запиту йде у знімок доступу, окремого GET немає.** `BillingAccessSchema` отримує поле `manualAccess: { available: boolean; requestedAt: string | null }`, на клієнті `.optional()`. Рахує `buildAccessSnapshot` (`apps/server/src/modules/billing/accessSnapshot.ts`). `available` = true, коли виконано все:
  - `!isBillingEnforced()`;
  - задані `TELEGRAM_WAITLIST_BOT_TOKEN`, `TELEGRAM_WAITLIST_ADMIN_CHAT_ID` і `TELEGRAM_WAITLIST_WEBHOOK_SECRET`. Без секрету вебхук відповідає 503 (`routes/telegram-webhook.ts`), і тап по кнопці видачі не дійде до сервера.

  Web показує кнопку лише тоді, коли поле є і `available` = true. Якщо `requestedAt` не `null`, основною лишається неактивна кнопка зі станом «запит надіслано». Hard Rule #3: схема в `@sergeant/shared`, тип в `api-client` і contract-тест міняються в одному PR.

- **Без повністю налаштованого Telegram запитів не приймаємо.** П-24 (Б) вимагає і запису, і повідомлення, а видача йде через кнопку. Запит, про який founder не дізнається або який не зможе видати, згниє в таблиці, а людина вважатиме, що попросила.
- **Канал Telegram: бот вейтліста, приватний чат founder-а.** Шлемо через `createTelegramApiClient(env.TELEGRAM_WAITLIST_BOT_TOKEN)` (`modules/alerts/telegramShipper.ts`) у `env.TELEGRAM_WAITLIST_ADMIN_CHAT_ID`. Документація змінної в `apps/server/src/env/telegramEnv.ts` називає її «`chat_id` власника», і це єдиний особистий канал founder-а в env. Вебхук цього бота вже приймає натискання inline-кнопок (опитування, `handleSurvey` у `routes/telegram-webhook.ts`). `SERGEANT_OPS_CHAT_ID` відкинуто: це supergroup, де будь-який учасник бачить усі топіки (ADR-0030, розділ «Негатив / debt», пункт «Telegram RBAC»), а callback-и його бота ходили через n8n.
- **Повідомлення в Telegram без персональних даних.** Текст: `Запит Premium #<feedback_entries.id> · пейвол: <surface>`. Під ним одна inline-кнопка «Видати на 30 днів» з `callback_data` = `mp:grant:<id>` (менше 64 байтів, межа Telegram). Без email, імені і сирого `user_id`: номера запиту досить, ядро видачі саме знаходить акаунт. Надсилаємо після COMMIT вставки і fail-open: помилка Telegram не перетворює `200` на помилку, запит лишається в таблиці, у лог іде `warn` з `requestId` і `httpStatus`. Тексту повідомлення і токена в лозі немає (Hard Rule #21).
- **Обробник тапу у вебхуку бота.**
  - Новий модуль `apps/server/src/modules/telegram/manualGrantCallback.ts` експортує `parseManualGrantCallback(update)`. Дані розбираються суворо: регулярний вираз `^mp:grant:([1-9]\d{0,17})$`. `waitlistBot.ts` не чіпаємо: там уже 615 рядків, Hard Rule #18.
  - У `routes/telegram-webhook.ts` гілка стоїть після перевірки секрету і відсіву ботів, але до `parseCommand`. Прийом лише за трьох умов: `callback_query.message.chat.type === "private"`, `callback_query.message.chat.id` і `callback_query.from.id` обидва дорівнюють `TELEGRAM_WAITLIST_ADMIN_CHAT_ID`. Інакше відповідь `200 { ok: true }` без дії, як `/stats` для чужих: сама відмова не видає, що кнопка існує.
  - Після видачі: `answerCallbackQuery` з коротким підтвердженням, а `editMessageText` заміняє текст на `Запит Premium #<id> · видано до <дата за Києвом>` і прибирає клавіатуру. Це той самий клієнт, що редагує повідомлення опитування.
  - Повторний тап ідемпотентний: ядро повертає `ALREADY_GRANTED`, тож лише `answerCallbackQuery` «уже видано», без змін у БД. `ALREADY_PREMIUM`, `REQUEST_NOT_FOUND` і `USER_GONE` так само дають лише `answerCallbackQuery` з причиною і нуль змін.
  - Без `answerCallbackQuery` клієнт Telegram крутить годинник ~30 с (коментар у `waitlistBot.ts`), тому його викликаємо на кожній гілці.
- **Справжність вебхука: уже зроблена для цього бота, нового механізму немає.** `routes/telegram-webhook.ts` приймає апдейт лише з заголовком `X-Telegram-Bot-Api-Secret-Token`. Заголовок звіряється з `TELEGRAM_WAITLIST_WEBHOOK_SECRET` через `isValidWebhookSecret` (`modules/telegram/waitlistBot.ts`, `crypto.timingSafeEqual`). Без секрету або токена ендпоінт віддає 503, з хибним секретом 401, тіла в лог не пишемо. Над ним стоїть `rateLimitExpress({ key: "api:telegram-waitlist" })`. Отже, підроблений callback без секрету не проходить на рівні маршруту, а справжній callback від чужого чату відсікає перевірка chat/from вище.
- **Ядро видачі `grantManualAccess(pool, requestId)` — одна транзакція:**
  1. `UPDATE feedback_entries SET premium_granted_at = NOW() WHERE id = $1 AND category = 'premium_request' AND premium_granted_at IS NULL RETURNING user_id`. Нуль рядків: якщо запит є, але вже виданий, `ALREADY_GRANTED`; якщо запиту немає, `REQUEST_NOT_FOUND`. Ідемпотентність прив'язана до запиту, а не до поточного стану акаунта, тож тап по старій кнопці після 30 днів доступ не продовжує (П-26).
  2. Заблокувати рядки `subscriptions` цього користувача (`FOR UPDATE`). Якщо є чинний ентайтлмент за предикатом `getUserPlan`, повернути `ALREADY_PREMIUM` і зробити ROLLBACK, тож позначка з кроку 1 не лишається. Предикат: `active`/`trialing` з `current_period_end IS NULL OR > NOW()`, або `past_due` у межах grace.
  3. **Виправлення знайденого дефекту.** Рядки зі статусом `active`/`trialing`/`past_due`, що лишились (вони вже прострочені), перевести в `status='canceled', updated_at=NOW()`. Причина: частковий унікальний індекс `subscriptions_user_active_idx` (міграція 056) дозволяє лише один такий рядок на користувача, а прострочений trial лишається `trialing` назавжди (коментар у `getUserPlan.ts`). Через це видача такому акаунту сьогодні не працює: `POST /api/internal/billing/upgrade` на конфлікті робить лише `SET plan='pro'` і доступу не дає. Крок має власний тест RED→GREEN (§ Верифікація п. 3).
  4. `INSERT INTO subscriptions (user_id, plan, status, provider, current_period_end) VALUES ($1, 'pro', 'active', 'manual', NOW() + make_interval(days => MANUAL_PREMIUM_DAYS))`. `trial_ends_at` лишається `NULL`, бо за міграцією 073 це означає «trial не було». FK-помилка `23503` (акаунт видалено, а рядок фідбеку без FK пережив його) дає `USER_GONE` і ROLLBACK.

  Повертає `{ currentPeriodEnd }`.

- **Кінець періоду: через 30 днів людина стає Free автоматично, без grace і без cron.** Так сьогодні закінчується будь-який період у `getUserPlan.ts`: `active` діє, доки `current_period_end > NOW()`, а grace існує лише для `past_due`. Ручний Premium закінчується так само, як оплачений період після скасування.
- **Рядок про ручний Premium «як у пробному періоді».**
  - **Звідки форма і число.** У коді trial-банера вже немає: `TrialBanner` видалено рішенням власника 2026-10-09 разом з іншими наджами, а системні сигнали стали рядком `Notice` (`docs/work/specs/planning/redesign-v3-progress.md`, «Рішення власника 2026-10-09», п. 1; примітив `apps/web/src/shared/components/ui/Notice.tsx`). Константи кількості днів попередження в коді теж немає. Тому правило береться з записаного рішення про trial: «банер за ≤2 дні до кінця (sticky у останню добу)» (`docs/work/specs/access-tiers.md`, § Рішення дизайну, пункт «Сповіщення: лише банер у застосунку», інтервʼю 2026-09-27). Нового числа не вводимо: у коді `MANUAL_PREMIUM_WARN_DAYS = 2` з коментарем-посиланням на цей пункт.
  - **Новий компонент** `apps/web/src/core/billing/ManualPremiumNotice.tsx` на хабі (`core/app/HubHomeView.tsx`). Колись саме тут inline-стояв trial-банер (коментар «iOS-install + Trial keep their inline banners»). Даних знімка вже досить: `usePlan()` віддає `access.state === "pro"`, `subscription.provider === "manual"` і `subscription.currentPeriodEnd`. Founder-байпас і безстроковий internal-грант мають `currentPeriodEnd = null` і рядка не отримують, reverse trial має `state: "trial"` і теж не отримує.
  - **Після видачі:** `Notice` «Premium відкрито до <дата>» з кнопкою закриття. Закриття запамʼятовується в `localStorage` під ключем із `currentPeriodEnd`, щоб показ був один на видачу.
  - **За ≤2 доби до кінця:** попередження «Premium діє до <дата>». Закрити його можна, але за ≤24 год до кінця закриття не діє (sticky).
  - **Тексти** за `sergeant-copy-and-tone`. `PlanSection` («Діє до <дата>», `manualGrantText`) не змінюється.
- **Ручний Premium не заважає майбутній оплаті.** `checkoutGuard.ts` не рахує `provider='manual'` діючою підпискою, тож людина з ручним доступом зможе купити Premium, коли оплату увімкнуть. `PlanSection` уже не показує кнопку «Скасувати» для `manual`.
- **Анонім кнопки не бачить.** Без сесії `usePlan` не тягне знімок (`enabled: !signedOut`, `apps/web/src/core/billing/usePlan.ts`), тож поля `manualAccess` немає. Пейвол для аноніма лишається як сьогодні. П-26 говорить про «запит на акаунт».

## Міграція БД

Потрібна одна міграція: **`169_feedback_premium_request.sql`** + `169_feedback_premium_request.down.sql`. Номер 169 призначила головна сесія; 168 зайнято паралельною спекою, його не займати. Таблиця `subscriptions` не змінюється.

Up:

```sql
-- CHECK категорії: надмножина (idea, bug, other) + premium_request.
-- Назву обмеження звірено за кроком 1 § Верифікація.
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_category_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_category_check
  CHECK (category IN ('idea', 'bug', 'other', 'premium_request'));

-- Запит Premium завжди має акаунт: без цього NULL-и обійшли б унікальність.
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_premium_request_user_check
  CHECK (category <> 'premium_request' OR user_id IS NOT NULL);

-- Коли founder видав доступ за цим запитом; NULL = не видано.
ALTER TABLE feedback_entries ADD COLUMN IF NOT EXISTS premium_granted_at TIMESTAMPTZ;

-- Один запит на акаунт (П-26).
CREATE UNIQUE INDEX IF NOT EXISTS feedback_entries_premium_request_user_uidx
  ON feedback_entries (user_id)
  WHERE category = 'premium_request';
```

Down:

```sql
DROP INDEX IF EXISTS feedback_entries_premium_request_user_uidx;
ALTER TABLE feedback_entries DROP COLUMN IF EXISTS premium_granted_at;
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_premium_request_user_check;
-- Звужений CHECK не стане на таблицю з рядками premium_request: down їх видаляє.
-- Прод на down не покладається (sergeant-data-and-migrations).
DELETE FROM feedback_entries WHERE category = 'premium_request';
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_category_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_category_check
  CHECK (category IN ('idea', 'bug', 'other'));
```

Сумісність зі старим app під час rolling deploy:

- Старий код пише лише `idea | bug | other`, розширений CHECK їх приймає. Нова колонка nullable без дефолту, а старий `INSERT` її не називає.
- Таблиця мала (інбокс бети), тож індекс без `CONCURRENTLY` не блокує помітно.
- `DROP COLUMN` у down не порушує двофазне правило: прод на down не покладається.
- `NO_FK_ALLOWLIST` у `migrations/__tests__/141-142-user-scoped-cascade.test.ts` не змінюється. `user_id` і далі без FK, тож запит переживає видалення акаунта, як і решта фідбеку.
- Список таблиць без Drizzle-моделі в `scripts/check-schema-drift.mjs` уже містить `feedback_entries`.

## Поверхня змін

- `apps/server/src/migrations/169_feedback_premium_request.sql` + `.down.sql`: схема вище.
- `apps/server/src/modules/billing/manualAccess.ts` (новий) + `manualAccess.test.ts`:
  - константи `MANUAL_PREMIUM_DAYS`;
  - `requestManualAccess(pool, userId, ctx, telegram)`: вставка, потім Telegram після COMMIT;
  - `grantManualAccess(pool, requestId)`: ядро видачі;
  - `manualAccessStatus(pool, userId)` для знімка;
  - `TelegramApiClient` інжектується, щоб тести не ходили в мережу.
- `apps/server/src/modules/billing/accessSnapshot.ts`: поле `manualAccess`.
- `apps/server/src/routes/billing.ts`: `POST /api/billing/manual-access` з rate limit `api:billing:checkout`. Файл зараз має 430 рядків; якщо роут не влазить у 600, винести його в `routes/billingManualAccess.ts` (Hard Rule #18).
- `apps/server/src/modules/telegram/manualGrantCallback.ts` (новий) + тест: парсер `mp:grant:<id>`, перевірка chat/from і тексти відповіді боту.
- `apps/server/src/routes/telegram-webhook.ts` + `telegram-webhook.route.test.ts`: гілка callback-а видачі до `parseCommand`.
- `apps/server/src/modules/feedback/feedbackService.ts`, `apps/server/src/modules/telegram/waitlistBot.ts`: без змін.
- `packages/shared/src/schemas/api.ts`: `BillingAccessSchema.manualAccess` (`.optional()`), `ManualAccessRequestSchema`, `ManualAccessResponseSchema`, enum кодів 409. `FeedbackCategorySchema` не чіпати.
- `packages/shared/src/openapi/routes.ts`: реєстрація `POST /api/billing/manual-access`.
- `packages/api-client/src/endpoints/billing.ts` + `src/__tests__/contracts/billing.contract.test.ts`: метод `requestManualAccess`, поле в статусі, хелпер коду 409 за зразком `billingCheckoutConflictCode`.
- `apps/web/src/core/billing/PaywallModal.tsx` + `PaywallModal.test.tsx`:
  - основна кнопка «Попросити доступ», «Дивитися плани» другорядна;
  - стан «надіслано»;
  - мутація інвалідує `billingKeys.status` (Hard Rule #2, `apps/web/src/shared/lib/api/queryKeys.ts`).
- `apps/web/src/core/billing/ManualPremiumNotice.tsx` (новий) + тест; монтування в `apps/web/src/core/app/HubHomeView.tsx`.
- `apps/web/src/shared/i18n/uk.ts` (група `paywallModal` і нова група для рядка) та англійський каталог, якщо група там дзеркалиться: тексти.
- Доки в тому ж PR:
  - `docs/operations/observability/feedback-loop.md`: нова категорія і колонка в інбоксі;
  - журнал рішень у `.agents/skills/sergeant-module-billing/SKILL.md` (зміна SKILL.md за `sergeant-writing-skills`, далі `pnpm lint:skills && pnpm skills:lock`);
  - `docs/work/specs/access-tiers.md` § Поза скоупом: рядок «Адмін-інструмент ручної видачі» посилається на цю спеку;
  - стан О-3 у § 11.7 розбору.
- Owner-скіли: `sergeant-module-billing` (основний) + `sergeant-server-api`, `sergeant-data-and-migrations`, `sergeant-web-ui`, `sergeant-module-integrations` (Telegram), `sergeant-copy-and-tone`. Це понад дві поверхні з контрактною залежністю, тож виконання через `sergeant-deliver-squad` у порядку: міграція → сервер → api-client → web.

## Порядок викочування

Фронт їде раніше за бекенд: Vercel збирає `main` одразу, а `deploy-api` чекає зеленого CI (~25 хв, AGENTS.md § Deployment). Безпечно це завдяки самій формі контракту:

1. Один PR на всі шари допустимий. У вікні «новий web, старий API» старий `/api/billing/status` не віддає `manualAccess`. Поле на клієнті `.optional()`, тож пейвол лишається як сьогодні і на неіснуючий `POST` не ходить. `ManualPremiumNotice` читає лише наявні поля, і без грантів його не видно.
2. Бекенд: міграція 169 застосовується в ENTRYPOINT до старту нового сервера. Після деплою знімок віддає `manualAccess`, і кнопка зʼявляється без нового деплою фронту.
3. До мержу перевір, що в Coolify задані `TELEGRAM_WAITLIST_BOT_TOKEN`, `TELEGRAM_WAITLIST_ADMIN_CHAT_ID` і `TELEGRAM_WAITLIST_WEBHOOK_SECRET`. Без них `available: false` і кнопки не буде: стан тихий, але безпечний.
4. Після мержу `pnpm deploy:status`: бекенд на коміті мержу.

## Поза скоупом v1

- Push, email чи повідомлення людині в Telegram про видачу або кінець доступу: лише `Notice` на хабі і наявний рядок у `PlanSection`.
- Відмова на запит із Telegram (кнопка «Відхилити»), черга чи екран запитів для founder-а поза Telegram і psql.
- Продовження ручного Premium з інтерфейсу і другий запит з того самого акаунта (П-26). Founder продовжує поза цією фічею: SQL-рядок `provider='manual'` або `POST /api/internal/billing/upgrade` (безстроково).
- Виправлення `POST /api/internal/billing/upgrade` на простроченому `trialing`: ядро видачі цієї спеки обходить дефект своїм кроком 3, а internal-ендпоінт лишається як є.
- Кнопка «Попросити доступ» на `/pricing`, у налаштуваннях і в лендінгу: за § 11.6 лише пейвол.
- Вхід або реєстрація з пейволу для аноніма.
- Повернення загального trial-банера (`TrialBanner`) чи попередження для reverse trial.
- PostHog-подія запиту і дашборд: лічильник дає сама таблиця.
- Ретрай недоставленого повідомлення в Telegram.
- Глобальна стеля запитів на добу і стеля витрат на ручних Premium: чекає числа зі спеки `ai-cost-ceiling`.
- Mobile-паритет (`apps/mobile`, пауза ADR-0094).
- Ручні гранти при запуску оплати доживають свої 30 днів, нові запити закриває `isBillingEnforced()`. Окремої міграції грантів немає.

## Верифікація (обовʼязково)

1. **До написання SQL звір назву CHECK за міграціями репо.** `rg -n "category" apps/server/src/migrations/093_feedback_entries.sql` показує inline-CHECK без імені, тож Postgres назве його `feedback_entries_category_check`. `rg -n "feedback_entries_category_check|feedback_entries.*CONSTRAINT" apps/server/src/migrations/` не має знайти пізнішого перейменування. Після `pnpm dev:db` (до нової міграції) `psql "$DATABASE_URL" -c '\d feedback_entries'` (локальна БД з `.env`) показує саме цю назву. Якщо назва інша, вона йде в SQL міграції 169 замість наведеної.
2. `pnpm lint:migrations` → код 0, номер 169 без пропуску відносно `main` (168 від паралельної спеки має бути на `main` до мержу; інакше lint покаже пропуск, і порядок мержу треба погодити). `pnpm dev:db` застосовує 169. `pnpm db:drill:down` відкочує її чисто. `\d feedback_entries` показує:
   - `feedback_entries_category_check` з `premium_request`;
   - `feedback_entries_premium_request_user_check`;
   - колонку `premium_granted_at timestamptz`;
   - індекс `feedback_entries_premium_request_user_uidx`.
3. **RED→GREEN на дефект простроченого trial.** Спершу в `manualAccess.test.ts` пишеться тест: є рядок `subscriptions` (`plan='pro', status='trialing', provider='manual', current_period_end = now() - 1 day`) і запит; після `grantManualAccess` `getUserPlan` має віддати `pro`. Без кроку 3 ядра тест червоний: insert падає на `subscriptions_user_active_idx` (`23505`), або, у варіанті з `ON CONFLICT`, доступ лишається `free`. З кроком 3 тест зелений, старий рядок має `status='canceled'`.
4. `pnpm --filter @sergeant/server test -- manualAccess manualGrantCallback telegram-webhook billing` зелений. Тести ловлять:
   - перший запит Free-акаунта дає 200 і рівно один `sendMessage` у chat id з env, з inline-кнопкою `mp:grant:<id>`; у тексті немає `user_id` і email;
   - другий запит того самого акаунта дає 409 `MANUAL_ACCESS_ALREADY_REQUESTED` і нуль викликів Telegram;
   - запит від `pro`/`trial`/`grace` дає 409 `MANUAL_ACCESS_NOT_NEEDED`;
   - з увімкненим провайдером або з порожнім будь-яким із трьох Telegram-env запит дає 409 `MANUAL_ACCESS_CLOSED`, а знімок `available: false`;
   - помилка Telegram дає 200, а рядок лишається в таблиці;
   - `POST /api/feedback` з `category: "premium_request"` дає 400;
   - видача створює рядок `pro/active/manual` з `current_period_end` ≈ now + 30 днів, `getUserPlan` віддає `pro`, `premium_granted_at` заповнено;
   - друга видача того самого запиту дає `ALREADY_GRANTED` без змін; так само після штучного спливання 30 днів доступ не продовжується;
   - видача акаунту з чинним платним Premium дає `ALREADY_PREMIUM`, `premium_granted_at` лишається `NULL`;
   - на `current_period_end + 1 хв` (фейковий час) `accessStateOf` дає `free`, і тижнева квота знову діє;
   - видалений акаунт дає `USER_GONE`;
   - вебхук: callback `mp:grant:<id>` з admin chat і admin from дає видачу, `answerCallbackQuery` і `editMessageText` без клавіатури;
   - той самий callback з іншого chat id, з іншим `from.id` або з груповим `chat.type` дає 200 і нуль змін у БД;
   - без заголовка секрету 401, `mp:grant:abc` і `mp:grant:0` дають ignore.
5. `pnpm --filter @sergeant/shared test` і `pnpm --filter @sergeant/api-client test`: `billing.contract.test.ts` проходить з `manualAccess` і без нього (старий сервер).
6. `pnpm --filter @sergeant/web test -- PaywallModal ManualPremiumNotice` зелений.
   - Пейвол:
     - без `manualAccess` або з `available: false` футер як сьогодні (основна «Дивитися плани»);
     - з `available: true, requestedAt: null` основна «Попросити доступ» з `data-autofocus`, «Дивитися плани» другорядна;
     - клік дає рівно один `POST`, потім стан «надіслано»;
     - з `requestedAt` одразу стан «надіслано»;
     - 409 `ALREADY_REQUESTED` теж дає «надіслано», а не помилку.
   - Рядок на хабі:
     - `state: "pro"` + `manual` + кінець через 10 днів дає «відкрито до»; після закриття рядок не повертається;
     - кінець через 36 год дає попередження;
     - кінець через 12 год дає попередження без кнопки закриття;
     - `currentPeriodEnd: null` або `state: "trial"` дають нуль рядків.
7. Click-through, кадри 390 × 844 у PR. Запуск: `pnpm dev:server` + `pnpm dev:web`, тестовий бот, тестовий chat id і секрет у локальному `.env`, не в репо. Вебхук бота спрямований на локальний сервер через тунель або `curl` з тим самим секретом. Кроки й очікуваний стан:
   - Free-акаунт вичерпує 3 фото тижня, відкривається пейвол з основною «Попросити доступ». Тап дає стан «надіслано».
   - У Telegram приходить `Запит Premium #<n> · пейвол: unlimited_ai_photo` з кнопкою.
   - Тап по кнопці: повідомлення стає «видано до <дата>», кнопка зникає.
   - Перезавантаж застосунок: на хабі рядок «Premium відкрито до <дата>», фото працює без пейволу, `PlanSection` пише «Діє до <дата через 30 днів>».
   - Будь-який пейвол більше не відкривається, бо стан `pro`.
   - Виклик того самого callback-а через `curl` дає `answerCallbackQuery` «уже видано», а в `subscriptions` нового рядка немає.
8. `pnpm check` зелений у CI; `pnpm lint:specs` → 0.
9. Grep-гейт:
   - `rg -n "premium_request" packages/shared/src/schemas/api.ts` не показує його в `FeedbackCategorySchema`;
   - `rg -n "logger\.\w+\(" -A4 apps/server/src/modules/billing/manualAccess.ts apps/server/src/modules/telegram/manualGrantCallback.ts` не показує в лог-об'єктах `userId`, `user_id`, `email`, токен чи текст повідомлення.

## Ризики та відкриті питання

Відкритих продуктових питань немає: П-24..П-26 і три уточнення закрито в § 11.9.

- **«Як у пробному періоді» спирається на записане рішення, а не на живий код.** Trial-банер видалено 2026-10-09 (наджі), константи днів у коді немає. Число 2 і sticky в останню добу взято з `access-tiers.md`, форма `Notice` за рішенням 2026-10-09. Якщо founder під «як у trial» мав на увазі інше, правиться лише `ManualPremiumNotice`.
- **Вартість моделі.** Ручний Premium знімає тижневі квоти, і в силу входить Pro-каскад: 20 важких запитів на добу, потім 80 стандартних, далі floor без ліміту (`resolveProTier`, `modules/chat/aiQuota.ts`). Стелі на кількість грантів немає, числа зі спеки `ai-cost-ceiling` теж. Стримує те, що кожну видачу founder робить руками.
- **Масова реєстрація → багато повідомлень.** Один запит на акаунт не захищає від багатьох акаунтів. Діють лише чинні ліміти: `api:billing:checkout` на ендпоінті (за IP) і `api:auth:sensitive` на реєстрації. Нових чисел спека не вводить; глобальна стеля поза скоупом.
- **Витік `TELEGRAM_WAITLIST_WEBHOOK_SECRET`.** З секретом можна підробити апдейт з `from.id` founder-а і видати 30 днів Premium під будь-який наявний номер запиту. Наслідок обмежений: лише акаунти, що вже попросили, один раз кожен. Секрет живе лише в env Coolify, ротація через повторний `setWebhook`.
- **Прострочений платний рядок, переведений у `canceled`.** Пізній колбек LiqPay/Plata чи вебхук Stripe по цій підписці може зробити upsert у той самий частковий індекс і перезаписати ручний рядок на платний. Для людини це правильно, але виконавець перевіряє, що upsert-и провайдерів (`liqpay.ts`, `plata.ts`, `stripeWebhook.ts`) на такий рядок не падають.
- **Telegram недоступний у момент запиту.** Запит лишається в таблиці без повідомлення і без кнопки; ретраю немає. Founder побачить його лише в psql, а лог `warn` з `requestId` дає слід.
- **Порядок міграцій 168/169.** Якщо спека з 168 змерджиться пізніше, `pnpm lint:migrations` на цьому PR покаже пропуск. Порядок мержу погоджує головна сесія; номер 169 не міняти без неї.
- **Публічне репо.** У тестах і доках лише вигадані id (`user-test-1`, `555000111`, як у `telegram-webhook.route.test.ts`); жодних реальних chat id, user id чи токенів.

## Стан виконання

Виконано 2026-11-18 у гілці `claude/awesome-goodall-8s5uky` (PR не відкрито).

- П. 1, 2: назву CHECK звірено (`feedback_entries_category_check`, перейменувань немає). `pnpm dev:db` і `pnpm db:drill:down` у контейнері виконавця недоступні (немає Docker); замість них 093 → 169 → down → 169 прогнано на локальному Postgres 16, `\d feedback_entries` показав усі чотири обʼєкти. Файл up зроблено безпечним для повторного прогону (`DROP CONSTRAINT IF EXISTS` перед `ADD` для `feedback_entries_premium_request_user_check`). `pnpm lint:migrations` до мержу міграції 168 показує пропуск номера, як і передбачено в § Ризики.
- П. 3: RED→GREEN зафіксовано двічі: на in-memory моделі (`manualAccess.test.ts`, `23505`) і на справжньому Postgres (`manualAccess.integration.test.ts`, `duplicate key value violates unique constraint "subscriptions_user_active_idx"`).
- Тіло `POST /api/billing/manual-access` несе ще опційні `page`/`viewport` з межами `FeedbackSubmitSchema`: їх вимагає пункт «`page`/`viewport` як у фідбеку».
- Копія пейволу й рядка на хабі живе в `apps/web/src/shared/i18n/uk.manualPremium.ts`, а не в `uk.ts`: той на межі `max-lines: 600`.
- Лишається: click-through п. 7 з тестовим ботом і кадри 390 × 844; `pnpm check` у CI; порядок мержу з міграцією 168.
