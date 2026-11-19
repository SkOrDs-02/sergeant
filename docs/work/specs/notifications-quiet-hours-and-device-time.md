# SPEC: тихі години сповіщень і нагадування за часом пристрою

> **Last touched:** 2026-11-18 by @claude (виконано в гілці, § Стан виконання; раніше того ж дня внесено відповіді founder-а на Б-1 і Б-2). **Next review:** 2027-02-16.
> **Status:** Implemented - міграція `168_notification_quiet_hours_and_time_zone.sql`, `apps/server/src/lib/reminders/{userClock,time,budget,nudge,sweep}.ts`, `apps/server/src/modules/mono/monoPushGate.ts`, `apps/server/src/modules/me/notificationPrefs.ts`, `apps/web/src/core/settings/{QuietHoursSettings,MonoPushSetting,useDeviceTimeZoneSync}.tsx?`, `useModuleReminder`; Testcontainers, прогін нового вебу проти старого API і click-through § Верифікація пп. 3-4 не виконано, див. § Стан виконання.

<!-- Джерело: docs/work/research/2026-11-17-modules-teardown-vs-leaders.md,
§ 6 (рядок Push), § 11.6 (О-2), § 11.7 (хвиля 2), § 11.8 (П-22, П-23, дрібні
дефолти), § 11.9 (відповіді founder-а 2026-11-18, включно з блоком
«Уточнення, які принесли спеки О-2 і О-3»). Інтервʼю відбулось там. -->

## Проблема

Розбір 2026-11-17 (§ 6, рядок Push) зафіксував три вади шару сповіщень. Тихі години зашиті в код як 22:00-08:00 за Києвом (`QUIET_HOURS_START_KYIV = 22`, `QUIET_HOURS_END_KYIV = 8` у `apps/server/src/lib/reminders/nudge.ts`), і людина не може їх змінити. Push про операцію Monobank іде завжди: `apps/server/src/modules/mono/webhook.ts` викликає `sendToUserQuietly` на кожну нову операцію без жодного налаштування, тумблера немає. Нарешті, весь серверний прохід нагадувань (`apps/server/src/lib/reminders/sweep.ts`) рахує добу й хвилину за Києвом (`kyivDayKey`, `kyivHm` з `time.ts`), а клієнтський таймер відкритої вкладки (`apps/web/src/shared/hooks/useModuleReminder.ts`) так само віддає київські `dayKey`/`hm`. Людина в іншому поясі отримує звичку «о 07:00» о 07:00 за Києвом, тобто о 00:00 у Нью-Йорку, а відмітка звички, яку прохід читає, щоб не нагадувати про вже зроблене, записана за днем пристрою ([ADR-0078](../../governance/adr/0078-day-boundary-device-local.md)): дві різні доби в одному рішенні.

## Мета

1. Час нагадування, який людина поставила (звичка, тренування, їжа), спрацьовує за годинником її пристрою, на сервері й у відкритій вкладці однаково; нудж Сержанта і компромісний час згорнутої групи теж рахуються в поясі пристрою.
2. Тихі години вмикаються, вимикаються і задаються в налаштуваннях; діють у поясі пристрою на час, який обирає продукт, і на push про операцію Monobank.
3. Push про операцію Monobank має окремий тумблер.
4. Новий веб, викочений раніше за бекенд, працює зі старим API без помилок і без контролів, які нічого не зберігають.
5. Перевірка: тест проходу з фіксованим `now` для людини в `America/New_York` зі звичкою о 07:00 дає відправку о 12:00 UTC (зимовий час), а та сама людина без збереженого поясу отримує її о 05:00 UTC (07:00 за Києвом); вебхук з вимкненим тумблером або в тиху годину не викликає `sendToUserQuietly`.

## Рішення дизайну

**Час пристрою**

- **Збережені часи нагадувань (`routine_habits.reminder_times`, `fizruk_monthly_plan.data.reminderHour/Minute`, `nutrition_prefs.prefs_json.reminderHour`) після переходу означають годинник пристрою, без перерахунку даних.** _Джерело: П-23 (А), § 11.9._ Відкинуто (Б) «лишити Київ для старих записів»: два тлумачення одного поля. Даних не мігруємо, змінюється лише пояс, у якому прохід їх читає.
- **Сервер знає пояс людини як IANA-імʼя (`Europe/Kyiv`, `America/New_York`), а не зсув у хвилинах.** _Джерело: ADR-0078 § 4 («з останнього відомого offset-у, з похибкою після перельоту»); коментар над `kyivDayKeyMinusDays` у `time.ts` фіксує, що перехід на літній час зсуває межу доби, якщо рахувати фіксованим зсувом._ Відкинуто збереження `tz_offset_min` (як у журналах подій, `parseOptionalTzOffsetMin` у `modules/sync/syncV2-core.ts`): нагадування повторюються щодня, і фіксований зсув після переходу на літній час давав би годину похибки до наступного візиту.
- **Пояс надсилає клієнт: `Intl.DateTimeFormat().resolvedOptions().timeZone` у `PATCH /api/me/preferences` (поле `timeZone`), коли він відрізняється від збереженого.** Останній пристрій, що писав, виграє (LWW), як і для решти налаштувань. _Джерело: ADR-0078 § 4, «з останнього відомого»._ Похибку після перельоту до першого відкриття застосунку приймаємо: ADR-0078 називає її свідомою ціною.
- **Пояс невідомий (`time_zone IS NULL`: людина не відкривала новий веб) читається як `Europe/Kyiv`.** _Джерело: поточна поведінка коду (весь прохід на Києві) плюс П-23 (А): для людини в Україні результат тотожний сьогоднішньому._ Невалідне IANA-імʼя сервер відкидає з `400`, у БД не пише.
- **Добу й хвилину прохід рахує в поясі кожної людини окремо:** день-ключ для журналу відміток, стеля на добу, ключі дедупу `push_reminder_log` і слотів бюджету (`push-budget-<день>-<k>`). _Джерело: ADR-0078 § 3 (день-ключ особистих сутностей за пристроєм) і рішення 2026-09-27 у журналі `sergeant-module-push` (спільна стеля на добу)._ Це заодно знімає розбіжність «київська доба проходу проти доби пристрою у відмітках» з § Проблема.
- **Нудж Сержанта лишається о 09:00, але за годинником пристрою.** _Виведено, не питали окремо: О-2 (б), § 11.6 («часовий пояс пристрою для нагадувань»); нудж є приводом у тому самому плані дня (`nudge.ts`, рішення 2026-09-27), а один план не може мати двох годинників._ Число 09:00 не змінюється (спека D5, коментар над слотом у `nudge.ts`).
- **Клієнтський таймер відкритої вкладки (`useModuleReminder`) і його споживачі (`useRoutineReminders`, `useFizrukWorkoutReminder`, `useNutritionReminders`) переходять на день і хвилину пристрою.** _Джерело: О-2 (б); `collapseReminders` у `budget.ts` ставить той самий `tag`, що клієнтський таймер, щоб банери склеювались: з різними годинниками вони приходили б у різний час двома банерами._ Ключі дедупу в `localStorage` (`routine_notify_…-YYYY-MM-DD`) теж за днем пристрою; чистильник старих ключів у `useRoutineReminders` рахує межу так само.
- **Серверні звіти, фінансові періоди й ретеншн журналу (`pruneReminderLog`, 45 діб за Києвом) лишаються на Києві.** _Джерело: ADR-0078 § 3 п. 3, `domain-invariants.md` § Time and dates._

**Тихі години**

- **Тихі години можна вимкнути зовсім: тумблер «Тихі години» плюс вибір меж; за замовчуванням увімкнені, 22:00-08:00.** _Джерело: Б-2 (А), § 11.9, блок «Уточнення, які принесли спеки О-2 і О-3»; межі за замовчуванням там же, з наявних констант `QUIET_HOURS_START_KYIV = 22` і `QUIET_HOURS_END_KYIV = 8` (`apps/server/src/lib/reminders/nudge.ts`). Дефолт «увімкнено» зберігає сьогоднішню поведінку для всіх, доки людина нічого не змінила._
- **Межі тепер у поясі пристрою, а не за Києвом.** _Джерело: О-2 (б), § 11.6; межа «ночі» особиста так само, як межа доби в ADR-0078._ Константи перейменовуються на дефолти без «KYIV» у назві.
- **Тихі години не чіпають час, який людина поставила сама.** Звичка о 07:00 при тихих годинах до 08:00 приходить о 07:00. _Джерело: рішення 2026-09-27 (журнал `sergeant-module-push`, «Тихі години гейтять лише час, який обирає продукт»; `reward-loop-and-reminders.md` § Стан виконання), підтверджено дрібним дефолтом § 11.8, founder не заперечив (§ 11.9)._
- **Тихі години гейтять час, який обирає продукт: нудж Сержанта і компромісний час згорнутої групи (`compromiseTime` у `budget.ts`).** Логіка відбору та сама, що є (найближчий до середини час людини поза вікном, інакше її перший час); змінюються лише межі вікна: вони беруться з налаштувань людини. _Джерело: рішення 2026-09-27, код `compromiseTime`._ Якщо тихі години людини накривають 09:00, нудж переходить на кінець тихих годин того ж дня. _Джерело: те саме правило «продукт не обирає час усередині вікна»; 09:00 обрав продукт, не людина._ Вимкнені тихі години = вікна немає: компромісний час це чиста середина, нудж о 09:00. Ціну (продуктовий час може випасти на ніч) founder прийняв, обравши Б-2 (А).
- **У тиху годину push про операцію Monobank не надсилається зовсім: без ранкового зведення і без беззвучної доставки. Окремий тумблер Monobank лишається.** _Джерело: П-22 (А) і Б-1 (А), § 11.9 («Уточнення, які принесли спеки О-2 і О-3»)._ Операція при цьому записується як завжди, і людина бачить її у Фініку.
- **Межі задаються з точністю до хвилини через наявний `TimeField`** (той самий примітив, що поле часу тренування в тій самій секції `NotificationsSection.tsx`). _Джерело: наявний компонент._ Зберігаються як хвилина доби 0-1439. Вікно може переходити через північ (22:00-08:00) і може не переходити (13:00-15:00); предикат «у вікні» покриває обидва випадки.
- **Однакові початок і кінець відхиляються** (`400` на сервері після злиття патча з поточними значеннями, CHECK у БД як остання лінія; у формі збереження такого значення не відбувається, поле показує помилку). _Джерело: інженерне, з Б-2 (А): «вимкнено» несе тумблер, тож однакові межі нічого не означають і лише створили б неоднозначність «порожнє вікно чи ціла доба»._

**Тумблер Monobank**

- **Тумблер «Операції Monobank» живе в секції «Сповіщення», за замовчуванням увімкнений.** _Джерело: О-2 (а)/(б) «тумблер "Операції Monobank"», § 11.6; дефолт `true` = поточна поведінка коду (`webhook.ts` шле на кожну нову операцію), тож деплой нікому нічого не вимикає мовчки._ Значення живе на сервері (`user_preferences`), бо його читає вебхук без клієнта, як `sergeantNudges` (`useServerPreference.ts`, коментар про серверний прохід).
- **Порядок перевірок у вебхуку:** тумблер вимкнений → не слати; тихі години увімкнені і поточна хвилина в поясі людини у вікні → не слати; інакше слати як сьогодні. _Джерело: П-22 (А), Б-1 (А)._
- **Push Monobank не входить у стелю нагадувань `push_daily_cap`.** _Джерело: рішення 2026-09-27 (стеля стосується нагадувань звичок, тренувань, їжі й нуджу), `reward-loop-and-reminders.md` § Рішення дизайну; О-2 цього не змінює._

**Модель даних і контракт**

- **Нові налаштування живуть у `user_preferences` поруч із `push_daily_cap` (міграція 148) і їдуть через наявну контрактну тріаду `/api/me/preferences`** (`UserPreferencesSchema` / `UserPreferencesPatchSchema` у `packages/shared/src/schemas/api.ts`, `apps/server/src/modules/me/dataRights.ts`, `packages/api-client`, Hard Rule #3). _Джерело: прецедент `pushDailyCap` і `sergeantNudges`._
- **Міграція 168.** _Джерело: інженерне рішення головної сесії: останній файл у теці `167_orphan_tables_drop_phase2`, номер 169 зарезервований під іншу спеку._
- **Нові поля в `UserPreferencesSchema` - `.optional()` без `.default(...)`, на відміну від сусідів.** _Джерело: інженерне, з вимоги одного PR (нижче)._ `.default` заповнює відсутнє поле значенням, і клієнт тоді не відрізнить старий сервер від нового. Сервер нові поля віддає завжди; їх відсутність у відповіді читання і є ознакою старого сервера. Невідомі ключі старий клієнт мовчки відкидає (`z.object` без `.strict()`), тож новий сервер старим клієнтам не шкодить.

**Викочування: один PR**

- **Один PR, одна гілка.** _Джерело: інженерне рішення головної сесії._ Vercel викочує веб одразу після мержу, `deploy-api` чекає зеленого CI (~25 хв, `AGENTS.md` § Deployment), тож у цьому вікні новий веб говорить зі старим API.
- **Веб визначає можливість за відповіддю читання, без окремого прапорця.** `UserPreferencesPatchSchema` має `.strict()`, і старий сервер відповість `400` на патч із невідомим полем. Тому веб шле `timeZone`, межі, тумблер тихих годин і тумблер Monobank лише тоді, коли останній `GET /api/me/preferences` повернув це поле (для `timeZone` - ключ присутній, значення рядок або `null`).
- **Поки сервер старий, нові контроли не показуються.** Підгрупи «Тихі години» і «Операції Monobank» у `NotificationsSection` рендеряться лише після відповіді читання з відповідним полем; під час завантаження і при старому сервері їх немає. _Джерело: інженерне; обрано найменше - жодного нового тексту про «оновлюється», а неактивний контрол без пояснення був би тим самим мовчазним перемикачем, проти якого вже застерігає коментар у `NotificationsSection.tsx` («мовчазний перемикач, що нічого не робить, - гірший за чесний рядок»)._ Синхронізація поясу при старому сервері просто не шле нічого і повторює спробу на наступному старті чи `visibilitychange`.

## Поверхня змін

Owner-скіли за routing-таблицею `AGENTS.md`: **`sergeant-module-push`** (продуктовий контекст), **`sergeant-server-api`** і **`sergeant-data-and-migrations`** (сервер, міграція, контракт), **`sergeant-web-ui`** (налаштування, клієнтський таймер), **`sergeant-copy-and-tone`** (UA-тексти).

**Міграція `apps/server/src/migrations/168_notification_quiet_hours_and_time_zone.sql` + `168_notification_quiet_hours_and_time_zone.down.sql`.** Лише `ADD` з `DEFAULT` або nullable, двофазний DROP не потрібен.

```sql
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS time_zone TEXT,                                       -- NULL = невідомо, сервер читає як Europe/Kyiv
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled   BOOLEAN  NOT NULL DEFAULT TRUE,  -- Б-2 (А), дефолт = сьогоднішня поведінка
  ADD COLUMN IF NOT EXISTS quiet_hours_start_min SMALLINT NOT NULL DEFAULT 1320,  -- 22:00 = QUIET_HOURS_START_KYIV * 60
  ADD COLUMN IF NOT EXISTS quiet_hours_end_min   SMALLINT NOT NULL DEFAULT 480,   -- 08:00 = QUIET_HOURS_END_KYIV * 60
  ADD COLUMN IF NOT EXISTS push_mono_transactions BOOLEAN NOT NULL DEFAULT TRUE;  -- = поточна поведінка webhook.ts

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_time_zone_len
    CHECK (time_zone IS NULL OR char_length(time_zone) BETWEEN 1 AND 64),
  ADD CONSTRAINT user_preferences_quiet_hours_range
    CHECK (quiet_hours_start_min BETWEEN 0 AND 1439
       AND quiet_hours_end_min   BETWEEN 0 AND 1439),
  ADD CONSTRAINT user_preferences_quiet_hours_distinct
    CHECK (quiet_hours_start_min <> quiet_hours_end_min);
```

- `COMMENT ON COLUMN` на кожну колонку з джерелом рішення, як у `148_push_daily_cap.sql`.
- Валідність IANA-імені перевіряє сервер (`new Intl.DateTimeFormat("en", { timeZone })` без винятку), не CHECK: список поясів змінюється з версією ICU.
- Індексів не додаємо: і прохід, і вебхук читають `user_preferences` за первинним ключем `user_id`.
- Down: `DROP CONSTRAINT IF EXISTS` для трьох обмежень, потім `DROP COLUMN IF EXISTS` для пʼяти колонок, з шапкою «перед відкатом поверни код, що не читає ці колонки», як у `148_push_daily_cap.down.sql`.
- Відсутній рядок `user_preferences` (людина ніколи не зберігала налаштувань) і на проході, і у вебхуку означає дефолти колонок; дефолти в коді беруться зі спільних констант (нижче), а не дублюються літералами.

**Сервер**

- **`apps/server/src/lib/reminders/sweep.ts` не розширювати:** файл уже 810 рядків при `max-lines: 600` (Hard Rule #18). Уся нова логіка йде в новий модуль `apps/server/src/lib/reminders/userClock.ts` (завантаження поясу, тихих годин і стелі одним запитом за `user_id = ANY($1)` замість `loadCaps`; день, хвилина і `fromHm` на людину; групування людей за день-ключем, щоб запити відміток (`loadCompleted` / `loadSkipped` / `loadWeekCompletions` / `loadFizrukCandidates`) ішли один раз на різний день-ключ, а не на людину). У `sweep.ts` лише заміна викликів; підсумкова довжина файлу не більша за нинішні 810.
- `apps/server/src/lib/reminders/time.ts` - `dayKeyIn(at, tz)`, `hmIn(at, tz)`, `catchUpFromHmIn(now, last, tz)` поруч із київськими (київські лишаються для ретеншну); `resolveUserTimeZone(raw)` з фолбеком на `Europe/Kyiv`; `isInQuietWindow(minuteOfDay, { enabled, startMin, endMin })` для вікна через північ і без.
- `apps/server/src/lib/reminders/budget.ts` - `compromiseTime` / `planSends` приймають вікно параметром (або `null` при вимкнених тихих годинах) замість імпорту констант.
- `apps/server/src/lib/reminders/nudge.ts` - `QUIET_HOURS_*_KYIV` прибрати; слот нуджу 09:00 у поясі людини, зсув на кінець тихих годин.
- `apps/server/src/modules/mono/webhook.ts` - після `res.json`, перед `sendToUserQuietly`, одне читання `push_mono_transactions`, `quiet_hours_*`, `time_zone` людини; перевірки в порядку з § Рішення дизайну. Пропуск через тиху годину чи тумблер логувати одним `logger.info` без суми й опису операції (Hard Rule #21).
- `apps/server/src/modules/me/dataRights.ts` - SELECT / upsert / серіалізація `timeZone`, `quietHoursEnabled`, `quietHoursStartMin`, `quietHoursEndMin`, `pushMonoTransactions`; валідація IANA і «межі різні» після злиття патча з поточними значеннями.
- Тести поруч: `time.test.ts`, `budget.test.ts`, `sweep.test.ts`, `nudge.test.ts`, новий `userClock.test.ts`, тест вебхука Mono поруч із `webhook.ts`, `dataRights.test.ts`, `apps/server/src/__tests__/contracts/provider.test.ts`, новий тест міграції `apps/server/src/migrations/__tests__/168-notification-quiet-hours.test.ts`.

**Спільне і контракт**

- `packages/shared/src/schemas/api.ts` - константи `QUIET_HOURS_DEFAULT_START_MIN = 1320`, `QUIET_HOURS_DEFAULT_END_MIN = 480` поруч із `PUSH_DAILY_CAP_DEFAULT`; у `UserPreferencesSchema` нові поля `.optional()` (`timeZone: z.string().nullable().optional()`); у `UserPreferencesPatchSchema` ті самі поля `.optional()`, `timeZone` як `z.string().min(1).max(64)`, межі `z.number().int().min(0).max(1439)`.
- `packages/api-client` - `src/__tests__/contracts/me.contract.test.ts`, `src/endpoints/me.test.ts` (включно з відповіддю старого сервера без нових полів), pact `pacts/sergeant-api-client-sergeant-server.json`.
- `pnpm api:generate-openapi`, якщо форма відповіді змінилась.

**Веб**

- `apps/web/src/core/settings/useServerPreference.ts` - стан `supported` (`true`, коли відповідь читання містить ключ); `set` при `supported === false` не викликає мережу. Тип ключа розширити на поля з `undefined`.
- `apps/web/src/core/settings/NotificationsSection.tsx` - підгрупа «Тихі години» (тумблер і два `TimeField`) і підгрупа «Фінік» із тумблером «Операції Monobank», обидві лише при `supported`. Файл зараз 394 рядки: підгрупи винести в окремі компоненти поруч (`QuietHoursSettings.tsx`, `MonoPushSetting.tsx`), щоб секція не росла до ліміту 600.
- `apps/web/src/core/settings/PrivacySection.tsx` - власна копія циклу налаштувань (рядок з `pushDailyCap: PUSH_DAILY_CAP_DEFAULT`): нові поля в ній не з'являються і не шлються; перевірити, що тип збирається з `.optional()`.
- Новий хук `apps/web/src/core/settings/useDeviceTimeZoneSync.ts`, змонтований там, де відомо, що сесія автентифікована (`apps/web/src/core/app/RootLayout.tsx` або його провайдери): на старті і на `visibilitychange` читає налаштування, і якщо ключ `timeZone` присутній і відрізняється від поясу пристрою, патчить лише його.
- `apps/web/src/shared/hooks/useModuleReminder.ts` - `dayKey`/`hm` за годинником пристрою (`dateKeyFromDate` з `@sergeant/routine-domain` і локальні години/хвилини), з `eslint-disable sergeant-design/prefer-kyiv-time` і причиною (ADR-0078, ця спека); оновити JSDoc.
- `apps/web/src/modules/routine/hooks/useRoutineReminders.ts` - чистильник старих ключів за днем пристрою.
- `apps/web/src/modules/fizruk/hooks/useFizrukWorkoutReminder.ts`, `apps/web/src/modules/nutrition/hooks/useNutritionReminders.ts` - коментарі «Kyiv-local» виправити, логіка йде за хуком.
- Тексти через `sergeant-copy-and-tone` ([`style-guide.uk.md`](../../product/copy/style-guide.uk.md)).

**Доки в тому ж PR**

- `.agents/skills/sergeant-module-push/SKILL.md` - § Журнал рішень 2026-11-18: тихі години налаштовувані й вимикаються, у поясі пристрою, глушать Monobank без зведення; час нагадувань за пристроєм (через `sergeant-writing-skills`, потім `pnpm lint:skills && pnpm skills:lock`).
- `docs/engineering/architecture/domain-invariants.md` § Time and dates - нагадування рахуються в збереженому поясі пристрою (`user_preferences.time_zone`), Київ - фолбек.
- `docs/work/specs/reward-loop-and-reminders.md` § Стан виконання - рядок про тихі години 22:00-08:00 за Києвом доповнити вказівником на цю спеку.
- Розбір `2026-11-17-modules-teardown-vs-leaders.md` § 11.7 - стан О-2 (б).
- Ця спека: статус `Implemented` з доказом і § Стан виконання.

## Поза скоупом v1

- **Мобільний застосунок** (`apps/mobile`, `apps/mobile-shell`): контур на паузі, [ADR-0094](../../governance/adr/0094-mobile-web-first-freeze.md). Нові поля `.optional()`, тож його парсинг налаштувань не ламається; нативні таймери й екран налаштувань не змінюються. Повертатись після рішення власника про розморожування.
- **Push на 80 % і 100 % ліміту та напередодні платежу (Ф-4 (б)):** третя хвиля, «разом з О-2» за § 11.7, окрема спека після цієї.
- **Ранкове зведення нічних операцій Monobank і беззвучна доставка:** відхилено founder-ом (Б-1 (А)).
- **Прокидання `silent` у web push** (`apps/server/src/push/send.ts`): не потрібне за Б-1 (А).
- **Історія сповіщень** (§ 6 розбору, «Історії сповіщень немає»): не входить в О-2.
- **Перерахунок історичних день-ключів і рядків `push_reminder_log`:** ADR-0078 § 4 «Історія не переанкорюється».
- **Тихі години для тестового push (`modules/push/push.ts`) і для клієнтських таймерів відкритої вкладки:** перший запускає сама людина, другі шлють лише час, який людина поставила.
- **Включення push Monobank у стелю `push_daily_cap`.**
- **Пояс на кожен пристрій окремо:** один пояс на акаунт, останній записаний виграє.
- **Зведення двох копій циклу налаштувань** (`PrivacySection` і `useServerPreference`, коментар `ponytail` у хуку): окремий PR.

## Верифікація (обовʼязково)

### 1. Команди

```bash
pnpm lint:specs                                                       # exit 0
pnpm lint:migrations                                                  # exit 0, 168 іде за 167 без пропуску
pnpm --filter @sergeant/shared test
pnpm --filter @sergeant/server exec vitest run src/lib/reminders src/modules/mono src/modules/me src/migrations/__tests__/168-notification-quiet-hours.test.ts
pnpm --filter @sergeant/server test:integration                       # Testcontainers: міграція up/down, dataRights
pnpm --filter @sergeant/api-client test
pnpm api:check-openapi
pnpm --filter @sergeant/db-schema build && pnpm --filter @sergeant/web test
pnpm --filter @sergeant/server exec eslint src/lib/reminders/sweep.ts # без нових порушень max-lines
wc -l apps/server/src/lib/reminders/sweep.ts                          # ≤ 810
```

Очікувано: нуль падінь. Міграцію додатково прогнати по чистій базі всім ланцюжком і назад (урок 143 з `apps/server/AGENTS.md`):

```bash
cd apps/server/src/migrations
for f in $(ls *.sql | grep -v down | sort); do psql -v ON_ERROR_STOP=1 -f $f; done
psql -c '\d user_preferences'          # є time_zone, quiet_hours_enabled, quiet_hours_start_min, quiet_hours_end_min, push_mono_transactions
psql -c "UPDATE user_preferences SET quiet_hours_start_min = 480, quiet_hours_end_min = 480"  # на рядку: ERROR, user_preferences_quiet_hours_distinct
psql -v ON_ERROR_STOP=1 -f 168_notification_quiet_hours_and_time_zone.down.sql
psql -c '\d user_preferences'          # п'яти колонок і трьох обмежень немає; push_daily_cap на місці
```

### 2. Тести, що мають зʼявитись (і що ловлять)

| Тест                                                                                                             | Ловить                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `time.test.ts`: `dayKeyIn` / `hmIn` для `America/New_York` і `Asia/Tokyo`, зокрема в день переходу на літній час | день і хвилина в поясі людини, не фіксованим зсувом                                                     |
| `time.test.ts`: `isInQuietWindow` для 22:00-08:00, 13:00-15:00 і `enabled: false`                                | вікно через північ, без переходу, вимкнене                                                              |
| `sweep.test.ts`: людина `America/New_York`, звичка 07:00, `now = 2026-12-01T12:00Z`                              | відправка о 07:00 за Нью-Йорком; та сама людина з `time_zone = NULL` отримує її о `05:00Z` (07:00 Київ) |
| `sweep.test.ts`: відмітка звички з day-key пристрою, коли київська доба вже наступна                             | прохід не нагадує про звичку, уже відмічену за днем пристрою                                            |
| `sweep.test.ts`: тихі години 23:00-07:00, звичка о 06:30                                                         | людина отримує 06:30 (власний час не гейтиться)                                                         |
| `budget.test.ts`: вікно з параметра, 13:00-15:00, і `null`                                                       | компромісний час не падає у вікно людини; при `null` це чиста середина                                  |
| `nudge.test.ts`: тихі години до 10:00; тихі години вимкнені                                                      | нудж о 10:00 за поясом людини; при вимкнених о 09:00                                                    |
| тест вебхука Mono: `push_mono_transactions = false`                                                              | `sendToUserQuietly` не викликано, операція записана                                                     |
| тест вебхука Mono: операція о 23:30 за поясом людини при 22:00-08:00                                             | `sendToUserQuietly` не викликано; при `quiet_hours_enabled = false` викликано                           |
| `dataRights.test.ts` + `me.contract.test.ts` / pact                                                              | нові поля читаються, пишуться, мають дефолти; невалідний `timeZone` і однакові межі дають `400`         |
| `me.test.ts` (api-client): відповідь без нових полів                                                             | парсинг не падає, нові поля `undefined`                                                                 |
| `useServerPreference` тест: відповідь без поля                                                                   | `supported === false`, `set` не робить запиту                                                           |
| `NotificationsSection` тест: відповідь старого сервера                                                           | підгруп «Тихі години» і «Операції Monobank» немає в DOM; з новою відповіддю є                           |
| `useDeviceTimeZoneSync` тест: відповідь без `timeZone`; з `timeZone: null`; з тим самим поясом                   | без патча; патч з поясом пристрою; без патча                                                            |
| `useModuleReminder` тест із підміненим `TZ`                                                                      | `hm` за годинником пристрою                                                                             |

### 3. Новий фронт проти старого бекенду (вікно між Vercel і `deploy-api`)

1. На гілці: `pnpm --filter @sergeant/web build` (новий веб). Окремо `git worktree add ../sergeant-main origin/main`, там `pnpm install --frozen-lockfile && pnpm dev:db && pnpm dev:server` (старий API без міграції 168).
2. Новий веб проти старого API (`pnpm dev:web` на гілці, проксі на `:3000`), акаунт з push-підпискою. Очікувано: Налаштування → Сповіщення відкриваються без помилки; підгруп «Тихі години» і «Операції Monobank» немає; решта (стеля, Сержант, модулі) працює як раніше.
3. DevTools → Network, перезавантаження і перехід вкладкою туди-назад: жодного `PATCH /api/me/preferences` з `timeZone`; жодної відповіді `400` від `/api/me/preferences`.
4. Зупинити старий сервер, підняти сервер гілки (`pnpm dev:server` на гілці, міграція 168 накочується). Перезавантажити веб. Очікувано: підгрупи з'явились зі значеннями 22:00, 08:00, обидва тумблери увімкнені; у Network один `PATCH` з `timeZone`.

### 4. Click-through на новому бекенді

1. Chrome DevTools → Sensors → Location → Timezone override `America/New_York`, перезавантажити. Очікувано: один `PATCH /api/me/preferences` з `"timeZone":"America/New_York"`; повторне перезавантаження без зміни поясу патча не дає.
2. Межі 23:00-07:00, вимкнути «Операції Monobank», перезавантажити: значення на місці. Поставити однакові межі: збереження не відбувається, поле показує помилку, значення лишається попереднім.
3. `psql -c "SELECT time_zone, quiet_hours_enabled, quiet_hours_start_min, quiet_hours_end_min, push_mono_transactions FROM user_preferences WHERE user_id = '<id>'"` дає `America/New_York | t | 1380 | 420 | f`.
4. Вимкнути тумблер «Тихі години», перезавантажити: межі сховані або неактивні, у базі `quiet_hours_enabled = f`, межі збережені.
5. Звичка з нагадуванням на найближчу хвилину за годинником пристрою (Нью-Йорк). Очікувано: push у ту хвилину, а не на 7 годин пізніше.

### 5. Після мержу

Агент, що мерджив, проганяє `pnpm deploy:status`: бекенд на коміті мержу після зеленого CI; `/healthz` без `pending` міграцій (168 накотилась).

## Ризики та відкриті питання

Відкритих продуктових питань немає. Ризики:

- **Перший день для людей поза Україною.** Доба проходу для них зміщується з київської на власну, а ключі дедупу містять день: якщо київська і локальна доба різняться в момент перемикання, той самий привід може прийти двічі за один календарний вечір. Обсяг малий (людей поза Україною одиниці), приймаємо; захист, якщо дубль виявиться помітним, - у день перемикання перевіряти в `claim` ще й ключ за київським днем.
- **Похибка після перельоту** до першого відкриття застосунку: нагадування приходять за старим поясом. Свідома ціна з ADR-0078 § 4.
- **Два пристрої в різних поясах:** пояс перемикається за тим, хто відкрився останнім (§ Поза скоупом).
- **Нічна операція Monobank не дійде пушем зовсім,** зокрема шахрайське списання: прийнято founder-ом (Б-1 (А)). Людина бачить її у Фініку, а Monobank шле власне сповіщення незалежно від Sergeant.
- **Вимкнені тихі години відкривають ніч продуктовому часу** (нудж о 09:00 лишається, але компромісна середина групи може впасти на ніч): прийнято (Б-2 (А)).
- **Продуктивність проходу.** Групування за день-ключем додає запити відміток на кожен різний день-ключ хвилини (на практиці два-три). Коментарі `ponytail` у `sweep.ts` уже кажуть, коли кешувати план; ця спека їх не знімає.
- **Старі вкладки після деплою.** Веб із попереднім бандлом (сервіс-воркер без `skipWaiting`) нових полів не знає і не шле; серверні дефолти дають ту саму поведінку, що до спеки, доки вкладка не оновиться.

## Стан виконання

Виконано 2026-11-18 у гілці `claude/awesome-goodall-8s5uky` (PR не відкрито, не закомічено).

- Сервер. Уся нова логіка проходу в `userClock.ts` (пояс, тихі години й стеля одним запитом замість `loadCaps`, групування людей за день-ключем). Відступ від § Поверхня змін: `loadFizrukCandidates` розділено на `loadFizrukPlans` (один запит) і чистий `toFizrukCandidates(rows, dayKeyOf)`, бо пояс людей Фізрука потрібен до вибору «сьогодні», тож запит планів іде раз на прохід, а не на день-ключ. `loadWeekCompletions` бере день-ключ і рахує межі тижня сам. `nudgeReason` приймає `{ dayKey, quiet }` людини. `sweep.ts` лишився 810 рядків. `kyivCatchUpFromHm` і `QUIET_HOURS_*_KYIV` прибрано (споживачів не лишилось).
- Вебхук Monobank: читання налаштувань і вердикт у `monoPushGate.ts`; збій читання дає дефолти колонок (тумблер увімкнено, тихі години 22:00-08:00 за Києвом), як у людини без рядка. Пропуск логується `mono_push_skipped` з `reason` і `monoTxId`, без суми й опису.
- `/api/me/preferences`: серіалізація й валідація нових полів у `notificationPrefs.ts` (`dataRights.ts` біля межі `max-lines`); невалідний IANA-пояс і однакові межі після злиття дають `400` до запису.
- Веб. `useServerPreference` має `supported: boolean | null` (`null` до відповіді, щоб не заблокувати `set` наявних тумблерів до першого GET). Хуки нових полів живуть у `NotificationsSection` після двох наявних, підгрупи (`QuietHoursSettings`, `MonoPushSetting`) отримують їх пропсами. Тексти в `messages.sergeant` (`uk.sergeant.ts`). `useModuleReminder` бере день через `deviceDayKey` з `@sergeant/shared` (канон, якому делегує `dateKeyFromDate` з `@sergeant/routine-domain`), тож `shared/hooks` не тягне доменний пакет.
- Тести модулів із київськими фікстурами (`useRoutineReminders`, `useFizrukWorkoutReminder`, `useNutritionReminders`) пінять пояс пристрою `Europe/Kyiv`; чистильник ключів Рутини має окремий тест у `America/New_York`.
- RED→GREEN зафіксовано: `sweep.test.ts` (3 червоні до `userClock`), `webhook.test.ts` (3), `dataRights.test.ts` (6 на старому `dataRights.ts`), `useServerPreference.supported.test.ts` і `NotificationsSection.test.tsx` (10 на старих файлах), `useModuleReminder.test.ts` (2), `useRoutineReminders.test.ts` (1).
- § Верифікація п. 1: міграцію прогнано ланцюжком на локальному Postgres 16 без pgvector (усі файли, крім 11 залежних від `vector`, пройшли, 168 застосувалась), `\d user_preferences` показав пʼять колонок і три обмеження, `UPDATE ... = 480, 480` дав `user_preferences_quiet_hours_distinct`, down прибрав своє, `push_daily_cap` на місці, повторний up пройшов. Живі лейни `168-notification-quiet-hours.test.ts` і `test:integration` без Docker пропускаються.
- Лишається: `pnpm --filter @sergeant/server test:integration` у CI; пп. 3-4 (новий веб проти старого API, click-through у браузері з підміною поясу); п. 5 після мержу.
