# Аудит 2026-10-01 · Надійність, продуктивність, експлуатація

> **Status:** Active. 64 кластерів (91 знахідок) за першопричиною. Загальний план, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

Найгостріше місце теми — спільні точки відмови single-process бекенду. Одна отруєна звичка зупиняє серверні нагадування всім користувачам (high), а анонім чи будь-який зареєстрований клієнт може дешево зайняти event loop, пам'ять або диск: pre-auth gzip, ReDoS у PII-масці, SSE без стелі, sync_op_log без меж. Клієнтський синк працює, але марнотратно. Пуш на кожне натискання, перезаливка всієї історії Фізрука й O(n²) у коморі впираються в спільний бакет 60/хв, а один отруйний pulled-оп чи завислий push мовчки зупиняють синк пристрою. На краях бракує стійкості: не-401 помилка /me робить користувача гостем, вихід видаляє precache, а збій чанка чи оновлення SW лишає модуль або вкладку зламаними до ручного reload. Частина операційних гейтів лише створює видимість перевірки: down-drill нічого не порівнює, перевірка бекапу жодного разу не торкалася прод-даних, фонові полери після кожного деплою відкладаються. Більшість фіксів локальні (S), і лише retention та вотермарк синку, а також онлайн-міграції потребують зміни дизайну.

Кластер — це одна першопричина, яку закриває один фікс; усередині лежать знахідки, що її показали, з доказами. Виправив — зміни рядок «Стан» кластера на `виправлено в #<PR>` (або `не відтворюється на <коміт>`), ключ не чіпай.

| Серйозність | Кластерів |
| ----------- | --------- |
| critical    | 0         |
| high        | 1         |
| medium      | 23        |
| low         | 38        |
| info        | 2         |

## high

<a id="rel-01"></a>

### `rel-01` [high] Одна звичка з невалідним start_date зупиняє серверні push-нагадування всім користувачам

- **Стан:** частково виправлено в #1333 (змерджено 2026-10-03) (алерт на reminder_sweep_failed не додано: у репо немає метрики збою sweep, лише лог)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: reminders / sync routine
- **Де:** apps/server/src/modules/sync/routine/applySyncFullState.ts:108-111,140-142; apps/server/src/lib/reminders/sweep.ts:136-153,548-566; packages/routine-domain/src/schedule.ts:119-120; packages/routine-domain/src/dateKeys.ts:27-31; apps/server/src/lib/reminders/scheduler.ts:77-81
- **Першопричина:** applyRoutineHabits пише recurrence, start_date і end_date з sync-пушу як довільні рядки (колонка TEXT без CHECK). Щохвилинний sweep для monthly-звички викликає parseDateKey, а той кидає виняток. reasonsOfDay обходить усіх користувачів одним flatMap без per-user try/catch, тож падає весь прохід.
- **Вплив:** Будь-який зареєстрований користувач трьома легальними запитами вимикає серверні нагадування (звички, Фізрук, харчування, nudge) для всіх, поки існує отруєна звичка. Нагадування за пропущені хвилини втрачаються назавжди. У лозі лише warn reminder_sweep_failed без userId, алерту немає.
- **Що зробити:** Валідувати start_date/end_date (YYYY-MM-DD або null) і recurrence (enum) в applyRoutineHabits і відхиляти оп. У sweep ізолювати кожного користувача try/catch з логом userId, а предикати розкладу зробити безпечними (false замість throw). Додати алерт на reminder_sweep_failed.
- **Примітка:** Скептик незалежно відтворив сценарій між двома користувачами: нагадування жертви о T2 не надіслано, high підтверджено. Клієнтські таймери у відкритій вкладці ще працюють, тож падає лише серверний шлях, а при закритому застосунку іншого немає.
- **Повторна перевірка на свіжому `main`:** так, досі є, серйозність high. Проблема на HEAD cf057000 лишилась як була. `git diff c7c09607..HEAD` не зачіпає жодного з файлів кластера: apps/server/src/modules/sync/routine/, apps/server/src/lib/reminders/, packages/routine-domain/src/, packages/shared/src/schemas/api.ts. Ланцюжок: 1) Запис без перевірки. apps/server/src/modules/sync/routine/applySyncFullState.ts:108-110 (INSERT) і :140-142 (UPDATE) пишуть recurrence, start_date і end_date як будь-який рядок (`typeof === "string"`). Zod-схема оп-а (packages/shared/src/schemas/api.ts:1195-1219) поле row не валідує: там `z.record(z.string(), z.unknown())`. У БД колонки TEXT, `\d routine_habits` показує лише CHECK на weekly_target_history. Інших шляхів запису немає: grep INSERT/UPDATE routine_habits знаходить тільки цей файл і generic softDelete. 2) Падіння в предикаті розкладу. packages/routine-domain/src/schedule.ts:120: для recurrence=monthly виконується `parseDateKey(start)`, а він кидає виняток (dateKeys.ts:30). Перевірка меж у weeklyTarget.ts:91-103 порівнює рядки лексикографічно. Тому «zz» відсікається раніше і не падає, а «0», «2000», «2026», «1-0-0» (усе, що ≤ сьогоднішнього ключа) доходять до parseDateKey. 3) Немає ізоляції між користувачами. sweep.ts:548-566: reasonsOfDay через flatMap обходить усіх користувачів і викликає routineDueNow (due.ts:98-151) без try/catch. Вона викликається для кожного dayTime щохвилини, тож падіння не залежить від часу нагадування атакувальника. Виняток виходить із runReminderSweep ще до claim і send. Його ловить лише scheduler.ts:78-82 і пише warn reminder_sweep_failed без userId. Алерту на нього в ops/ і docs/operations немає. Перевірка на поточному коді: scratchpad/agents/recheck-rel-01/probe.mts через routineDueNow з рядками жертви B і отруєної monthly-звички A. Для startDate «0», «2000», «2026», «1-0-0» виклик кидає «parseDateKey: invalid date key», і нагадування B не формується. Для «zz» і «2026-13-45» все ок. У локальній БД лежать 4 вже soft-deleted отруєні рядки (monthly, start_date 2000 або 2026) з попереднього відтворення скептиком. Зараз у server.log 0 записів reminder_sweep_failed, тобто живий стан чистий, але дефект у коді на місці. Передумови для атаки тривіальні: routineRemindersEnabled=true у routine_prefs плюс будь-який push_subscriptions або push_devices (нативний токен непрозорий). Severity high правильна. Будь-який автентифікований користувач кількома легальними запитами вимикає для всіх серверні нагадування: звички, Фізрук, харчування, nudge. Пропущені хвилини втрачаються, моніторинг цього не бачить. До critical не дотягує: витоку даних немає, а клієнтські таймери у відкритій вкладці працюють далі. Уточнення до rootCause: падають лише значення, які лексикографічно ≤ сьогоднішнього dayKey і при цьому не парсяться. Довільний «сміттєвий» рядок не завжди спрацьовує, але тривіальні «0» чи «2000» спрацьовують гарантовано.
- **Мінімальний фікс:** Мінімум у трьох місцях: 1) apps/server/src/modules/sync/routine/applySyncFullState.ts. Перед INSERT і UPDATE (рядки 108-110, 140-142) додати валідацію і відхиляти оп: - recurrence ∈ {daily, weekdays, weekly, monthly, once, flexible} (тип Recurrence з packages/routine-domain/src/types.ts:9), інакше `{status:"rejected", reason:"invalid_recurrence"}`; - start_date і end_date: null або /^\d{4}-\d{2}-\d{2}$/ і реальна дата (як DAY_KEY_RE у sync/nutrition/applySyncGoals.ts:75), інакше "invalid_start_date" / "invalid_end_date". 2) apps/server/src/lib/reminders/sweep.ts:553-563. Виклик routineDueNow для кожного користувача обгорнути в try/catch: при помилці logger.warn({msg:"reminder_routine_user_failed", userId, err}) і повертати []. Одна звичка тоді не валить прохід. Як альтернатива: try/catch на кожну звичку в apps/server/src/lib/reminders/due.ts:107. 3) packages/routine-domain/src/schedule.ts:119-121. Гілка monthly має бути безпечною: якщо start не відповідає формату YYYY-MM-DD, повертати false замість виклику parseDateKey, що кидає. Окремо (не блокер): алерт на reminder_sweep_failed (scheduler.ts:80), регресійний тест у sweep або due.test.ts зі звичкою {recurrence:"monthly", startDate:"2000"} поруч зі звичкою іншого користувача, і разова чистка вже записаних невалідних рядків (UPDATE ... SET start_date=NULL WHERE start_date !~ '^\d{4}-\d{2}-\d{2}$' у новій міграції).

Знахідок у кластері: 1.

#### [high] Один користувач через sync-пуш routine_habits з невалідним start_date зупиняє push-нагадування ВСІМ користувачам щохвилини

- **ID:** `server-static/sync-contract#2` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/sync/routine/applySyncFullState.ts:108-111,140-142 (recurrence/start_date/end_date пишуться як довільні рядки); apps/server/src/lib/reminders/sweep.ts:136-153 (toHabit), 548-566 (reasonsOfDay: один flatMap по всіх юзерах без per-user try/catch); packages/routine-domain/src/schedule.ts:119-120 (parseDateKey(start) для monthly); packages/routine-domain/src/dateKeys.ts:27-31 (throw); apps/server/src/lib/reminders/scheduler.ts:77-81
- **Вплив:** Будь-який зареєстрований користувач кількома легальними запитами вимикає всі нагадування (звички, Фізрук, харчування, nudge) для всіх людей, поки існує отруєна звичка. Помилка лише логується як warn, тож тиша без алерту.
- **Рекомендація:** (1) У applyRoutineHabits валідувати start_date/end_date регуляркою YYYY-MM-DD (або null), recurrence і time_of_day по enum/формату, інакше reject. (2) У sweep ізолювати кожного юзера: try/catch навколо routineDueNow/fizrukDueNow/nutritionDueNow на рівні користувача з логом userId, щоб один зіпсований рядок не валив прохід. (3) parseDateKey у предикатах розкладу робити безпечним (повертати false замість throw).

**Докази:**

```text
Push: routine_prefs {data:{routineRemindersEnabled:true}} + routine_habits {recurrence:"monthly", start_date:"2000", reminder_times:["09:00"]} + POST /api/push/register {platform:"android", token:"x"} => обидва оп-и applied. Через хвилину в server.log:
{"level":"warn","time":"2026-10-01T23:03:02.016Z","msg":"reminder_sweep_failed","err":{"message":"parseDateKey: invalid date key \"2000\""}}
Юніт-перевірка (due-poison.mts): routineDueNow для жертви повертає 1 нагадування, а разом з рядком атакувальника весь виклик кидає `parseDateKey: invalid date key "2000"`. Після revert (soft-delete звички) sweep відновився: збій був один раз, о 23:03.
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/server-static-sync-contract/due-poison.mts (чиста функція); e2e на власному юзері: node <scratch>/agents/server-static-sync-contract/reminder-poison-e2e.mjs (сам відкочує зміни).
```

**Верифікатор:**

```text
I checked the whole chain in code. applySyncFullState writes recurrence and start_date as any string (the column is TEXT, migration 050). loadRoutineCandidates picks up every user who has routineRemindersEnabled=true and any push device. dateKeyWithinHabitBounds compares strings: '2026-10-02' < '2000' is false, so the check passes. habitScheduledOnDate then runs the 'monthly' branch and calls parseDateKey('2000'), which throws. reasonsOfDay in sweep.ts runs one flatMap over all users with no per-user try/catch, before any send. scheduler.ts only logs warn reminder_sweep_failed. REMINDER_SWEEP_ENABLED defaults to true. Nothing neutralizes this, and any user can sign up and send these requests.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-reminder.mjs (own user vssc2, reverted afterwards):
push register 200 {"ok":true,"platform":"android"}
sync push 200 [applied, applied]
server.log: {"level":"warn","time":"2026-10-02T01:57:02.016Z",..."msg":"reminder_sweep_failed","err":{..."message":"parseDateKey: invalid date key \"2000\""}}
{"level":"warn","time":"2026-10-02T01:58:02.005Z",...same...}
revert habit 200 applied; push unregister 200.
The sweep failed on two minutes in a row, so it stays broken while the habit exists.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this finding. I traced the code end to end and also ran an independent cross-user reproduction.

**Static chain (HEAD c7c09607)**
- **Unvalidated input.** The `row` field of `SyncV2OpSchema` is `z.record(z.string(), z.unknown())` with only a size refine (packages/shared/src/schemas/api.ts:1195-1220). `applyRoutineHabits` writes `recurrence`, `start_date` and `end_date` as any string (apps/server/src/modules/sync/routine/applySyncFullState.ts:108-110 and 140-142).
- **No database guard.** `routine_habits.start_date` is TEXT with no CHECK constraint. I confirmed this with psql `\d routine_habits`.
- **No email verification needed.** `/api/push/register` needs only `requireSession()`. The native token is any string of 1-4096 characters (`PushRegisterSchema`, api.ts:1284-1294). A real web-push subscription from a browser would also meet the "has a device" condition. Neither sync push nor push register uses `requireVerifiedEmail`; its only user is mono-webhook.
- **Poisoned row is loaded.** `loadRoutineCandidates` (sweep.ts) picks up the row when `routineRemindersEnabled='true'` and the user has any device.
- **Bounds check passes.** `dateKeyWithinHabitBounds` compares strings: `'2026-10-02' < '2000'` is false, so `habitScheduledOnDate` continues (packages/routine-domain/src/schedule.ts:97).
- **The throw.** The monthly branch calls `parseDateKey(start)` (schedule.ts:120), which throws at dateKeys.ts:30. `routineDueNow` calls `habitScheduledOnDate` before it che …[обрізано]
```

## medium

<a id="rel-02"></a>

### `rel-02` [medium] Будь-яка не-401 помилка /api/v1/me на холодному старті перемикає застосунок у гостьовий режим із «порожніми» даними

- **Стан:** виправлено в #1334 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: auth (AuthContext)
- **Та сама першопричина, що й** [`logic-01`](./domain-logic.md#logic-01): Спільний корінь в AuthContext: будь-яка помилка /api/me (403 account_pending_deletion, 5xx, 429, мережа) трактується як «не автентифікований». Явні стани pending_deletion і unavailable закривають обидва.
- **Де:** apps/web/src/core/auth/AuthContext.tsx:318-360,382-401; apps/web/src/shared/lib/api/queryClient.ts:77-97; apps/web/src/shared/lib/api/queryClientPersister.ts:232; apps/server/src/http/requireSession.ts:104-106
- **Першопричина:** useUser викликається з retry:false повз authAwareRetry, а status виводиться як «user є, отже authenticated, інакше unauthenticated» без перевірки коду помилки. 5xx, 429, мережева помилка чи битий JSON трактуються як вихід з акаунта. Після цього reconcile-ефект запускає identity-wipe: queryClient.clear, очищення persisted-кешу і reload.
- **Вплив:** Хто відкриває PWA під час збою бекенду чи БД, бачить гостьовий стан без своїх фінансів, звичок і замірів і банер «Увійти». При стабільній мережі цей стан тримається до ручного reload чи перезапуску. Дані не губляться, але записи, зроблені в цей час, ідуть в анонімну партицію, а повторне введення «втраченого» дає дублікати.
- **Що зробити:** Вважати виходом лише 401/403. На інші помилки лишати status loading або offline з банером «Сервер недоступний», перезапитувати /me з backoff (authAwareRetry, refetchInterval, поки є помилка) і не запускати identity-wipe.
- **Примітка:** Фіндер і верифікатор ставили high, скептик medium. Аргументи скептика: стан самовідновлюється на реальному переході offline→online (refetchOnReconnect) і після перезапуску, даних не губить, а GET /api/me не має власного rate-limit, тож 429 у проді малоймовірний. Прийнято medium, перша серед medium.

Знахідок у кластері: 1.

#### [high] Будь-яка не-401 помилка GET /api/v1/me на холодному старті (5xx, 429, мережа, битий JSON) перемикає застосунок в анонімний режим: дані користувача зникають, а після відновлення API нічого не повертається саме

- **ID:** `browser-crosscut/resilience-offline-perf#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Де:** apps/web/src/core/auth/AuthContext.tsx:318-360 (useUser retry:false; `user = meQuery.data?.user ?? null`; status = user ? authenticated : unauthenticated), :382-401 (identity-wipe: queryClient.clear + clearPersistedQueryCache + location.reload). Перевірено на http://127.0.0.1:4173/routine/habits, /finyk/transactions, /?tab=profile
- **Вплив:** Кожен користувач, який відкриває чи перезавантажує PWA під час деплою, збою бекенду, 429 або в captive-портал, бачить, що всі його фінанси, звички й заміри зникли, і застосунок вважає його гостем. Стан лишається таким і після відновлення API, аж до ручного reload, а в standalone-PWA кнопки reload немає. Записи, зроблені в цей час, ідуть в анонімну партицію, тож користувач, який вводить «втрачене» наново, отримує дублікати. Identity-wipe при цьому стирає persisted RQ-кеш і локальне дзеркало HubChat.
- **Рекомендація:** Вважати вийшовшим лише 401 (і 403). На 5xx, 429, мережеву помилку чи помилку парсингу лишати останню відому identity (persisted snapshot `me` з ключем user id) і показувати банер «Сервер недоступний». /me перезапитувати з backoff і refetchOnReconnect/refetchInterval, поки запит у помилці. Не запускати identity-wipe (reconcileChatOwnerOnAuthChange -&gt; reload) на не-401 помилках.

**Докази:**

```text
run-mecold-503.log: '14.2 503 GET /api/v1/me' -> '14.8 NAV /routine/habits' (примусовий reload від identity-wipe) -> 'during 503: LS {"owner":"__anon__"}'; '25.7 --- API recovered (no reload, no focus)' -> '75s after recovery (no reload): LS {"owner":"__anon__"}'. Повторюється для 429 (run-mecold-429.log) і для connectionrefused (run-mecold-refused.log). Скріни: shots/browser-crosscut-resilience-offline-perf/mecold-503-2-after75s.png (звички: 'Поки порожньо' через 75 с після відновлення API), me-outage-503-1-during.png ('Операцій ще немає'), apifail-badjson-all-_finyk.png (відповідь 200 '{"ok":tru' показує банер 'Дані лише на цьому пристрої… Увійти'). /?tab=profile відкидає на '/'. Витрата OUTAGE-TX, додана в цьому стані, лягла в анонімну партицію і перенеслась після reload ('Дані перенесено й безпечно збережено у профілі', me-outage-503-4-recovered.png); на сервері ops 6384/6403/8408.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-resilience-offline-perf/20-me-cold.mjs 503|429|refused. Сценарій: залогінений користувач на /routine/habits; ctx.route на /api/v1/me віддає 503; page.reload(); дивимось на стан; unroute; чекаємо 75 с без reload.
```

**Верифікатор:**

```text
I checked the code. AuthContext.tsx:318-345 calls useUser({retry:false}) and sets user = meQuery.data?.user ?? null. Any settled error with no data therefore gives status 'unauthenticated'. There is no isError or status-code branch. `me` is never restored from disk: isSensitiveQueryKey excludes it from the IDB persister (queryClientPersister.ts). On a cold start a 5xx, 429 or parse error on /me looks the same as being logged out. The reconcile effect (:382-401) then sees owner user -> __anon__ with prevOwnerWasUser=true and runs the identity wipe: queryClient.clear, clearPersistedQueryCache, location.reload. Nothing re-fetches /me afterwards. Only AuthContext observes the query, the global refetchOnWindowFocus is false (queryClient.ts:97), retry is false, and refresh() is called only from VerifyEmailPage and ProfilePage. The app stays anonymous until a manual reload. No ADR or code comment says this is intended; the retry:false comment only covers 401. The SW NetworkFirst cache of GET /api/v1/me (sw/cache.ts, 200-only, 30 min) can hide pure network errors, but not 5xx or 429 responses or a schema-parse failure. That case matters because AGENTS.md says the front end deploys up to ~2 …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Independent repro with <scratch>/agents/verify-browser-crosscut-resilience-offline-perf/v1-mecold.mjs 503 (user rop-main, /finyk/transactions). Warm state showed 'Сьогодні · 10 −419,00 ₴'. During the 503: '14.5 503 GET /api/v1/me' -> '14.7 NAV /finyk/transactions' (forced identity-wipe reload) -> owner '__anon__', text 'Операцій ще немає Додай першу операцію вручну…'. 40 s after recovery the state was the same and an SPA pushState to /routine still showed 'Звичок на сьогодні ще немає'. /me was not re-requested until a manual reload, after which owner returned to the user id and habits OFF2-36948 / RACE2-B-63193 were back. Screenshot: v1-503-during.png.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the mechanism. It is real and I reproduced it independently with a new variant, 502 "Bad Gateway". The finding still overstates the severity and one key claim, so I am lowering it from high to medium.

**Code path (confirmed)**
- apps/web/src/core/auth/AuthContext.tsx:322 sets `useUser({ retry:false })`. That overrides the global default retry at apps/web/src/shared/lib/api/queryClient.ts:91-95, which would retry 5xx, 429, network and parse errors twice. `authAwareRetry` exists in the same file (:77) but /me does not use it.
- :338 sets `user = data?.user ?? null`. :356 then gives status `unauthenticated` for any settled error, with no check on the status code.
- :382-401 is the identity wipe. With owner user -> `__anon__` it runs `queryClient.clear` (:390), purges the persisted snapshot and calls `location.reload` (:399).
- `me` is excluded from the persister (queryClientPersister.ts:232). `refetchOnWindowFocus` is false (queryClient.ts:97). `refresh()` is only called from VerifyEmailPage and ProfilePage.
- On the server, a failed session lookup goes to `next(err)` and returns 500 (apps/server/src/http/requireSession.ts:104-106), so a DB hiccup on cold start produces this state.
- The service worker serves NetworkFirst with a 200-only cache (sw/cache.ts:158-162). It passes 5xx through and only masks pure network errors.
- No ADR or code comment says this is intended: the comments at :318-321 and :353 assume only 401.

**My reproduction**
Scripts are in <sc …[обрізано]
```

<a id="rel-03"></a>

### `rel-03` [medium] Per-IP ліміти за Vercel-проксі злипаються в адреси egress-вузлів: одна людина блокує вхід іншим

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: edge middleware + server: rate limit
- **Де:** apps/web/middleware.ts:23,61-81; apps/server/src/config.ts:46-49; apps/server/src/http/rateLimit.ts:277-281,716; apps/server/src/modules/chat/aiQuota.ts:282
- **Першопричина:** apps/web/middleware.ts проксіює /api на бекенд, копіює заголовки й виставляє лише x-forwarded-host/proto. Express з trust proxy=1 бере req.ip від Traefik, тобто адресу egress Vercel. Усі per-IP бакети ключуються за цією спільною адресою: auth 5/60 с fail-closed, анонімна AI-квота, анонімні ліміти.
- **Вплив:** П'ять спроб входу чи скидання пароля за хвилину через app.sergeant.com.ua блокують sign-in для всіх веб-користувачів, яких обслуговує той самий egress-вузол. Анонімні квоти теж спільні, і зловживання не вдається прив'язати до конкретного клієнта.
- **Що зробити:** У middleware передавати IP клієнта окремим заголовком (з x-forwarded-for, який перезаписує сам Vercel) разом зі спільним секретом. Сервер довіряє цьому заголовку лише за збігу секрету. Auth-ліміти додатково ключувати за email. Перед цим заміряти фактичний ланцюг Vercel→Traefik→Express і закрити TBD щодо TRUST_PROXY в ADR-0074.
- **Примітка:** Уже є в реєстрі як SECURITY-20260804-1-1 (docs/work/specs/audits/verification/findings.json, status open). Верифікатор заміряв лічильник бакета на живому проді: прямий api.sergeant.com.ua проти проксі app.sergeant.com.ua. Обхід через підроблений X-Forwarded-For з rel-35 у проді не працює, це артефакт локального середовища.

Знахідок у кластері: 1.

#### [medium] Per-IP ліміти всього веб-трафіку злипаються в IP egress-вузлів Vercel (edge-проксі не передає довірений IP клієнта)

- **ID:** `client-static/infra-headers-ci-deps#1` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/verification/findings.json
- **Де:** apps/web/middleware.ts:23,61,80-81; apps/server/src/config.ts:46-49 (trustProxy fallback 1); apps/server/src/http/rateLimit.ts:281,716; apps/server/src/modules/chat/aiQuota.ts:282; apps/server/src/env/env.ts:507 (AUTH_RATE_LIMIT_MAX=5)
- **Вплив:** Ліміт входу/скидання пароля (5 за 60 с на IP, fail-closed) фактично спільний для всіх веб-користувачів, яких обслуговує той самий egress-вузол Vercel. Одна людина, що надсилає 5 запитів sign-in на хвилину через app.sergeant.com.ua/api/auth/*, блокує вхід усім. Анонімні AI-квоти теж спільні, а зловживання не прив'язати до конкретного клієнта.
- **Рекомендація:** У middleware виставляти окремий заголовок з IP клієнта (напр. `x-sergeant-client-ip` з `request.headers.get('x-forwarded-for')`, який перезаписує сам Vercel) разом зі спільним секретом (`x-sergeant-proxy-secret`). На сервері довіряти цьому IP лише за збігу секрету, в інших випадках брати req.ip. Альтернатива: ключувати auth-ліміти за email/сесією, а IP-бакет зробити значно ширшим. Спершу заміряти фактичний ланцюг проксі на проді.

**Докази:**

```text
middleware.ts: `matcher: "/api/:path*"`; копіює `new Headers(request.headers)` і виставляє лише `x-forwarded-host`/`x-forwarded-proto` (рядки 80-81), жодного підписаного client-IP. Прод-бандл app.sergeant.com.ua (env-обʼєкт, вичитаний з /assets/*.js 2026-10-01) НЕ містить VITE_API_BASE_URL, тобто весь браузерний API-трафік іде відносним /api через цей проксі. Ланцюг Vercel edge -> Coolify Traefik -> Express з `trust proxy = 1` дає `req.ip` = адреса, з якої Traefik отримав запит, тобто egress Vercel. Ключі лімітерів: `ip:${getIp(req)}` (rateLimit.ts:281,716), анонімна AI-квота `ip:${getIp(req)}` (aiQuota.ts:282). Це знахідка SECURITY-20260804-1-1 з реєстру docs/work/specs/audits/verification/findings.json (status: open); код з того часу не змінено, у ADR-0074 калібрування TRUST_PROXY досі «TBD».
```

**Відтворення:**

```text
1) Прочитати apps/web/middleware.ts:61-81. 2) NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/env.mjs: env-обʼєкт прод-бандла без VITE_API_BASE_URL. 3) config.ts:46-49: fallback trustProxy=1.
```

**Верифікатор:**

```text
Код: apps/web/middleware.ts:61-81 копіює заголовки запиту й виставляє лише x-forwarded-host/proto. config.ts:46-49 бере fallback trustProxy=1. rateLimit.ts:277-281 і 716 та aiQuota.ts:282 ключують за `ip:${getIp(req)}`, де getIp = req.ip. AUTH_SENSITIVE_RATE_LIMIT (config/rateLimit.ts) = 5/60с на IP, fail-closed. Живий прод: https://app.sergeant.com.ua/api/v1/me віддає 401 від Express з `server: Vercel`, тобто /api справді проксіюється через edge-middleware. Головне, я заміряв лічильник бакета. Невалідний штрихкод (`/api/barcode?barcode=N` дає 400 до будь-якого upstream, але вже після limiter-а) по черзі напряму і через проксі дає RateLimit-Remaining 299/298/297 окремо для кожного шляху. Якби проксі передавав реальний IP клієнта і сервер його брав, обидва шляхи ділили б один бакет. Отже за проксі req.ip не є IP клієнта. Будь-яка конфігурація Traefik (зрізає недовірений XFF або дописує свій hop) з trust proxy=1 дає req.ip = IP egress-вузла Vercel. Що кілька різних користувачів ділять той самий egress-IP, напряму з одного клієнта не доведено. Але три запити через проксі потрапили в один і той самий стабільний бакет, тож medium виправданий.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-infra-headers-ci-deps/ipbucket.mjs (2026-10-02): direct 400 remaining=299, proxy 400 remaining=299, direct 298, proxy 298, direct 297, proxy 297 (limit=300, ключ api:barcode:daily): два незалежні лічильники для одного клієнта. live1.mjs: app.sergeant.com.ua/api/v1/me віддає 401 JSON бекенду з server=Vercel і x-vercel-id=iad1::...
```

<a id="rel-04"></a>

### `rel-04` [medium] Тіла запитів розпаковуються й парсяться до автентифікації: анонімна ампліфікація через gzip до 10 МБ

- **Стан:** частково виправлено в #1347 (змерджено 2026-10-03) (inflate:false на default і всіх правилах понад 128 КБ; парсинг до requireSession лишається — довгострокове перенесення парсерів у роутери)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: http body parsing
- **Де:** apps/server/src/app.ts:147-169; apps/server/src/http/bodySizePolicy.ts:92-258
- **Першопричина:** applyBodySizePolicy монтується в app.ts раніше за CORS, CSRF, rate-limit і requireSession. Фікс B28 вимкнув inflate лише на AI-правилах. Правила sync v1/v2 (6 МБ), statement/preview (10 МБ), import/commit (2 МБ), backup-upload (4 МБ) і default досі розпаковують gzip, хоча клієнти тіла не стискають.
- **Вплив:** Анонім надсилає ~10 КБ і змушує сервер розпакувати та синхронно розпарсити ~10 МБ JSON ще до 401/403. Під невеликим burst /livez стрибав з 2-7 мс до 128-1111 мс, а 20 паралельних 10-МБ тіл додали +280 МБ RSS. На single-process CX23 це дешевий шлях деградувати API для всіх.
- **Що зробити:** Поставити inflate:false на всі правила понад 128 КБ і на default, як уже зроблено для AI-роутів. Довгостроково монтувати великі парсери в роутерах після pre-auth IP-лімітера і requireSession або відхиляти анонімні запити за Content-Length до читання тіла.
- **Примітка:** Це залишок B28 з docs/work/specs/audits/ai-pipeline-2026-08-05.md: пункт закрито частково, лише для AI-правил. Чотири незалежні лейни відтворили анонімно.

Знахідок у кластері: 4.

#### [medium] Pre-auth gzip-інфляція тіл (sync push / statement preview / import commit / nutrition backup) блокує event-loop — анонімний DoS з ~340× амплітудою

- **ID:** `server-static/gap-blocked-input-route-findings#3` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md (B28: позначено 'виправлено частково' лише для AI-правил; ці не-AI правила досі з inflate)
- **Де:** apps/server/src/http/bodySizePolicy.ts:92-258 (правила з inflate за замовчуванням true для /api/v2/sync, /api/sync, /api/finyk/import/statement/preview 10mb, /api/finyk/import/commit 2mb, /api/nutrition/backup-upload 4mb); парсер монтується у app.ts:148 ПЕРЕД requireSession
- **Вплив:** Неавтентифікований клієнт дешевим трафіком (десятки KB) змушує сервер інфлювати/парсити мегабайти на кожен запит ще до auth, займаючи event-loop; кілька паралельних потоків деградують латентність усіх запитів (прод має один процес). Класичний pre-auth amplification DoS.
- **Рекомендація:** Вимкнути inflate (як для AI-роутів) на всіх pre-auth-парсерах, де стиснення тіла клієнтами не використовується (sync push/pull, statement preview, import commit, nutrition backup), АБО переставити парсери після requireSession, щоб ліміт/інфляція рахувались лише для залогінених. Якщо стиснення потрібне — рахувати ліміт по стиснутому байтовому потоку, а не по розпакованому.

**Докази:**

```text
Body-парсери стоять до будь-якої автентифікації (app.ts applyBodySizePolicy → потім роутери з requireSession). Для AI-vision-роутів inflate:false, але для sync/statement-preview/commit/backup — inflate увімкнено. Жива перевірка (burst.mjs): один анонімний сплеск із 4 паралельних POST (2× /api/finyk/import/statement/preview gzip 27.7KB→~9.5MB, 2× /api/v2/sync/push gzip 17.2KB→~5.9MB) усі повернули 401 (відсіклись на сесії ПІСЛЯ інфляції), а /livez під час сплеску стрибнув з базових 2-7мс до 228/179/128/141мс. 28KB запиту на дроті = ~9.5MB роботи інфляції+парсингу до перевірки сесії.
```

**Відтворення:**

```text
node <scratch>/.../burst.mjs — друкує baseline livez ~2-7мс і livez під час сплеску з піками 128-228мс; усі важкі запити 401 (інфляція сталася до auth).
```

**Верифікатор:**

```text
Відтворено. applyBodySizePolicy (app.ts:147) монтується раніше за CORS, CSRF, rate-limit і requireSession. У bodySizePolicy.ts правила /api/finyk/import/statement/preview (10mb), /api/finyk/import/commit (2mb), /api/sync (6mb), /api/v2/sync (6mb) і /api/nutrition/backup-upload (4mb) не задають inflate, тобто лишається дефолтне true. Контроль: /api/chat з inflate:false на gzip-тіло віддає 415 за 9 мс. Анонімні gzip-тіла розпаковуються й парсяться повністю і тільки потім отримують 401. JSON.parse 9.5MB у цьому середовищі займає ~634 мс синхронного CPU, а запит на дроті важить 27.7KB, тобто амплітуда ~340×. Уточнення: розпарсити 10MB без стиснення до автентифікації можна й так (прийнятий залишок B28), стиснення лише знижує вартість атаки за трафіком. Тому medium, не вище. Відкрите питання, яке варто зафіксувати: у B28 написано «Закрито 2026-09-29 у частині стиснення», а ці 4-5 не-AI правил досі розпаковують.
```

**Додаткові докази верифікатора:**

```text
verify-.../burst.mjs: розміри raw/gz 9 499 994/27 718 та 5 899 989/17 239. Baseline livez 3-10 мс. Чотири паралельні анонімні gzip-POST: statement/preview 401@1329ms і 401@1686ms, v2/sync/push 401@696ms і 401@1045ms. livez під час сплеску: 6,49,8,34,8,18,9,22,3,4,6,143 мс. /api/chat (inflate:false) → 415 за 9 мс, livez стабільні 2-7 мс. findings.json AIP-20260805-B28 має status: open.
```

#### [medium] Тіло запиту парситься/буферизується до автентифікації: анонім тримає 10 МБ на запит, а gzip-тіло 10 КБ розпаковується до 10 МБ (не-AI роути)

- **ID:** `api-live/ai-billing-integrations-live#3` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md (B28, закрито частково: лише AI-правила; парсинг до auth визнано залишком)
- **Де:** apps/server/src/app.ts:147 (applyBodySizePolicy до registerRoutes на :169); apps/server/src/http/bodySizePolicy.ts (правила /api/finyk/import/statement/preview 10mb, /api/sync і /api/v2/sync 6mb, /api/nutrition/backup-upload 4mb, /api/finyk/import/commit 2mb — без `inflate:false`; /api/transcribe 10mb raw)
- **Вплив:** Неавтентифікований DoS з підсиленням на сервері з малими ресурсами (Hetzner CX23): кілька сотень паралельних анонімних запитів займають гігабайти RAM і CPU на JSON.parse ще до requireSession і лімітерів (лімітери теж стоять після парсерів). Аудит B28 (ai-pipeline-2026-08-05.md:343) закрив лише стиснення на AI-правилах, а sync/import/backup досі розпаковують gzip до 6–10 МБ.
- **Рекомендація:** Поставити `inflate:false` на всі правила з лімітом &gt;128kb (sync v1/v2, statement/preview, backup-upload, import/commit), якщо клієнти не стискають тіла. Довгостроково монтувати великі парсери на рівні роутера ПІСЛЯ requireSession і pre-auth IP-лімітера, або відхиляти анонімні запити за Content-Length до читання тіла.

**Докази:**

```text
1) 20 паралельних анонімних POST /api/transcribe по 10 МБ (Content-Type audio/webm) -> усі 401, але RSS процесу API зріс з 328 916 КБ до 609 024 КБ (+280 МБ), час 1852 мс (p20_anonupload.mjs). Порожній анонімний запит -> 401 за 113 мс, 10 МБ -> 401 за 304 мс.
2) Gzip-бомба: JSON 10 485 575 байт стискається до 10 239 байт. Анонімний POST /api/finyk/import/statement/preview з Content-Encoding: gzip -> 401 за 171 мс (проти 68 мс для `{}`); 10 паралельних -> 401×10 за 1036 мс, тобто ~100 КБ трафіку змусили сервер розпакувати й розпарсити ~100 МБ. Для AI-роутів gzip уже вимкнено: /api/nutrition/analyze-photo -> 415 за 10 мс.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p20_anonupload.mjs і p11_bomb.mjs (без сесії)
```

**Верифікатор:**

```text
applyBodySizePolicy (app.ts:147) монтується до registerRoutes (:169). Правила /api/finyk/import/statement/preview (10mb), /api/sync і /api/v2/sync (6mb), /api/nutrition/backup-upload (4mb) і /api/finyk/import/commit (2mb) не мають inflate:false. Виправлення B28 закрило стиснення лише на AI-правилах. Клієнти тіла запитів не стискають: grep Content-Encoding/CompressionStream в apps/web, api-client і mobile нічого не знаходить, тож розпаковувати немає потреби. Відтворено анонімно. Gzip-тіло 9 284 байти, що розпаковується до 9,5 МБ, на statement/preview дає 401 за 130 мс (порожнє {} — за 11 мс). Десять паралельних таких запитів: RSS процесу API зріс з 295 316 до 547 596 КБ (+250 МБ) за 789 мс. Sync, backup-upload і import/commit розпаковують до свого ліміту (6/4/2 МБ) і лише тоді віддають 413, тобто підсилення теж ~200–650:1. Сам факт парсингу до auth уже зафіксований як відомий залишок B28, а gzip на не-AI правилах — нова частина.
```

**Додаткові докази верифікатора:**

```text
x3_gzip.mjs: raw 9500015 / gz 9284; statement/preview gzip -> 401 130ms; /api/v2/sync/push, /api/sync/push, backup-upload, import/commit gzip -> 413 (після inflate); analyze-photo gzip -> 415 за 1ms (inflate:false працює); 10 parallel -> rss 295316kB -> 547596kB.
```

#### [medium] Pre-auth gzip-інфляція тіла (залишок B28): ~10KB -&gt; 10MB парситься до requireSession/CSRF на statement/preview, sync і default-роуті

- **ID:** `api-live/input-fuzz#5` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md
- **Де:** apps/server/src/http/bodySizePolicy.ts (правила /api/finyk/import/statement/preview 10mb, /api/sync 6mb, /api/v2/sync 6mb, default '/' 128kb — БЕЗ inflate:false; applyBodySizePolicy монтується в app.ts до роутерів)
- **Вплив:** Неавтентифіковане ~1000:1 підсилення памʼяті/CPU: сервер буферизує й синхронно парсить до 10MB (statement/preview) / 6MB (sync) на анонімний запит ще до requireSession і CSRF. Під конкурентним burst event-loop стопориться (виміряно +1.1с на /livez). Downstream ipRL не рятує — інфляція вже сталась. Документовано як частково закритий B28 (лише AI-роути отримали inflate:false), але не-AI 10mb/6mb/default-правила досі inflate ON. Ризик деградації/outage у проді.
- **Рекомендація:** Виставити inflate:false (або набагато менший ліміт по стисненому тілу) для statement/preview, /api/sync, /api/v2/sync і default-правила — симетрично AI-роутам; або перенести body-парсери після requireSession. Повернутись до відкритого пункту B28 у ai-pipeline-2026-08-05.md.

**Докази:**

```text
Анонімно, Content-Encoding: gzip, ~10KB тіло що інфлейтиться у ~10MB JSON. POST /api/finyk/import/statement/preview (gzip 10229B) -> 403 CSRF_HEADER_REQUIRED, але аж через 1714ms. POST /api/v2/sync/push (gzip 6151B) -> 403 через 2314ms. Контроль: /api/chat (inflate:false) -> 415 за 90ms; default -> 413 за 64ms. Burst 4 анонімних gzip-тіл (origin evil.example): /livez-латенсі стрибнула з 5ms до 1111ms під burst.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_gzip.mjs і r1_gzip2.mjs.
```

**Верифікатор:**

```text
У коді: у BODY_SIZE_POLICY (apps/server/src/http/bodySizePolicy.ts) немає inflate:false для /api/finyk/import/statement/preview (10mb), /api/sync і /api/v2/sync (6mb), /api/nutrition/backup-upload (4mb) і /api/finyk/import/commit (2mb). applyBodySizePolicy монтується в app.ts:147, тобто ДО CORS (:151), CSRF (:167) і роутерів, тож парсинг відбувається до requireSession. Живцем, анонімно, з Origin evil.example і без XRW: gzip 10239 B, що інфлейтиться в ~10MB на statement/preview, дає 403 CSRF через 156 ms. 11MB-варіант дає 413 через 339 ms. Gzip 6158 B на /api/v2/sync/push і на /api/sync/push дає 403. Контроль: /api/chat (inflate:false) дає 415 за 8 ms. Burst із 12 анонімних запитів по ~10KB (сумарно ~123KB трафіку) сервер обробляв 1.7-3.9 s кожен, а /livez під burst стрибав до 1139 ms (у простої ~2-50 ms). Підсилення ~1000:1 до автентифікації підтверджено, стопори event loop теж. Частину заголовка про default-роут фіндер перебільшив: cap 128kb рахується по розпакованому потоку, тож запит отримує 413 за ~26 ms. Medium лишаю: це неавтентифікований DoS-важіль у проді. Проблема вже відстежується як B28, частково закритий лише для AI-роутів.
```

**Додаткові докази верифікатора:**

```text
r2/v5_gzip.mjs і r2/v5b_burst.mjs: 'burst 12 x 10239B gz -> 403/1683 … 403/3938'; 'livez during … max 1139'. backup-upload з gzip 10MB дає 413 за 111 ms, тобто інфляція йде до межі 4mb.
```

#### [medium] Тіло запиту розбирається (з gzip-inflate до 10 МБ) до будь-якого rate-limit чи сесії: анонімна CPU-ампліфікація

- **ID:** `server-static-redo/route-authz#3` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · повтор route-authz · **Категорія:** `perf`
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md
- **Де:** apps/server/src/app.ts:147 (applyBodySizePolicy до registerRoutes:169); apps/server/src/http/bodySizePolicy.ts:107-112 (backup-upload 4mb), 130-135 (finyk/import/statement/preview 10mb, inflate увімкнено), 136-142 (import/commit 2mb), 148-169 (/api/sync, /api/v2/sync 6mb); pre-auth ipRL у routes/finyk.ts:93, sync.ts:51-81, nutrition.ts:56 спрацьовує вже ПІСЛЯ парсингу
- **Вплив:** Без акаунта, кілобайтами трафіку можна тримати event loop бекенда (Hetzner CX23, 2 vCPU) зайнятим JSON-парсингом мегабайтів. Десяток таких запитів за секунду деградує API для всіх користувачів.
- **Рекомендація:** Вимкнути inflate для великих маршрутів (як уже зроблено для vision) або перенести великі body-parser-и всередину роутерів після preAuthIp-лімітера і requireSession. Глобальний дефолт залишити 128kb. Додати дешевий per-IP лімітер на рівні app до парсингу тіла.

**Докази:**

```text
Один анонімний запит (probe8.out): 9 191 байт gzip → 9 400 015 байт JSON → 401 через 230 мс (базовий крихітний запит 14 мс). /api/v2/sync/push 5.9 МБ inflate → 67 мс до 401. JSON.parse синхронний і блокує event loop. Перед парсингом лімітера немає.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe8.mjs (один запит на маршрут).
```

**Верифікатор:**

```text
app.ts:147 applyBodySizePolicy стоїть до registerRoutes (169), тож парсинг тіла відбувається до будь-якого requireSession і rate-limit. Фікс B28 вимкнув inflate лише на AI-правилах (bodySizePolicy.ts: analyze-photo, refine-photo, receipts/analyze, screenshot/analyze, coach/memory, chat, transcribe). /api/finyk/import/statement/preview (10mb), /api/sync і /api/v2/sync (6mb), backup-upload (4mb) та import/commit (2mb) досі розпаковують gzip для анонімів. Відтворено: битий gzip-JSON без сесії дає 400 (помилка JSON.parse), а не 401, на statement/preview, v2/sync/push, sync/push, backup-upload, import/commit і навіть на дефолтному /api/me/preferences. /api/chat дає 415. Твердження знахідки «JSON.parse блокує event loop» для payload-рядка лише частково точне: 20 паралельних бомб-рядків затримали /livez максимум до 34 мс. Але з payload-масивом ({"x":[0,0,…]}, 9.5 КБ gzip → 9.8 МБ) один запит блокує цикл на 280-350 мс, а п'ять паралельних затримали /livez до 433 мс. Тобто кілька запитів на секунду по ~10 КБ від анонімного клієнта насичують event loop. Medium лишаю.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-server-static-redo-route-authz/v3.mjs, v3b.mjs, v3c.mjs. v3: 9191 B gzip → 9 400 015 B, анонімні 401 через 46-129 мс (крихітний запит 6 мс). v3c: array-bomb 401 за 350/280 мс; 5 паралельних 653-1231 мс; /livez під час: 9,4,11,…,172,350,332,314,…,433,413,400 мс. B28 у docs/work/specs/audits/ai-pipeline-2026-08-05.md:341-353 позначено «виправлено (частково)», і там прямо сказано, що парсинг до requireSession лишається. У реєстрі docs/work/specs/audits/verification/findings.json AIP-20260805-B28 має status open. Ця знахідка — незакрита частина B28: inflate на не-AI маршрутах до 10 МБ.
```

<a id="rel-05"></a>

### `rel-05` [medium] GET /api/v2/sync/stream не має стелі одночасних з'єднань і backpressure

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: sync SSE
- **Та сама першопричина, що й** [`sec-09`](./security.md#sec-09): Обидва дефекти в /api/v2/sync/stream, у якого немає споживача: немає повторної перевірки сесії, TTL і стелі з'єднань. Найдешевший спільний фікс — закрити маршрут прапорцем до Phase 3.
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:90-97,214-412,341,355; apps/server/src/routes/sync.ts:90-98; apps/server/src/http/timeout.ts:53-63
- **Першопричина:** syncV2Stream не рахує відкриті стріми ні на користувача, ні глобально. Rate-limit обмежує лише темп handshake (30/хв), SSE звільнено від request timeout, TTL стріму немає, а setMaxListeners(1000) лише глушить попередження. onOps пише кожен оп у кожен стрім і не перевіряє res.write() чи writableLength.
- **Вплив:** Один автентифікований акаунт накопичує десятки чи сотні відкритих сокетів (40 від одного користувача відтворено). Кожен тримає listener, таймер і буфери. Великий push множиться на кількість стрімів у CPU серіалізації та пам'яті. Споживача в клієнті ендпоінт при цьому не має.
- **Що зробити:** Обмежити стріми на користувача (наприклад 5) і глобально з відмовою 429/503, додати максимальний TTL стріму, закривати стрім при backpressure і серіалізувати оп один раз для всіх стрімів. Споживача немає, тож найдешевше до Phase 3 закрити маршрут прапорцем.
- **Примітка:** Фіндер ставив high, скептик знизив до medium. Вичерпання fd у проді нереалістичне: стеля 20000 є лише локально, а накопичення займе ~11 год. OOM не продемонстровано. Член #3 — довідковий замір: 30-40 простих стрімів не сповільнюють інші запити, ризик у накопиченні та fan-out великих пушів.

Знахідок у кластері: 2.

#### [high] Відсутній per-user/глобальний ліміт одночасних SSE-зʼєднань на GET /api/v2/sync/stream — ризик вичерпання ресурсів у single-process бекенді

- **ID:** `api-live/gap-sse-concurrent-connection-exhaustion#1` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:214-412 (handler), :90-97 (SyncOpLogEmitter.setMaxListeners(1000)); apps/server/src/routes/sync.ts:90-98 (mount — лише handshake rate-limit); apps/server/src/http/timeout.ts:53-63 (SSE звільнено від request timeout)
- **Вплив:** Connection-holding ендпоінт у ЄДИНОМУ Node-процесі (прод — single-instance Hetzner CX23) не має стелі одночасних зʼєднань. Per-minute rate-limit обмежує лише ТЕМП нових handshake-ів, а не накопичену кількість: стріми не закриваються сервером (SSE поза request-timeout), тож через хвилинні межі один юзер (або кілька паралельних сесій/пристроїв) накопичує сотні-тисячі відкритих сокетів. При наближенні до стелі fd (тут 20000) процес перестає приймати будь-які нові зʼєднання — вхідні HTTP і конекти до Postgres — тобто повний outage бекенду. Кожен стрім також тримає listener + heartbeat-таймер + буфери (зростання памʼяті).
- **Рекомендація:** Додати per-user (і глобальний) ліміт одночасно відкритих стрімів: лічильник активних зʼєднань на userId, і при перевищенні (напр. 5-10 на юзера) відхиляти новий handshake 429/503, а не покладатись на rate-limit темпу. Розглянути server.maxConnections / загальну стелю активних SSE і максимальний TTL стріму (форс-реконект), щоб обмежити накопичення. Існуючий gauge syncStreamConnectionsActive можна переробити з суто-метрики на підставу для відмови.

**Докази:**

```text
syncV2Stream() на кожен конект чіпляє opLogEmitter.on(`user:<id>`, onOps) + setInterval heartbeat + тримає сокет; лічильника одночасних конектів НЕМАЄ, а setMaxListeners(1000) лише глушить warning (на канал/юзера), конект не відхиляє. Єдині гейти — RATE handshake-ів: api:v2:sync:stream 30/хв, api:v2:sync 60/хв, api:v2:sync:ip 300/хв (sync.ts). Жоден не обмежує КІЛЬКІСТЬ одночасно відкритих.
LIVE як один pool-юзер: probe.mjs → 30 одночасних стрімів, усі status=200 + event:caught_up, rejected429=0, усі живі весь hold (ramp-report.json: liveNow=30, closedSinceOpen=0). accumulate.mjs відкрив 22, зачекав 62с (скид бакета), відкрив ще 18 → concurrentLive=40 як ОДИН юзер при бюджеті лише 30 handshake/хв (accumulate.json). fd сервера (/proc/690/fd): baseline 54 → 96 при 40 стрімах → 53 після close (1 сокет на стрім, звільняється лише коли клієнт закриє). SSE звільнено від REQUEST_TIMEOUT_MS (timeout.ts перевіряє content-type text/event-stream і return), тож сервер сам стрім не рубає. Ліміт процесу: /proc/690/limits Max open files=20000, single shared process.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-gap-sse-concurrent-connection-exhaustion/probe.mjs sse-exhaust-1 30 (30 одночасних, 0 відмов) та accumulate.mjs sse-exhaust-3 (22 + пауза 62с + 18 = 40 одночасних як один юзер). Звіряти /proc/690/fd до/під час/після.
```

**Верифікатор:**

```text
Code check: syncV2Stream() (apps/server/src/modules/sync/syncV2Stream.ts:214-412) has no per-user or global count of open connections. setMaxListeners(1000) only silences the warning for each event name. The route (routes/sync.ts:90-98) is gated only by rate buckets on new handshakes: api:v2:sync:stream 30/min, api:v2:sync 60/min, and the :ip bucket. requestTimeout skips text/event-stream (http/timeout.ts:53-63). index.ts sets only keepAliveTimeout/headersTimeout, with no maxConnections and no stream TTL. The 25s heartbeat keeps proxy idle timeouts from closing the stream. No ADR or comment says unbounded streams are intended. ADR-0065 covers only cross-instance fan-out. There is no alert on the sync_stream_connections_active gauge, and metrics.md lists it as undocumented.

Reproduced live on a throwaway user (sse-exhaust-3). 30 handshakes returned 200 and the 31st returned 429. After the bucket reset, 8 more returned 200, so 38 streams were live at once for one user. Server fds went 87 under load and 51 after the client closed, about one fd per stream, released only when the client disconnects.

Why the severity holds: the endpoint has no legitimate client consumer (sync-client-wi …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Scripts and outputs are in <scratch>/agents/verify-api-live-gap-sse-concurrent-connection-exhaustion/.

concurrency.json: phase 1 had handshakes 1-30 at 200 and the 31st at 429; phase 2, after 63s, had 8 at 200; live=38; fds 87, then 51 after close.

Amplification test, same throwaway user:
- amplify-n20.json: 20 streams that read the hello frame and then pause, followed by 2 pushes of 10 × 200 KB rows (3.9 MB pushed). Server RSS 378264 → 483512 kB (+102.8 MB, about 26×). Push latency 653 and 495 ms.
- amplify-control-n0.json: the same pushes with 0 streams. RSS +8.1 MB, push latency 215 and 359 ms.

So every open, non-reading stream buffers a full copy of each push in the server, and the synchronous fan-out adds event-loop time to the push request.

The server was restarted by the orchest …[обрізано]
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the core defect, but "high" overstates it. I rate it medium.

I traced the path statically and did not run new load tests against the shared server. I stopped live testing once a safety classifier interrupted my run, and I did not want to degrade a server other agents are using.

What holds (confirmed in code):
- Mount order (apps/server/src/routes/sync.ts): pre-auth IP limiter `api:v2:sync:ip` 300/min, then `requireSession()`, then per-user `api:v2:sync` 60/min. That last bucket is shared with push and pull. Then `api:v2:sync:stream` 30/min on the route. These limits cap only the RATE of handshakes, never how many streams are open at once.
- syncV2Stream (syncV2Stream.ts:214) keeps no per-user or global counter. `setMaxListeners(1000)` (:93) only silences a warning.
- The heartbeat `setInterval` (:355) keeps proxies from idling the stream out. Cleanup runs only on client close (:409).
- requestTimeout skips `text/event-stream` (http/timeout.ts:54).
- index.ts sets only keepAliveTimeout and headersTimeout. There is no maxConnections and no stream TTL.
- No ADR accepts unbounded streams. ADR-0065 covers only cross-instance fan-out. The 2026-08-05 orphaned-code audit kept the route on purpose but never looked at resource limits.
- The real root cause is backpressure. `onOps` (:341) calls `res.write()` for every op on every open stream of the user. It ignores the return value and never checks `writableLength`. `notifySyncV2OpsApplied` runs synchronously inside …[обрізано]
```

#### [info] Утримання 30-40 одночасних SSE-стрімів НЕ деградує latency інших запитів (GET /api/status) — ризик саме у fd/памʼяті, не у starvation

- **ID:** `api-live/gap-sse-concurrent-connection-exhaustion#3` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `perf`
- **Де:** apps/server/src/http/status.ts:216-243, apps/server/src/modules/sync/syncV2Stream.ts:262-294 (replay-SELECT звільняє зʼєднання пулу одразу)
- **Вплив:** Чесний негативний результат для питання про starvation: на десятках зʼєднань інші запити не сповільнюються. Отже загроза від знахідок вище — це вичерпання file descriptors/памʼяті single-process і накопичення, а НЕ конкуренція за CPU/пул БД доти, доки fd не наблизяться до стелі (20000), після чого деградація стає раптовою й повною.
- **Рекомендація:** Моніторити кількість активних SSE (syncStreamConnectionsActive) і fd процесу з алертом задовго до стелі; не покладатись на latency-метрики як ранній сигнал — вони лишаються плоскими майже до самого вичерпання fd.

**Докази:**

```text
GET /api/status median latency: baseline 4.7ms (ramp-report.json baseline.status.median) → при 30 утримуваних стрімах 4.4ms (underLoad.status.median) → при 40 стрімах 4.8ms (accumulate.json statusUnderLoad.median). Поодинокі max 20-21ms — холодний перший семпл, не під навантаженням. Idle SSE-зʼєднання не тримають конект пулу Postgres (replay робить один SELECT і звільняє) і не блокують event loop, тож latency інших запитів не страждає на цих масштабах.
```

**Відтворення:**

```text
У probe.mjs/accumulate.mjs поля baseline.status vs underLoad.status / statusUnderLoad — порівняння медіани /api/status без і з 30-40 утримуваними стрімами.
```

**Верифікатор:**

```text
The measured observation reproduces: idle SSE streams do not slow other requests. The replay SELECT releases its pool client right away, and an idle stream costs only a socket plus a 25s timer. Reporter data: /api/status median 4.7 ms at baseline, 4.4 ms with 30 streams, 4.8 ms with 40. In my run, /api/status took 8 ms right after pushes with 20 paused streams.

The broader conclusion is not accurate: 'the risk is only fd/memory, not starvation' and 'latency stays flat until fd exhaustion'. notifySyncV2OpsApplied() runs synchronously in the push request and does JSON.stringify plus res.write for every op on every open stream of the user, so fan-out cost scales with streams × ops × row size. I measured push latency of 495-653 ms with 20 streams versus 215-359 ms with none, for the same 2 MB pushes. Memory, via unbounded write buffers, also degrades long before the fd ceiling. As an info observation about idle streams it holds; its recommendation to alert on stream count and fds is fine. The 'flat until fd ceiling' claim should be dropped.
```

**Додаткові докази верифікатора:**

```text
amplify-n20.json (statusMs=8, push ms 653/495) vs amplify-control-n0.json (push ms 215/359), in <scratch>/agents/verify-api-live-gap-sse-concurrent-connection-exhaustion/.
```

<a id="rel-06"></a>

### `rel-06` [medium] Журнал синку росте без меж: rejected-оп зберігаються з повним row, retention і байтової межі pull немає

- **Стан:** частково виправлено в [#1400](https://github.com/SkOrDs-02/sergeant/pull/1400) (змерджено 2026-10-08) (не писати row для rejected — виправлено раніше в 3836a8dd6; text bound для routine_entries у цій гілці: id понад 200 символів дає rejected/text_too_long, name обрізається до 200 (не reject: це копія назви звички, а термінальний reject губив би відмітку); лишилось: байтовий бюджет сторінки pull з next_cursor, квота обсягу, retention sync_op_log — рішення власника, ADR-0065)
- **Перевірка:** підтверджено · **Зусилля:** L · **Область:** server: sync v2
- **Де:** apps/server/src/modules/sync/syncV2.ts:443-462,653-711; packages/shared/src/schemas/api.ts:1164-1169; apps/server/src/http/bodySizePolicy.ts:155-168; apps/server/src/modules/sync/routine/applySync.ts
- **Першопричина:** syncV2 пише в sync_op_log кожен оп з повним row до 256 КБ, зокрема rejected з table_not_allowed і довільною назвою таблиці. Журнал ніхто не чистить: ADR-0065 досі Proposed. Pull обмежений лише кількістю рядків (до 500), тож одна сторінка сягає ~128 МБ і кілька разів матеріалізується в пам'яті. routine_entries.name і id не мають text bound.
- **Вплив:** Один акаунт може дописувати в Postgres ~360 МБ/хв нестисливих даних, які нікому не потрібні, і сплесками пам'яті на pull покласти single-instance API. Власник роздутого акаунта отримує сторінку pull, яку мобільний браузер не перетравить.
- **Що зробити:** Не зберігати row для rejected-опів, лише ключ, статус і причину. Ввести байтовий бюджет сторінки pull з next_cursor, добову квоту обсягу на користувача і text bound для routine_entries. Реалізувати retention sync_op_log і sync_audit_log за ADR-0065.
- **Примітка:** Перший крок (не писати row для rejected) — S і закриває найдешевший вектор роздування. Retention чекає на рішення за ADR-0065.

Знахідок у кластері: 2.

#### [medium] Pull обмежений лише кількістю рядків (500×256 КБ ≈ 128 МБ на відповідь), а оп-лог не має ні retention, ні квоти: DoS пам'яті та диска

- **ID:** `server-static/sync-contract#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `perf`
- **Де:** packages/shared/src/schemas/api.ts:1164-1169 (256 КБ на row, pull до 500), apps/server/src/modules/sync/syncV2.ts:653-711 (усі рядки в пам'ять, плюс JSON.stringify для метрики, плюс res.json), 444-462 (навіть rejected оп-и з table_not_allowed зберігаються з повним row), apps/server/src/http/bodySizePolicy.ts:164-166 (6 МБ на push); sync_op_log не чистить жоден код (ADR-0065 лише Proposed); веб-клієнт pull-ить з limit=500 (apps/web/src/core/syncEngine/singleton.ts:268)
- **Вплив:** Один або кілька акаунтів можуть роздути БД і сплесками пам'яті на pull покласти single-instance API, тобто outage для всіх. Сам власник такого акаунта отримує сторінку pull, яку мобільний браузер не перетравить, і sync застрягає.
- **Рекомендація:** Ввести байтовий бюджет сторінки pull (зупинятися, коли сумарний row &gt; N МБ, і віддавати next_cursor), зменшити ліміт рядка для blob-таблиць, не зберігати row для rejected оп-ів (або обрізати), додати retention/архів sync_op_log (ADR-0065) і квоту на обсяг на користувача.

**Докази:**

```text
pull-size.mjs (власний юзер): 3 пуші по 23 оп-и finyk_budgets із data_json≈250 КБ (body 5 755 897 B кожен, усі accepted). Потім GET /api/v2/sync/pull?limit=500 => `pull 200 ops 69 response bytes 17269003 ms 758`. 500 таких рядків дадуть ~125 МБ в одній відповіді; на сервері це кілька копій (jsonb parse, decrypt-map, JSON.stringify для bytes-метрики, res.json). Ліміт 60 запитів на хвилину на юзера дає до ~360 МБ на хвилину приросту бази з одного акаунта, включно з rejected-рядками з довільним table.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/pull-size.mjs
```

**Верифікатор:**

```text
I checked the code. Pull is limited only by row count (LIMIT up to 500, and the web client always asks for 500), not by bytes. Each row can be up to 256 KB (SYNC_V2_MAX_ROW_BYTES), with a 6 MB push body. Pull loads every row into memory, decrypts and maps it, does JSON.stringify per row for the bytes metric, then calls res.json. The sync_op_log INSERT stores the full row for every status, including rejected/table_not_allowed with any table name. Nothing deletes from sync_op_log. One correction: ADR-0065 is Accepted, not Proposed, and it deliberately defers retention (also noted in _runner-report.md:85). That covers only the retention part. The missing per-page byte budget, storing rejected rows and the per-user quota are not tracked anywhere. To avoid bloating the shared DB I did not build a full 128 MB page. Response size grows linearly with row size.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-size.mjs (user vssc2):
push unknown table 200 [rejected table_not_allowed ×4]
stored rows: 4|983276 (≈983 KB of rejected rows stored with their full contents)
push budgets 200 [applied ×4]
pull 200 bytes 984332 ms 130 ops 4 (≈246 KB per op, no byte cap; 500 such rows ≈ 123 MB in one response)
```

#### [medium] Відхилені оп-и зберігаються з повним row (до 256 KB) без retention: ~6 MB на запит, 60 запитів/хв на юзера

- **ID:** `api-live/sync-live#6` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/sync/syncV2.ts:443-460 (INSERT у sync_op_log для КОЖНОГО опа, зокрема rejected table_not_allowed/clock_skew/validation); apps/server/src/http/bodySizePolicy.ts:155-168 (6mb); routes/sync.ts (60/хв на юзера, 300/хв на IP); ADR-0065 (retention не реалізовано); routine/applySync.ts (routine_entries.name і id без text bound)
- **Вплив:** Будь-який зареєстрований акаунт може записувати в Postgres до ~360 MB/хв нестисливих даних (з одного IP ~1.8 GB/хв кількома акаунтами), а журнал ніколи не чиститься. Це пряма загроза диску CX23 VPS, бекапам і швидкості pull. Корисне навантаження відхилених оп-ів не потрібне нікому: pull їх не віддає.
- **Рекомендація:** Для rejected-оп-ів не зберігати row (або зберігати обрізаний/хеш), лишаючи ключ, статус і причину для ідемпотентності. Ввести сумарний бюджет байтів на юзера за добу і retention для sync_op_log/sync_audit_log (ADR-0065). Додати text bound для routine_entries.name/id, як в інших таблицях.

**Докази:**

```text
POST /api/v2/sync/push 23 ops {table:"junk_table", row:{blob: 250 KB random}} → 200 {"accepted":0,… "rejected:table_not_allowed":23} за 670 мс
Після 48 таких оп-ів (2 запити): SELECT … FROM sync_op_log WHERE user_id=<me> → rejected | table_not_allowed | 255 | 11 MB; pg_total_relation_size('sync_op_log') = 12 MB
201 ops → 400; 25×250KB (~6.25MB) → 200; 26×250KB → 413.
routine_entries: name 200 000 символів → applied; id 100 000 символів → applied (інші таблиці відхиляють text_too_long).
Кожен pull теж пише рядок у sync_audit_log (67 рядків v2_pull/ok у synclive3 за тест).
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t02_size.mjs і t16_misc.mjs; розмір: psql -c "SELECT status,reject_reason,count(*),pg_size_pretty(sum(pg_column_size(row))::bigint) FROM sync_op_log WHERE user_id='ltCIBVFG3duQniFhOTdQOIA0VVL32zkK' GROUP BY 1,2"
```

**Верифікатор:**

```text
Підтверджено в коді й вживу. syncV2.ts:443-460 пише в sync_op_log КОЖЕН оп, зокрема rejected table_not_allowed, з повним row. 2 оп-и по 250 KB у неіснуючу таблицю повернули table_not_allowed за 102 мс, але в журналі лежить 2 рядки на 487 kB. Ліміти такі: тіло 6 MB (bodySizePolicy.ts:165), до 200 оп-ів по 256 KB (shared api.ts), 60 запитів/хв на юзера. Виходить ~360 MB/хв на один акаунт. routine_entries.name 200 000 символів теж проходить як applied, бо в routine/applySync.ts немає text bound. Відсутність серверного retention свідома (ADR-0065, backend.md:725), але через це записане назавжди лишається на диску. Окремо ніде не трекаються ні вектор переповнення диска, ні зберігання payload-ів відхилених оп-ів, які для ідемпотентності не потрібні (вистачає key/status/reason). Medium лишаю. Будь-який зареєстрований акаунт за ~2 години може заповнити диск одного VPS (CX23), а це ризик відмови в обслуговуванні для всіх. Масовий тест навмисно не проганяв, щоб не засмічувати спільну БД.
```

**Додаткові докази верифікатора:**

```text
w6_size.mjs: 'push 2x250KB junk: 200 ["rejected:table_not_allowed","rejected:table_not_allowed"] 102ms'; 'rejected | table_not_allowed | 2 | 487 kB'; 'routine_entries name 200k: ["applied"] len in DB: 200000'.
```

<a id="rel-07"></a>

### `rel-07` [medium] PII-маскування в чаті має квадратичний email-регекс: один /api/chat блокує event loop на ~9 с

- **Стан:** виправлено в #1348 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI chat (pii-mask)
- **Де:** apps/server/src/lib/pii-mask.ts:14-37; apps/server/src/lib/llmRedaction.ts:118-137; apps/server/src/modules/chat/chat.ts:515-518,650,748; apps/server/src/lib/llm/provider.ts:825-829
- **Першопричина:** Email-патерн у pii-mask.ts на довгих рядках із дефісів і крапок дає поліноміальний backtracking. maskUserText проганяє всі повідомлення (до 50 по 8000 символів), maskMachineText — context до 40000 символів. Обидва працюють синхронно в main thread, до виклику LLM і до обліку квоти.
- **Вплив:** Залогінений користувач у межах Free-квоти одним запитом займає event loop на ~9 с (на реальних функціях виміряно 7,4 с і 1,8 с) і деградує всіх. Серія запитів у межах ліміту 60/хв — стійкий DoS single-process бекенду.
- **Що зробити:** Переписати email-регекс у лінійну форму: обмежити довжину локальної частини, прибрати суміжні квантифікатори. Обмежити довжину одного прогону маски і додати ReDoS-мікробенч у тести pii-mask.
- **Примітка:** Наскрізно через /api/chat локально не прогнано: без LLM-ключа requireChatUpstreamKey відсікає запит раніше. У проді ключ є, тож шлях досяжний.

Знахідок у кластері: 1.

#### [medium] Чат-маскування PII (maskUserText/maskMachineText) дає катастрофічну поліноміальну затримку на зловмисному вводі — один /api/chat блокує event-loop на ~9 с

- **ID:** `server-static/gap-blocked-input-route-findings#4` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Де:** apps/server/src/lib/pii-mask.ts:14-37 (регекси email/card), apps/server/src/lib/llmRedaction.ts:118-137 (maskUserText/maskMachineText); виклики modules/chat/chat.ts:517,650,748 та lib/llm/provider.ts:825-829
- **Вплив:** Залогінений користувач (навіть у межах Free-квоти) одним запитом займає event-loop на ~9 с, деградуючи всіх; серія запитів у межах 60/хв — стійкий DoS. Квота тут не рятує, бо блокування відбувається до обліку вартості туру.
- **Рекомендація:** Переписати PII-регекси у лінійну форму (прибрати вкладені квантифікатори `+`/`[...]+` поряд, прив'язати до меж слів жорсткіше) або обмежити довжину одного прогону маски; виконувати маскування порціями/у worker; знизити max для messages×content або context у ChatRequestSchema; додати ReDoS-мікробенч-гейт на ці патерни.

**Докази:**

```text
Пряме вимірювання реальних функцій (mask.mts, tsx): maskUserText на 50 повідомленнях по 8000 символів `a-` (межа ChatMessage.content 8000, messages ≤50) = 7431 мс синхронного CPU; maskMachineText на context у 40000 символів (межа ChatRequest.context) = 1819 мс; benign 50×8000 = 4 мс. Email-регекс /[a-z0-9._%+-]+@[a-z0-9.]+\.[a-z]{2,}/gi та card/phone на довгих рядках дефісів/крапок ростуть квадратично (redos/redos2 мікробенчі це підтвердили: 16000 симв. → 240мс на один рядок). /api/chat: S→RL(60/хв + sustained 20/5хв)→requireChatUpstreamKey→requireAiQuota; квота Free = 20/тиждень, але rate-limit пускає 60/хв.
```

**Відтворення:**

```text
node --import tsx mask.mts: друкує 'maskUserText 50 x 8000 adversarial: 7431 ms; maskMachineText context 40000: 1819 ms; benign 50 x 8000: 4 ms'. У проді один POST /api/chat з 50 повідомленнями-дефісами + context на дефісах = ~9 с синхронного блокування перед викликом LLM.
```

**Верифікатор:**

```text
Відтворено на рівні функцій. Шлях виклику перевірено в коді. Квадратичну поведінку дає email-регекс у pii-mask.ts:16, решта патернів на тому самому вводі відпрацьовує за 0 мс. chat.ts:515-518 маскує ВСІ messages, до 50 штук по 8000 символів без обрізання. chat.ts:748 маскує augmentedContext (до 40000) на першому турі. Усе це синхронно в main thread до виклику LLM, тіло (~440KB) вміщається в ліміт 1mb. Наскрізний прогін /api/chat локально неможливий: немає ключа LLM, і requireChatUpstreamKey повертає 503 ще до handler. Дві тези знахідки виправляю. Rate-limit не «60/хв»: це 60 токенів при cost 10, тобто 6 запитів/хв burst плюс sustained 20 за 5 хв. requireAiQuota списує квоту ДО handler, тож Free-акаунт обмежений 20 запитами на тиждень. Квота таки стримує Free, а Pro і кілька Free-акаунтів не стримує. Один запит займає ~5-9 с event-loop єдиного процесу. Для автентифікованого DoS це medium.
```

**Додаткові докази верифікатора:**

```text
verify-.../mask.mts (node --import tsx): одне повідомлення 8000 'a-' = 72 мс; 50×8000 = 3459 мс; context 40000 = 1879 мс; окремо email-регекс = 81 мс на 8000 символів, IBAN/card/phone/taxid = 0 мс; 'a.'×4000 = 80 мс; 'a'×8000 = 0 мс. ChatRequestSchema (packages/shared/src/schemas/api.ts:537-541): context max 40_000, messages max 50, ChatMessage.content max 8000. routes/chat.ts:61-72 показує rateLimit cost 10 / limit 60 / sustained 20 per 5 хв, далі requireAiQuota. У аудитах ReDoS у pii-mask не знайдено.
```

<a id="rel-08"></a>

### `rel-08` [medium] Клієнт синку пушить на кожну зміну без коалесингу, push і pull ділять бакет 60/хв, а 429 палить спроби

- **Стан:** частково виправлено в [#1387](https://github.com/SkOrDs-02/sergeant/pull/1387) (змерджено 2026-10-08) (лишилось: розвести серверні бакети push/pull (політика rate-limit), автовідновлення dead_letter (ручний тріаж за дизайном `syncOpRetry.ts`); pull після push лишено, бо доставляє зміни інших пристроїв, а з debounce він і так зріджується)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: sync engine / api-client push loop
- **Де:** apps/web/src/core/syncEngine/syncEngineWriter.ts:200-202; apps/web/src/core/syncEngine/outboxNudge.ts:43-55; apps/web/src/core/syncEngine/singleton.ts:689-697; packages/api-client/src/endpoints/syncV2.pushLoop.ts:399-406,471-500; packages/db-schema/src/sqlite/syncOpRetry.ts:40-53; apps/server/src/routes/sync.ts:81-84
- **Першопричина:** notifyEnqueued одразу викликає flushNow без debounce, а кожен успішний push тягне за собою pull. /push, /pull і /stream стоять під одним per-user бакетом api:v2:sync 60/хв. Push-цикл не читає Retry-After і рахує 429/503 як спробу для кожного рядка батча. Після 10 спроб рядок іде в dead_letter, звідки його повертає лише кнопка.
- **Вплив:** Звичайне введення підходів у Фізруку (24 натискання за 7 с) вичерпує ліміт, і на хвилину стає синк усіх модулів в обидва боки. Під тривалим збоєм бекенду вся черга переходить у dead_letter і чекає ручного тапу.
- **Що зробити:** Коалесувати пуші: debounce 1-2 с або не частіше ніж раз на 3-5 с. Не робити pull після кожного push, поважати Retry-After і не рахувати 429/503 як спробу. На сервері розвести бакети push і pull. Після успішного push автоматично відновлювати dead_letter-рядки з транзієнтною причиною.
- **Примітка:** SYNC-2 у docs/work/specs/audits/2026-09-01-product-audit/findings.md позначена «зникло разом із SYNC-3», але механізм у коді лишився. Проблему підсилюють rel-09 і rel-10: зайві оп-и на кожну правку.

Знахідок у кластері: 2.

#### [medium] Кожне натискання клавіші в полі підходу запускає окремий sync push: за ~7 с вичерпується пер-юзерський ліміт 60/хв, синк усіх модулів блокується на хвилину

- **ID:** `browser-surfaces/fizruk-flows#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md (SYNC-2: «кожен запис = push (+ pull після)… writer не має обробки 429/Retry-After». Там позначено «✅ зникло разом із SYNC-3», але сам механізм у коді лишився.)
- **Де:** apps/web/src/core/syncEngine/syncEngineWriter.ts:200-202 (notifyEnqueued → flushNow, без debounce); apps/web/src/core/syncEngine/outboxNudge.ts:43-55; apps/server/src/routes/sync.ts:81-84 (api:v2:sync 60/хв, спільний для push і pull); UI: /fizruk/workout/:id/:itemId
- **Вплив:** Звичайне логування тренування (десятки натискань за хвилину) упирається в 429 для ВСІХ модулів: на хвилину не їде ні push, ні pull змін з інших пристроїв. Черга роздувається до сотень рядків, а вікно, коли дані є лише локально, зростає (див. знахідку про втрату локальних записів після аварійного закриття). У проді, де ліміт рахується на користувача, це відтворюється в кожного, хто швидко вводить підходи.
- **Рекомендація:** Додати debounce/coalescing у notifyEnqueued (наприклад, 1–2 с тиші або максимум 1 push на 3–5 с) і не робити pull після кожного push. Шанувати Retry-After після 429 (backoff, а не повтор на кожне натискання). Розглянути окремі бакети для push і pull.

**Докази:**

```text
typing.mjs: 4 підходи (+ Підхід, вага «80/82,5/85/87,5», повт «10»), 24 натискання за 7,3 с → push=46 (429: 16), pull=30. Заголовки RateLimit-Remaining: POST200/59 POST200/58 GET200/57 … GET200/10, тобто push і pull їдять один бакет. Тіло 429: {"code":"RATE_LIMIT_USER","error":"Забагато запитів. Спробуй через 56 секунд."}. Після цього плашка «Синхронізація · 74 в черзі» (раніше в sets.mjs 205 в черзі), а черга дренується лише пачками по 100 кожні ~30 с. Кожен push одразу тягне за собою pull. Скріншот: shots/fizruk-flows/typing-sets.png
```

**Відтворення:**

```text
Користувач fizruk-flows-main → почати тренування з будь-якою вправою → відкрити вправу → натиснути «+ Підхід» 4 рази і ввести вагу/повтори у звичайному темпі; у DevTools Network видно POST /api/v2/sync/push на кожен символ і 429 після ~60 запитів. Скрипт: <scratch>/agents/browser-surfaces-fizruk-flows/typing.mjs
```

**Верифікатор:**

```text
Код: кожен enqueueOutboxUpsert викликає notifyOutboxEnqueued → nudge → writer.notifyEnqueued() → scheduler.flushNow() (syncEngineWriter.ts:200-202, outboxNudge.ts:43-55). Ні debounce, ні coalescing, крім single-flight на час одного польоту (syncV2.pushScheduler.ts:229). singleton.ts:689-697: onTickComplete з pushed>0 одразу запускає reader.pullOnce(), тобто кожен push тягне за собою pull. Push, pull і навіть /stream стоять під одним per-user бакетом api:v2:sync 60/хв (routes/sync.ts:81-84; requireSession стоїть перед ним, тож ключ u:<id>). Writer не обробляє 429 і Retry-After: runSyncEnginePushOnce переводить батч у markRetry, а наступний nudge знову шле push. Targeted backoff є лише в reader (syncEngineReader.ts:132-160). Живий повтор на свіжому pool-юзері з 3 імпортованими тренуваннями, у спокійнішому темпі за finder-а (250 мс на клавішу, 1,5 с між полями): 23 дії за 22,8 с дали push=53 (з них 429: 24 підряд) і pull=29. RateLimit-Remaining спадає P56 G55 P54 … P0, далі тільки P429. Тіло відповіді: RATE_LIMIT_USER «Спробуй через 38 секунд». Ампліфікацію посилює знахідка #2: кожна правка ставить у чергу рядки всієї історії, і кожен рядок окремо смикає flush. Дані не губляться, бо o …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-fizruk-flows/v2.mjs (юзер verify-fizruk-flows-1, dIm64MnZQlIhT5MHzwEsDHftBLz8sUwJ). Вивід: «actions=23 in 22.8s; push=53 (429:24) …; pull=29 (429:1)». Послідовність заголовків: «P200/56 G200/55 P200/54 … P200/0 G429/0 P429/0 ×24». Під час імпорту 15 рядків теж пішло 8 push + 9 pull (v1.mjs).
```

#### [low] Політика ретраїв: 429/503 палять спроби й ігнорують Retry-After; push і pull ділять один бюджет 60/хв, і кожен успішний push запускає pull; dead_letter без автовідновлення

- **ID:** `client-static/gap-client-sync-engine-outbox#14` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** packages/api-client/src/endpoints/syncV2.pushLoop.ts:399-406, 471-500; packages/db-schema/src/sqlite/syncOpRetry.ts:40-53; apps/web/src/core/syncEngine/singleton.ts:689-697; apps/server/src/routes/sync.ts:81-84
- **Вплив:** Під навантаженням чи під час аварії бекенду ≥ ~15-35 хв уся черга переходить у dead_letter і чекає ручного тапу; при подальшому виході з акаунта (див. окрему знахідку) губиться.
- **Рекомендація:** Не рахувати 429/503 як спробу, поважати Retry-After; розвести бюджети push/pull або тротлити pull після push; автоматично викликати recoverDeadLetter для рядків з last_error http_5xx/network після першого успішного push.

**Докази:**

```text
Будь-яка не-термінальна помилка (429, 503, 5xx, 404) -> callPlanRetry для КОЖНОГО рядка батча (attempts++), Retry-After не читається (на відміну від reader-а, де є rateLimitWaitMs). Ліміт api:v2:sync 60/хв спільний для /push і /pull; onTickComplete при pushed>0 одразу викликає reader.pullOnce(), а догін курсора на дорослому акаунті сам по собі робить десятки запитів (коментар у singleton.ts:258-267). Після SYNC_OP_MAX_ATTEMPTS=10 рядок стає dead_letter; повернути його можна лише кнопкою (retrySyncV2DeadLetters), автоматичного recover після відновлення сервера немає.
```

**Відтворення:**

```text
Статично; для підтвердження — масовий імпорт (Strong CSV/виписка) одразу після першого входу на новому пристрої, спостерігати 429 на /api/v2/sync/push у server.log.
```

**Верифікатор:**

```text
Перевірено в коді. Будь-яка не-термінальна помилка push (включно з 429/503) іде в `callPlanRetry`/`markRetry` для кожного рядка батча з attempts++ (`pushLoop.ts:399-406`). `Retry-After` у push не читається, тоді як reader має `rateLimitWaitMs` (`syncEngineReader.ts:147-156`). Ліміт `api:v2:sync` 60/хв на користувача спільний для /push і /pull (`routes/sync.ts:81-84`). `onTickComplete` при pushed>0 одразу запускає `pullOnce`. Після SYNC_OP_MAX_ATTEMPTS=10 рядок стає dead_letter, а `recoverDeadLetter` викликається лише вручну (OfflineBanner → retrySyncV2DeadLetters). Сумарний бекоф 1+2+…+256 с ≈ 8,5 хв плюс 30-секундні тіки дає ~10-15 хв (коментар singleton.ts:644 це підтверджує), а не 15-35. Ручний DLQ-тріаж задекларовано в докстрінгу syncOpRetry.ts як дизайн. Живцем не відтворено. Severity low.
```

**Додаткові докази верифікатора:**

```text
syncOpRetry.ts:16-24 («a human triage path … decides»); singleton.ts:689-697 onTickComplete→pullOnce; 2026-09-13 review PR-A3 уже описував ланцюжок «429 → палить attempts → dead_letter», але для іншої першопричини (спільний IP-бакет, виправлено).
```

<a id="rel-09"></a>

### `rel-09` [medium] Будь-яка правка активного тренування перезаливає на сервер усю історію тренувань

- **Стан:** виправлено в [#1389](https://github.com/SkOrDs-02/sergeant/pull/1389) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук dual-write
- **Де:** apps/web/src/modules/fizruk/lib/fizrukDualWriteState.ts:301-321; apps/web/src/modules/fizruk/lib/sqliteWriter/diff/workouts.ts:85-97; apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts:257-321
- **Першопричина:** toWorkoutSnapshot щоразу створює нові масиви items і groups, а workoutChanged порівнює prev.items !== next.items за посиланням. Тож diff вважає зміненим кожне тренування і ставить у outbox workout, усі його items і всі sets з історії.
- **Вплив:** Кількість оп-ів на одне натискання росте разом з історією: 41 оп при 40 імпортованих тренуваннях, тисячі рядків у heavy-користувача. Це гарантовані 429 і роздутий outbox. Сервер відхиляє повтори як lww_conflict, тож користувач бачить хибні лічильники «N записів не прийнято». Застарілий пристрій зі свіжим updated_at може перетерти правки з іншого пристрою.
- **Що зробити:** Порівнювати снапшоти за вмістом (deep-equal або хеш рядка) або дифати лише тренування, id якого відомий у місці виклику persist. На сервері ідентичний повтор трактувати як duplicate, а не lww_conflict.

Знахідок у кластері: 1.

#### [medium] Будь-яка правка активного тренування перезаливає на сервер усю історію тренувань (workouts+items+sets) через порівняння масивів за посиланням

- **ID:** `browser-surfaces/fizruk-flows#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Де:** apps/web/src/modules/fizruk/lib/fizrukDualWriteState.ts:301-321 (toWorkoutSnapshot створює нові масиви items/groups щоразу); apps/web/src/modules/fizruk/lib/sqliteWriter/diff/workouts.ts:85-97 (workoutChanged: prev.items !== next.items)
- **Вплив:** Обсяг записів і трафіку на одну правку росте разом з історією: у heavy-користувача це тисячі рядків, а отже гарантовані 429, великий outbox і повільний SQLite. Застарілий пристрій, який перезаливає незмінені старі тренування зі свіжим updated_at, перетирає за LWW правки з іншого пристрою. Користувач бачить хибні й роздуті лічильники «N записів не прийнято».
- **Рекомендація:** Порівнювати снапшоти за вмістом (deep-equal або хеш рядка), а не за посиланням, або диф-ити лише змінене тренування (id відомий у місці виклику persist). Не перезаливати рядки з тим самим вмістом. На сервері ідентичний повтор вважати duplicate, а не lww_conflict.

**Докази:**

```text
sync_op_log для fizruk-flows-main: client_ts 02:54:22.436, 02:54:24.531, 02:54:25.16 (окремі натискання при введенні ваги в НОВОМУ тренуванні W3) кожен містить 14 рядків, тобто всі 3 тренування разом із незміненими завершеними W1/W2, їхніми 4 вправами і 6 підходами. Рядок W1 перезаписувався з однаковим вмістом 13 разів (змінювались лише created_at/updated_at). Сесія на мобільному в’юпорті (client_ts 03:25:59.576) знову перезалила всю історію, включно з відхиленим рядком strong_w_1dzy5nz. Через це лічильник у UI виріс до «8 записів не прийнято», а в аркуші синку той самий запис «Фізрук · fk violation» повторюється 8 разів (shots/fizruk-flows/sync-rejected-8.png). Акаунт з 40 імпортованими тренуваннями: старт порожнього тренування дав 41 op fizruk_workouts (client_ts 02:58:48.962). Перезаливи з однаковим client_ts сервер відхиляє як lww_conflict (1344 таких відхилень на 1040 рядків імпорту).
```

**Відтворення:**

```text
1) Мати 2+ завершені тренування. 2) Почати нове й ввести вагу в підхід. 3) psql: select client_ts, count(*), count(distinct row->>'id') from sync_op_log where user_id='<id>' group by 1 order by 1 desc; → кожна правка містить рядки всіх тренувань історії.
```

**Верифікатор:**

```text
Код: toWorkoutSnapshot (fizrukDualWriteState.ts:301-321) щоразу створює нові масиви items/groups через .map, а prev береться з peekFizrukDualWriteState() або з intended-ref (fizrukDualWriteIntent.ts:69-80), теж свіжих снапшотів. workoutChanged (diff/workouts.ts:85-97) порівнює prev.items !== next.items за посиланням, тому значення завжди true, а diffArray (diffArray.ts:30-33) видає workout-upsert для КОЖНОГО тренування. upsertWorkout (adapter.ts:257-321) ставить у outbox workout, усі items і всі sets. Мемоізації снапшотів немає. Живий повтор на свіжому юзері (3 імпортовані тренування, далі нове): у sync_op_log кожен client_ts моєї сесії містить усі тренування історії. 04:46:11.157 → 16 рядків (w=4, it=5, st=7), 04:46:11.158 / 46:43.592 / 47:20.82 / 47:21.085 → по 18 рядків (w=4, it=6, st=8), хоча змінювалось лише нове тренування. У даних finder-а те саме: 20–26 рядків на кожну правку. Це fizruk-аналог закритого SYNC-3 (finyk re-push). Ризик LWW-перезапису правок з іншого пристрою справжній: незмінені старі тренування переїжджають зі свіжим clientTs.
```

**Додаткові докази верифікатора:**

```text
psql по user dIm64MnZQlIhT5MHzwEsDHftBLz8sUwJ: client_ts 04:47:21.085 n=18 (w4/it6/st8), 04:47:20.82 n=18, 04:46:43.592 n=18, 04:44:48.753 n=15 (сам імпорт). По 0UPrSzCMKQBZkiBWC9vFbv1JwzAaMBso (finder): 03:35:32.779 n=26, 03:35:32.213 n=25, 03:35:31.688 n=48/24 ids тощо.
```

<a id="rel-10"></a>

### `rel-10` [medium] Кожна зміна комори перезаписує всі позиції місця: O(n²) sync-оп і порожня комора на новому пристрої

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Харчування (комора) dual-write
- **Та сама першопричина, що й** [`data-40`](./data-integrity.md#data-40): Обидва випливають з моделі комори «переписати весь список місця» з позиційними id: rel-10 дає O(n²) оп-ів і 429, data-40 тихі втрати при паралельних правках. Стабільні UUID позицій і поелементні операції закривають обидва (і полегшують data-10).
- **Де:** apps/web/src/modules/nutrition/lib/sqliteWriter/diff.ts:560-566; apps/web/src/modules/nutrition/lib/sqliteWriter/adapter.ts; apps/web/src/core/syncEngine/syncEngineReader.ts:195-206
- **Першопричина:** На кожну зміну адаптер комори ставить у outbox upsert для кожної позиції місця (у коді прямо написано «adapter always re-upserts the full items list»). n послідовних додавань дають n(n+1)/2 оп-ів.
- **Вплив:** 25 швидких додавань дали 325 оп-ів і 429 уже на 19-й секунді, тож синхронізація тягнеться хвилинами. Новий пристрій ~30 с показує «Тут поки порожньо» з закликом додати продукт, що провокує дублікати.
- **Що зробити:** Емітити upsert лише для змінених позицій (diff за стабільним id). Поки йде перший pull, показувати стан «синхронізую», а не порожній стан.

Знахідок у кластері: 1.

#### [medium] Кожна зміна комори перезаписує всі позиції місця: O(n²) sync-операцій, 429 вже після ~25 швидких додавань, новий пристрій ~30 с показує «Тут поки порожньо»

- **ID:** `browser-surfaces/nutrition-flows#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Де:** apps/web/src/modules/nutrition/lib/sqliteWriter/diff.ts:560-566 («adapter always re-upserts the full items list»); apps/server/src/routes/sync.ts:80-84 (api:v2:sync 60/хв на користувача); apps/web/src/core/syncEngine/syncEngineReader.ts:195-206
- **Вплив:** Обсяг sync_op_log і трафік ростуть квадратично від розміру комори; швидке введення списку чи імпорт впирається в rate limit і синхронізується хвилинами; на новому пристрої десятки секунд показується порожня комора з CTA «додай перший продукт», що провокує дублікати.
- **Рекомендація:** Емітити upsert лише для змінених позицій (diff по стабільному id, див. попередню знахідку), батчити push/pull (debounce), поважати Retry-After. На першому pull показувати стан «синхронізую», а не порожній стан.

**Докази:**

```text
Новий користувач додав 25 позицій по одній (~0.35 с між ними). sync_op_log: nutrition_pantry_items insert 325 (=1+2+...+25), nutrition_pantries insert 14, pantry_events 25. На кожну дію клієнт робить push + pull; на 18.7 с: '429 GET /api/v2/sync/pull', далі 26x '429 POST /api/v2/sync/push ra=50..7' (Retry-After ігнорується, повтори кожні 0.3-8 с). Сервер: t+15..45s items=6, t+60s 16, t+90s 24, t+135s 25. Лог сервера: 12 відповідей 429 лише для цього userIdHash. Новий контекст того ж користувача: 'Переношу дані' до 5.3 с, 'Тут поки порожньо' з 7.1 до 28.3 с, 'Моя комора (25)' лише на 29.9 с (pull since=0 повернув 500 операцій о 12.1 с).
```

**Відтворення:**

```text
Скрипт agents/browser-surfaces-nutrition-flows/11-sync-429.mjs (25 додавань «продуктN N00 г» у /nutrition/pantry/items, моніторинг сервера кожні 15 с), потім 33-fresh-pull-time.mjs (новий контекст, час до появи комори). SQL: select table_name, op, count(*) from sync_op_log where user_id=... group by 1,2.
```

**Верифікатор:**

```text
Підтверджено і в коді, і наживо. adapter.ts upsertPantry ставить у outbox op на КОЖНУ позицію місця при кожній зміні (diff.ts прямо пише «adapter always re-upserts the full items list»), тож n послідовних додавань дають O(n²) ops. Push і pull ділять один per-user бакет api:v2:sync 60/хв. Pull поважає Retry-After (rateLimitWaitMs у syncEngineReader), а push його ігнорує. Новий пристрій десятки секунд показує порожній стан.
```

**Додаткові докази верифікатора:**

```text
vb/02-pantry-bulk.mjs, новий користувач, 25 додавань за 11.4 с. У sync_op_log: nutrition_pantry_items insert applied 272 і rejected 15, nutrition_pantries 17, pantry_events 24. Перший 429 на 21.8 с (pull, ra=50), далі 26 push по 429 з інтервалом 0.3-1 с при Retry-After 50→9 (Retry-After ігнорується). На сервері: t+15..60 с items=7, t+75 с 16, t+120 с 23. vb/03-fresh-device.mjs: «Тут поки порожньо» видно з 5.5 до 24.9 с, потім «Моя комора (23)».
```

<a id="rel-11"></a>

### `rel-11` [medium] Один pulled-оп, що кидає виняток при apply, назавжди зупиняє отримання змін на пристрої

- **Стан:** виправлено в [#1388](https://github.com/SkOrDs-02/sergeant/pull/1388) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: sync engine reader
- **Де:** apps/web/src/core/syncEngine/syncEngineReader.ts:436-459,477-490; apps/web/src/core/syncEngine/applyPullOp.ts:211-229,360-365
- **Першопричина:** pullOnce викликає applyPullOp у циклі сторінки без per-op try/catch, а курсор пише лише після успіху всієї сторінки. Виняток SQLite (CHECK, NOT NULL, I/O) обриває тік, і наступний тік бере ту саму сторінку. Неідемпотентні оп-и перед отруйним, як increment стріка, застосовуються повторно на кожному тіку.
- **Вплив:** Пристрій мовчки й назавжди перестає отримувати зміни з інших пристроїв, а Sentry отримує подію щохвилини. Зараз проблема латентна (у sync_op_log 0 порушень клієнтських обмежень), але її вмикає будь-який дрейф схеми між версіями клієнтів.
- **Що зробити:** Обгорнути applyPullOp у per-op try/catch і трактувати виняток як rejected зі звітом у Sentry. Писати курсор в одній транзакції з apply кожного опа, щоб повтор не дублював increment.

Знахідок у кластері: 1.

#### [medium] Один pulled-оп, що кидає виняток при apply, назавжди заклинює pull-курсор (а інкременти перед ним застосовуються повторно щотіку)

- **ID:** `client-static/gap-client-sync-engine-outbox#5` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/core/syncEngine/syncEngineReader.ts:436-459, 477-490; apps/web/src/core/syncEngine/applyPullOp.ts:360-365, 211-229
- **Вплив:** Пристрій мовчки перестає отримувати будь-які зміни з інших пристроїв назавжди (Sentry отримує подію щохвилини), а не втрачає один рядок.
- **Рекомендація:** Обгорнути applyPullOp у per-op try/catch: виняток трактувати як rejected (з Sentry-звітом) і йти далі; або квантувати/карантинити оп. Писати курсор після кожного опа в одній транзакції з apply (BEGIN; apply; UPDATE cursor; COMMIT), щоб повтор не застосовував increment двічі.

**Докази:**

```text
applyPullOp не має per-op try/catch: виняток SQLite (CHECK/NOT NULL/I-O) пролітає з циклу, writePullSinceCursor для сторінки не викликається, наступний тік бере ту саму сторінку і падає знову. На відміну від 'rejected' (курсор іде далі), це повна зупинка синку для пристрою. Прогін createSyncEngineReaderRuntime з реальною БД і логом [routine_habits h1, nutrition_pantry_events (consume без delta_qty), routine_habits h2]:
pull #1 threw: CHECK constraint failed: nutrition_pantry_events_qty_shape  cursor = 0 habits=[h1]
pull #2 threw ... cursor = 0
pull #3 threw ... cursor = 0  (h2 не застосовано ніколи)
Опи до отруйного (у т.ч. routine_streaks 'increment', не ідемпотентний) переписуються щотіку; те саме при reload посеред сторінки на 500 опів. Перевірив поточний sync_op_log на порушення клієнтських NOT NULL/CHECK — 0, тобто зараз латентно, але будь-який дрейф схеми/версій клієнтів (mobile, старі білди) вмикає це.
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t3_wedge.mts
```

**Верифікатор:**

```text
In syncEngineReader.pullOnce, applyPullOp is awaited inside the page loop with no per-op try/catch. writePullSinceCursor runs only after the whole page succeeds. Any throw (a CHECK or NOT NULL violation in the generic INSERT, or an I/O error) aborts the tick without saving the cursor, and the next tick re-fetches the same page and fails again. That is a permanent stall, which is the exact outcome the file's own design comment rejects for 'rejected' ops. Ops earlier in the page are replayed each tick: LWW upserts are idempotent through isStaleLocal, but routine_streaks 'increment' is not. A tab closed mid-page has the same re-apply effect. Severity stays medium rather than high because no current sync_op_log row violates client constraints (the finder's check), so the permanent stall needs schema or version drift. The client has no FKs (checked), so FK violations cannot trigger it.
```

**Додаткові докази верифікатора:**

```text
Verifier rerun of t3_wedge.mts with the real createSyncEngineReaderRuntime: pull #1/#2/#3 each threw 'CHECK constraint failed: nutrition_pantry_events_qty_shape', cursor stayed 0, habit h2 was never applied, and every tick sent a Sentry event. The line numbers in the finding (436-459, 477-490) do not match: syncEngineReader.ts at HEAD has 306 lines and the loop is at 189-245. Content is otherwise accurate.
```

<a id="rel-12"></a>

### `rel-12` [medium] Вихід з акаунта і «Скинути кеш PWA» видаляють Workbox precache: офлайн-запуск зламаний до наступного деплою

- **Стан:** виправлено в [#1396](https://github.com/SkOrDs-02/sergeant/pull/1396) (змерджено 2026-10-08) (побічна ціна unregister - втрата push-підписки - закрита відновленням `restoreWebPushSubscriptionIfLost` після reload)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: service worker
- **Де:** apps/web/src/sw/cache.ts:237-253; apps/web/src/sw/messages.ts:66-95; apps/web/src/core/auth/AuthContext.tsx:618-622; apps/web/src/core/app/swControl.ts:162-171; apps/web/src/core/settings/PWASection.tsx:20-27
- **Першопричина:** clearAppCaches видаляє і workbox-precache*, хоча там лише ассети збірки без даних користувача. Workbox відновлює precache тільки коли в маніфесті є integrity, а її немає, тож кеш лишається порожнім до встановлення нового SW. Кнопка скидання при цьому не викликає ні update(), ні unregister().
- **Вплив:** Хто хоч раз вийшов з акаунта, втрачає офлайн-запуск PWA: без мережі білий екран або ERR_FAILED (відтворено двома лейнами). «Скинути кеш PWA» не лікує застряглу версію, бо старий SW лишається активним. Заодно стираються ~5,6 МБ зображень вправ.
- **Що зробити:** На logout чистити лише користувацькі кеші (api-cache-_, navigations-_). Для «Скинути кеш PWA» після очищення робити registration.unregister() або update() разом зі skipWaiting і лише потім reload.

Знахідок у кластері: 2.

#### [medium] Logout і «Скинути кеш PWA» назавжди видаляють precache: застосунок перестає відкриватися офлайн до наступного деплою, а застряглий SW лишається

- **ID:** `client-static/service-worker-pwa#3` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/sw/cache.ts:237-253 (clearAppCaches видаляє workbox-precache*); apps/web/src/sw/messages.ts:66-95; apps/web/src/core/auth/AuthContext.tsx:619; apps/web/src/core/settings/PWASection.tsx:20-27; node_modules/workbox-precaching/PrecacheStrategy.js:99-112
- **Вплив:** Кожен явний вихід (і кожне натискання «Скинути кеш PWA») мовчки вимикає офлайн-режим на весь час життя поточного SW — після тосту «Додаток готовий до роботи офлайн». Кнопка, яка за текстом лікує «застряглу версію», не викликає registration.update()/unregister(), тож старий воркер лишається активним.
- **Рекомендація:** На logout чистити лише користувацькі кеші (api-cache-_, navigations-_); precache і exercise-images не містять даних користувача. Для «Скинути кеш PWA» після очищення робити registration.unregister() (або update() + skipWaiting) і лише тоді reload, щоб новий SW заново встановив precache.

**Докази:**

```text
exp6.log:
before clear: {"workbox-precache-v2-http://127.0.0.1:4173/":429,...}
clear result: deleted ["workbox-precache-v2-...","navigations-v..."]
after clear + 3 online loads: {"navigations-v1790885250982":2}   ← precache не відновився
same SW still active? {active:true, waiting:false}
offline /fizruk: net::ERR_FAILED → chrome-error://chromewebdata/ «This site can’t be reached»
offline /: net::ERR_FAILED
Workbox PrecacheStrategy «ремонтує» precache лише коли в маніфесті є integrity (його немає), тож після видалення кеш порожній до встановлення нового SW. clearAppCaches також стирає exercise-images-v* (~5.6 МБ) без потреби.
```

**Відтворення:**

```text
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node <scratch>/agents/client-static-service-worker-pwa/exp6-clear-precache.mjs — постить те саме CLEAR_SW_CACHES, що logout()/PWASection, робить 3 онлайн-завантаження, потім відрізає мережу і відкриває /fizruk та /.
```

**Верифікатор:**

```text
Відтворено незалежно (v3-precache.mjs), і проблема серйозніша, ніж «губиться fallback». clearAppCaches (cache.ts:237-253) видаляє workbox-precache*. Workbox PrecacheStrategy._handleFetch (node_modules/workbox-precaching/PrecacheStrategy.js) ремонтує precache лише за наявності integrity. У маніфесті зібраного sw.js 434 записи, жоден не має integrity. Precache-роут обслуговує «/», тобто start_url PWA (vite.config start_url: "/"), тому «/» ніколи не потрапляє в navigations-кеш. Після очищення офлайн-запуск із «/» дає Response.error() від catch-handler: resolveOfflineShell → matchPrecache → null. Так триває до встановлення нового SW, тобто до наступного деплою: реєстрація лишається active без waiting. Обидва шляхи (logout і кнопка в PWASection) шлють ту саму CLEAR_SW_CACHES. Пункт «застряглий SW лишається» другорядний: після reload NetworkFirst-навігація однаково бере свіжий HTML. Severity medium.
```

**Додаткові докази верифікатора:**

```text
v3.log:
baseline caches: precache 429, navigations ["/welcome?__u=anon"]
BASELINE offline /fizruk: 200 (app renders), offline /routine: 200
clear: deleted ["workbox-precache-v2-http://127.0.0.1:4173/","navigations-v1790885250982"]
after clear + online loads (/sign-in, /): {"navigations-v…":["/sign-in?__u=anon"]}: precache не відновився, "/" у navigations немає
reg: {active:true, waiting:false}
AFTER-CLEAR offline /: net::ERR_FAILED → chrome-error://chromewebdata/
AFTER-CLEAR offline /fizruk, /routine: net::ERR_FAILED
sw.js manifest: 434 entries, 0 with integrity.
```

#### [medium] Вихід видаляє Workbox precache: після цього PWA офлайн не стартує (білий екран або ERR_FAILED) до наступного оновлення SW

- **ID:** `browser-crosscut/data-isolation-browser#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Де:** apps/web/src/sw/cache.ts:237-252 (clearAppCaches видаляє і `workbox-precache*`), викликається з logout через swClearCaches (apps/web/src/core/auth/AuthContext.tsx:618-622, core/app/swControl.ts:162-171)
- **Вплив:** Кожен користувач, який хоч раз вийшов з акаунта, втрачає офлайн-запуск PWA до наступного деплою: застосунок без мережі показує білий екран. У precache лише ассети збірки, тож для ізоляції користувачів його видаляти не потрібно.
- **Рекомендація:** У CLEAR_SW_CACHES при logout чистити лише navigations-_, api-cache-_, exercise-images-*, а workbox-precache не чіпати. Повне очищення лишити для ручного «Очистити кеш», а після нього викликати registration.update() або повторно наповнювати precache.

**Докази:**

```text
31-run.log: caches before logout {"workbox-precache-v2-http://127.0.0.1:4173/":429}. Офлайн /welcome до виходу рендериться («Офлайн Sergeant …»). Після «Вийти»: caches {"navigations-v1790885250982":1}. Офлайн /welcome → net::ERR_FAILED, офлайн /sign-in → білий екран (shots/.../31-after-logout_sign_in.png). Після ще одного онлайн-візиту precache створено порожнім ({"workbox-precache-v2…":0}), і офлайн /welcome усе одно ERR_FAILED. Те саме видно в 13-run.log (після виходу і повторного входу precache немає).
```

**Відтворення:**

```text
1) Увійти, дочекатись заповнення workbox-precache (~429 записів). 2) «Вийти». 3) caches.keys(): precache зник. 4) Вимкнути мережу і відкрити /welcome або /sign-in. Скрипт: 31-precache-after-logout.mjs.
```

**Верифікатор:**

```text
`logout()` викликає `swClearCaches()` → CLEAR_SW_CACHES → `clearAppCaches()` (sw/cache.ts:237-252), а та видаляє і `workbox-precache*`. Ассети збірки віддає тільки precache-маршрут: окремого runtime-маршруту для /assets немає. Workbox при промаху в precache бере ресурс із мережі, але назад у кеш не кладе (у маніфесті немає integrity), тож precache відновиться тільки при наступному install SW, тобто після нового деплою. Офлайн-фолбек навігації (`setCatchHandler` → `matchPrecache`) теж залежить від precache. Те, що ручне «Скинути кеш» видаляє precache, задокументовано (PWASection AI-CONTEXT). Але для logout ізоляція даних цього не потребує, бо в precache лише публічні ассети. Найважливіше: я відтворив сценарій з реальним впливом на користувача, вихід і повторний вхід, після якого офлайн-запуск зламаний.
```

**Додаткові докази верифікатора:**

```text
v7-run.log (v7-precache.mjs): до виходу caches {"workbox-precache-v2-…":429,…}, офлайн-reload /routine рендерить «Офлайн … Рутина Звички й події…» (v7-baseline-offline.png). Після «Вийти» лишається {"navigations-v…":1}. Після повторного входу і переглядів /routine, /finyk, / маємо {"navigations-v…":3,"api-cache-v…":7}: precache немає зовсім. Офлайн /routine дає порожній текст і суцільний сірий екран (shots/verify-browser-crosscut-data-isolation-browser/v7-relogin-offline.png).
```

<a id="rel-13"></a>

### `rel-13` [medium] Після збою завантаження чанка модуль недоступний до кінця сесії: «Спробувати ще» нічого не робить

- **Стан:** виправлено в [#1413](https://github.com/SkOrDs-02/sergeant/pull/1413) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: module shell / error boundary
- **Де:** apps/web/src/core/ModuleErrorBoundary.tsx:48-54,159; apps/web/src/modules/finyk/route.tsx:7; apps/web/src/core/app/ModuleShell.tsx:63; apps/web/src/core/lib/lazyImport.ts
- **Першопричина:** На retry ModuleErrorBoundary лише ремаунтить дітей. Модульні компоненти — singleton React.lazy, який назавжди кешує відхилений import(). Межа не перевіряє isChunkLoadError і не пропонує reload.
- **Вплив:** Один невдалий fetch чанка (нестабільна мережа, ще неактивний SW, застарілий хеш після деплою) робить модуль недоступним. У standalone-PWA без кнопки reload доводиться вбивати застосунок.
- **Що зробити:** Для chunk-помилок показувати окремий текст із кнопкою «Оновити» (location.reload()) або на retry створювати lazy-компонент заново зі свіжим import().

Знахідок у кластері: 1.

#### [medium] Після збою завантаження чанка модуля модуль лишається недоступним до кінця сесії: «Спробувати ще» нічого не робить, повторний вхід дає ту саму помилку

- **ID:** `browser-crosscut/resilience-offline-perf#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Де:** apps/web/src/core/ModuleErrorBoundary.tsx:48-54,159 (retry лише ремаунтить через key); apps/web/src/modules/finyk/route.tsx:7 (lazyDefault -&gt; React.lazy кешує відхилений import()); apps/web/src/core/app/ModuleShell.tsx:63. URL /finyk
- **Вплив:** Один невдалий fetch чанка (нестабільна мережа на першому візиті, ще не активний SW, застарілий хеш після деплою, коли guard уже вичерпав reload) робить модуль недоступним до повного перезавантаження. У встановленій standalone-PWA на iOS/Android кнопки reload немає, тож доводиться вбивати застосунок.
- **Рекомендація:** У ModuleErrorBoundary перевіряти isChunkLoadError і показувати копі про завантаження з кнопкою «Оновити» (location.reload()) або створювати lazy-компонент заново зі свіжим import() на retry. Не показувати generic «Помилка в модулі» для chunk-помилок.

**Докази:**

```text
run-chunkretry.log: 'finykapp: … Помилка в модулі Спробувати ще До вибору модуля'; 'after network recovers + Спробувати ще: fullReload=false url /finyk text: … Помилка в модулі'. 33-chunk-reenter: '3 (re-enter finyk, network OK now): /finyk … Помилка в модулі'. Console: 'ChunkLoadError: Vite preload resolved with undefined module…', 'TypeError: Failed to fetch dynamically imported module …FinykApp-XwvrBUZn.js'. Скрін: chunk-finykapp-abort-direct.png
```

**Відтворення:**

```text
node 27-chunk-retry.mjs і 33-chunk-reenter.mjs (serviceWorkers: block): abort для /assets/FinykApp-*.js, відкрити /finyk, дочекатися авто-reload від guard-а, зняти abort, натиснути «Спробувати ще» або «До вибору модуля» і знову «Фінік».
```

**Верифікатор:**

```text
I checked the code. ModuleErrorBoundary.handleRetry only bumps retryRev to remount children. FinykApp is a module-level lazyDefault(...) singleton (finyk/route.tsx:7), and React.lazy keeps its rejected payload for good. shareImport in lazyImport.ts clears its own inFlight on rejection, as its comment says, but that only helps preload(). The lazy() wrapper never calls the loader again, so remounting rethrows the same ChunkLoadError. The boundary does not check isChunkLoadError, has no reload action, and shows the generic 'Помилка в модулі'. chunkReload's 10 s cooldown and MAX_RELOADS=3 cap mean the automatic reload can be refused, which leaves the user here. Going back to the hub and re-entering reuses the same lazy singleton. Likelihood is moderate because SW precache normally serves module chunks. The realistic triggers are a first visit before the SW activates on a flaky network, or the case after the reload cap is used up.
```

**Додаткові докази верифікатора:**

```text
Independent repro with v5-chunk.mjs (serviceWorkers: block, abort FinykApp-*.js). Auto-reload at 0.9 s, then a second failure and the boundary shows 'Помилка в модулі Спробувати ще До вибору модуля'. The abort was lifted at 20.4 s. Clicking 'Спробувати ще' gave the same text and made no new network request for the chunk (no ABORT hit; console 'Failed to fetch dynamically imported module'). 'До вибору модуля' -> '/', then re-entering /finyk gave the same error. Screenshot: v5-reenter.png.
```

<a id="rel-14"></a>

### `rel-14` [medium] Кнопка «Оновити» PWA ненадійна: активація зависає на 5 хв або проходить без перезавантаження

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: SW update flow
- **Де:** apps/web/src/core/app/useSWUpdate.ts:74-91; apps/web/src/sw/messages.ts:24; apps/web/src/core/observability/webVitals.ts:59-69,224; node_modules/workbox-window/Workbox.js:294; vite-plugin-pwa register.js:57-63
- **Першопричина:** applyUpdate шле SKIP_WAITING і покладається на reload від vite-plugin-pwa, а той спрацьовує лише при event.isUpdate. Якщо першим input на сторінці став тап «Оновити», LCP-beacon web-vitals іде через fetch-обробник старого SW і тримає його до 5-хвилинного ліміту. У першій сесії, коли SW встановився під час цього ж завантаження, isUpdate=false і reload не відбувається взагалі.
- **Вплив:** Тост зникає без результату, людина працює далі, а через 5 хв отримує несподіваний reload, що з'їдає незбережений ввід (відтворено в 5 з ~11 прогонів). У першій сесії застосунок лишається на старому JS проти нового precache. Перший лінивий перехід тоді дає 404 чанка, reload і повернення на попередній екран.
- **Що зробити:** Після SKIP_WAITING самостійно чекати controllerchange з таймаутом ~3 с, показувати «Оновлюю…» і робити location.reload() незалежно від isUpdate (через власний onNeedReload). Поки оновлення застосовується, не відправляти телеметрію web-vitals і фонові fetch-запити.
- **Примітка:** Верифікатор виключив артефакт Playwright окремим raw-CDP прогоном без DevTools на SW. Довідкову знахідку gap-sw-update-new-deploy#10 (що працює коректно) відхилено як не-дефект.

Знахідок у кластері: 2.

#### [medium] Після натискання «Оновити» активація часто зависає рівно на 5 хв, а потім сторінка сама перезавантажується посеред роботи

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Де:** apps/web/src/core/app/useSWUpdate.ts:74-91 (applyUpdate → updateSW → SKIP_WAITING), apps/web/src/sw/messages.ts:24, apps/web/src/core/observability/webVitals.ts:59-69,224 (LCP sendBeacon на перший input), vite-plugin-pwa register.js:57-63 (reload на controlling). URL: http://127.0.0.1:4173/finyk
- **Вплив:** Тост зникає і нічого не відбувається, тож кнопка виглядає зламаною. Людина продовжує працювати, а через 5 хв отримує несподіваний reload, який з'їдає незбережений ввід (відтворено). Найімовірніше саме тоді, коли тост показано одразу при старті застосунку (pending update) і перший тап припадає на «Оновити»: 5 з ~11 таких прогонів зависли.
- **Рекомендація:** Після SKIP_WAITING чекати controllerchange з таймаутом (~3 с) і показувати стан «Оновлюю…». Передати в registerSW власний `onNeedReload`, який перезавантажує, лише якщо від кліку минуло кілька секунд, а інакше показує «Оновлення готове, перезавантажити?». На час застосування оновлення не відправляти телеметрію (web-vitals flush) і не запускати фонові fetch-и.

**Докази:**

```text
CDP ServiceWorker-лог 06-long-1.log: `22.4 CLICK Оновити / 22.5 ver 0 stopping / 22.6 REQ POST 3000/api/v1/metrics/web-vitals / 22.6 ver 0 starting / 22.7 ver 0 running ... 322.6 ver 0 redundant → TRANSITION after 300.5 s`. Таке саме 300.3 с (12-formA.log, 12-firstA.log), 300.9 с (13-offline.log), понад 80-100 с без активації (03, 04). 18b.log: `STALL: 4 s after tap the page did not reload, toast gone` → користувач вводить витрату → `RESULT {"reloadAfterTapS":"300.8","formAfter":null}`. Контроль: якщо до «Оновити» на сторінці вже був клік, 4/4 прогони активуються за 1.3-1.6 с, beacon у момент тапу відсутній (06-pre-1..4.log). Screenshot: 18-after-tap-nothing-happens.png (тост зник, нічого не сталося).
```

**Відтворення:**

```text
node 18-stall-then-type.mjs (або 06-cdp-diag.mjs long): відкрити /finyk зі старим SW, задеплоїти новий sw.js, registration.update(), першою ж взаємодією тапнути «Оновити» у тості. Старий воркер зупиняється, але web-vitals LCP-beacon (відправляється на перший input) проходить через fetch-обробник SW і перезапускає його; Chromium тримає lame-duck до 5 хв, після чого активує новий SW, і `controlling` перезавантажує сторінку.
```

**Верифікатор:**

```text
I first suspected a Playwright artefact, because Playwright always attaches DevTools to service-worker targets and that changes how idle workers are terminated. To rule it out I wrote a raw-CDP driver (rawcdp-stall.mjs). It launches Chromium itself and attaches only to the page target, with no Target.setAutoAttach, so DevTools is never attached to the SW. Same flow as the finding: /finyk with the old SW controlling, a new sw.js served through the local proxy, registration.update(), then the very first input is a mouse tap on «Оновити». Result: the waiting SW activated after 300.4 s and the page reloaded after 301.4 s. I re-ran with API traffic to :3000 bypassing the proxy and got 300.5 s, so the proxy is not the cause. Control run with one click on the page before the tap: activation 1.4 s, reload 2.4 s. At the tap the page sends OPTIONS+POST /api/v1/metrics/web-vitals (the first-input LCP flush), which matches the original diagnosis. useSWUpdate.applyUpdate gives no feedback and has no timeout or fallback, so the toast disappears and nothing happens until Chromium's 5-minute lame-duck cap forces activation and vite-plugin-pwa reloads. Medium is a fair rating.
```

**Додаткові докази верифікатора:**

```text
verify dir logs: raw-1.log `21.3 TAP Оновити ... RESULT {"preclick":false,"activatedAfterS":"300.4","reloadAfterS":"301.4"}`, with request `{"t":21.372,"u":"OPTIONS 3000/api/v1/metrics/web-vitals"}` at the tap. raw-2-bypass.log `activatedAfterS 300.5` with API bypassing the proxy. raw-pre-1.log (pre-click control) `activatedAfterS 1.4, reloadAfterS 2.4`. Code: useSWUpdate.ts:74-91 (no controllerchange wait or timeout), webVitals.ts flush via sendBeacon.
```

#### [low] У першій сесії (SW встановився під час цього завантаження) «Оновити» активує новий SW без reload, і застосунок далі працює на старому JS проти нового прекешу

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** node_modules/workbox-window/Workbox.js:294 (`_isUpdate = Boolean(navigator.serviceWorker.controller)` на момент register) + vite-plugin-pwa register.js:57-58 (reload лише при event.isUpdate); apps/web/src/core/app/useSWUpdate.ts:84-91 (applyUpdate не перезавантажує, якщо waiting був)
- **Вплив:** Перший візит (або сесія після «очистити дані сайту», або перший запуск після встановлення) — саме той, де людина довго тримає вкладку. Кнопка «Оновити» нічого видимого не робить, а перший лінивий перехід закінчується мерехтінням reload і поверненням на попередній екран.
- **Рекомендація:** У applyUpdate після SKIP_WAITING одноразово слухати `navigator.serviceWorker` `controllerchange` і робити `location.reload()` самостійно, якщо vite-plugin-pwa цього не зробив (isUpdate=false). Або передати onNeedReload і обробляти обидва випадки в одному місці.

**Докази:**

```text
20-first-session.mjs: після тапу «Оновити» `{"sw":{"waiting":null},"newLoads":[],"toastStill":false}`, тобто SW активовано, але сторінка не перезавантажилась. Далі тап вкладки «Фізрук»: `old404:["/assets/route-Cy4cDlNs2.js"]`, `fullReloads:["28.1 /finyk"]`, `url:"/finyk"`: тихий reload повертає людину на попередній екран замість Фізрука. 12-firstA.log: вкладка A, відкрита до появи SW, після активації не перезавантажилась (`A navigations after activation: []`), прекеш уже без старих імен (`oldNames:0`), перехід на /fizruk → 2 OLD-404 (route-Cy4cDlNs2.js, ModuleShell-BIzSrB8N.js) і reload на "/". Screenshots: 20-first-after-tap.png, 20-first-nav_fizruk.png
```

**Відтворення:**

```text
node 20-first-session.mjs: нова сесія (без SW) → /finyk, SW встановлюється і забирає контроль, клік по сторінці; деплой + registration.update(); «Оновити» → активація без reload; тап «Фізрук» → 404 старого чанка → chunkReload робить reload і лишає на /finyk.
```

**Верифікатор:**

```text
Code: workbox-window Workbox.js:294 sets _isUpdate from navigator.serviceWorker.controller at register() time. In a tab whose page load had no controller (first visit, after «clear site data», after a hard reload), the later `controlling` event has isUpdate=false, so vite-plugin-pwa's listener does not reload. applyUpdate saw a waiting worker, so it skips its own reload as well. Reproduced with a fresh context and my own pool user: after tapping «Оновити» the SW activated (waiting=null) with no reload (newLoads: []), and the toast disappeared. Tapping the «Фізрук» tab then requested the old chunk /assets/route-Cy4cDlNs2.js, got a 404, and triggered a full reload that left the user on /finyk instead of /fizruk. Downgraded to low: it only affects tabs that started without a SW controller, the update does get applied, and chunkReload recovers with a single extra reload.
```

**Додаткові докази верифікатора:**

```text
verify dir v20.log: `after tap {"sw":{"waiting":null,...},"newLoads":[],"toastStill":false}`, `nav /fizruk {"url":"/finyk","fullReloads":["26.3 /finyk"],"old404":["/assets/route-Cy4cDlNs2.js"]}`.
```

<a id="rel-15"></a>

### `rel-15` [medium] Перша звичка нового користувача: відмітка одразу після створення «відкочується» в UI

- **Стан:** виправлено в гілці claude/fix-rel-15-routine-first-habit
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Рутина (кеші після pull)
- **Де:** apps/web/src/modules/routine/lib/routineStorage.ts:150-230; apps/web/src/modules/routine/hooks/useRoutineState.ts; apps/web/src/core/syncEngine/refreshCachesAfterPull.ts
- **Першопричина:** Перший цикл синку (pull since=0 → refreshCachesAfterPull → refreshSqliteCompletions/RoutineState → emitRoutineStorage) перезаписує свіжіший write-through кеш старішим снапшотом SQLite. Кеш не версіонований відносно останнього локального запису.
- **Вплив:** Перша дія нового користувача виглядає так, ніби не спрацювала: кільце 0/1, кнопка знову «Виконано», а поруч напис «усі звички відмічені». Людина тисне повторно і втрачає довіру до модуля. Дані при цьому збережені, після reload видно 1/1.
- **Що зробити:** Версіонувати write-through кеш, щоб він не приймав снапшот SQLite, старший за останній локальний запис, або перечитувати кеш після завершення dual-write. Додати e2e: створити звичку, одразу відмітити, стан стабільний 5 с.
- **Примітка:** Гонка: верифікатор відтворив 2 з 3 спроб, у третій перший pull стартував до відмітки.
- **Уточнення першопричини (відтворення 2026-10-08):** винен не pull, а **boot-refresh** `refreshSqliteCompletions` (`sqliteReadBoot.ts` → `bootSqliteReadPath`). Він чекає, поки відкриється sqlite-wasm (секунди на новому акаунті), і читає `routine_entries`, куди dual-write відмітки ще не дійшов (`rows=0`, локальне вікно запису `moved=true`), після чого публікує порожній знімок: кеш 1→0. Перший pull стартує у ту саму мить лише тому, що теж чекає на SQLite (відповідь `ops: []`, кешів не оновлює), тож кореляція з pull у верифікатора була збігом. `refreshSqliteRoutineState` причинний гвард мав, `refreshSqliteCompletions` ні. Фікс: той самий гвард (`markRoutineLocalWrites` до читання, `routineLocalWritesMoved` перед публікацією), seq-гвард не змінено, кеш у циклі не перечитується.

Знахідок у кластері: 1.

#### [medium] Перша звичка: відмітка одразу після створення «відкочується» в UI (0/1, кнопка «Виконано»), хоча збережена

- **ID:** `browser-surfaces/routine-flows#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `reliability`
- **Де:** http://127.0.0.1:4173/routine; apps/web/src/modules/routine/lib/routineStorage.ts:150-230 (write-through кеші), hooks/useRoutineState.ts (ROUTINE_EVENT → loadRoutineState), core/syncEngine/refreshCachesAfterPull.ts
- **Вплив:** Найперша дія нового користувача (FTUX) виглядає як така, що не спрацювала: кільце 0/1, кнопка знову «Виконано», при цьому поруч напис «усі звички відмічені». Людина тисне вдруге/втретє, отримує зайві події в журналі або плутанину й недовіру до модуля.
- **Рекомендація:** Знайти асинхронне оновлення кешів (refreshCachesAfterPull / boot SQLite-read), яке перезаписує write-through кеш застарілим снапшотом SQLite, і або версіонувати кеш (не приймати снапшот, старший за останній локальний запис), або перечитувати після завершення dual-write. Додати e2e: створити звичку → одразу відмітити → стан стабільний 5 с.

**Докази:**

```text
Свіжий акаунт (2 з 2 спроб, routine-flows-race і routine-flows-race2): створити «Race A», за ~0.7 с натиснути «Виконано».
+0.6s: «1/1 … День закрито … row: done»
+1s…+15s: «0/1 | … | День закрито: усі звички на сьогодні відмічені. | Відмітити всі звички на цей день | row: open»
Push пішов: routine_entries.insert …:2026-10-02; після reload: «1/1 … Найкраща серія 1 день … row: done». На акаунті з уже наявними звичками (race3, delay 0/1500/3000 мс) не відтворюється.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/race1.mjs <новий-ключ> «Назва» — новий користувач, /routine, «+» → звичка «Щодня» → «Додати звичку» → одразу «Виконано», спостерігати 15 с.
```

**Верифікатор:**

```text
Відтворив 2 з 3 спроб на свіжих пул-юзерах тим самим сценарієм, що в race1. Відкат стабільно настає разом із першим циклом sync (pull since=0 → refreshCachesAfterPull → refreshSqliteCompletions/refreshSqliteRoutineState → emitRoutineStorage). Свіжіший write-through кеш перезаписується старішим снапшотом SQLite. У спробі, яка не відтворилась, перший pull стартував ДО відмітки (6797 мс), тобто це гонка, а не артефакт тесту. Дані не губляться: push routine_entries.insert пішов, після reload усе 1/1. Але UI суперечить сам собі («0/1» поруч із «День закрито: усі звички відмічені»), і стан не виправляється щонайменше 15 с. Гарду проти застарілого снапшоту немає. Medium лишаю: це найперша дія FTUX у core-flow, хоча даних не втрачено.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-routine-flows/v2_race.mjs. verify-routine-race-b: на 12646 мс «1/1 … row: done», на 15699 мс «0/1 | … | День закрито: усі звички на сьогодні відмічені. | Відмітити всі звички на цей день», те саме на 19729 і 27757 мс, після reload «1/1». Перший REQ /v2/sync/pull?since=0 був на 15697 мс, тобто збігся з моментом відкату. verify-routine-race-c: те саме (відкат між 9643 і 11685 мс, pull на 10107 мс). verify-routine-race-a не відтворився: pull на 6797 мс, ще до відмітки.
```

<a id="rel-16"></a>

### `rel-16` [medium] Дії HubChat у Фініку, Харчуванні й Фізруку рапортують «записано», навіть коли запис нікуди не ліг

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: HubChat action executors
- **Де:** apps/web/src/core/lib/hubChatActions.ts:86-117; apps/web/src/modules/finyk/lib/sqliteWriter/chatBridge.ts:71-87,130-131,148-149; apps/web/src/core/lib/chatActions/fizrukActions/programs.ts:33-41; apps/web/src/core/lib/chatActions/crossActions/goalAndUtility.ts:151-198
- **Першопричина:** settle() чекає на durability лише коли хендлер повертає confirm, а повертає його тільки Рутина. Finyk chatBridge мовчки виходить, якщо dual-write runtime ще не зареєстрований: без буфера й без журналу. add_program_day пише в deprecated-ключ fizruk_plan_template_v1, а set_goal — у hub_goals_v1, і жоден з цих ключів ніхто не читає.
- **Вплив:** Користувач вірить, що програму тренувань, ціль чи витрату збережено, а жоден екран її не покаже. Той самий клас проблем, що QA F-12, лишився в трьох модулях із чотирьох.
- **Що зробити:** Повертати confirm: Promise&lt;boolean&gt; з усіх write-екзекуторів, як у routinePersistence. У chatBridge буферизувати чи журналювати запис замість return. add_program_day переписати на SQLite-шаблони, set_goal підключити до реального сховища або прибрати тул.

Знахідок у кластері: 1.

#### [medium] Фантомний успіх: фінік, харчування й фізрук рапортують «записано», навіть коли запис нікуди не ліг; кілька тулів пишуть у ключі, яких ніхто не читає

- **ID:** `client-static/gap-ai-chat-action-executors#7` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/core/lib/hubChatActions.ts:86-117; modules/finyk/lib/sqliteWriter/chatBridge.ts:71-87,130-131,148-149; chatActions/fizrukActions/programs.ts:33-41; crossActions/goalAndUtility.ts:151-198
- **Вплив:** Той самий клас, що й QA F-12 («зробив», а даних немає), лишився для трьох модулів із чотирьох. Користувач вірить, що програму тренувань чи ціль збережено, а жоден екран її не покаже.
- **Рекомендація:** Повертати `confirm: Promise&lt;boolean&gt;` з усіх write-екзекуторів (finyk/nutrition/fizruk), як routinePersistence. У chatBridge буферизувати або журналювати замість `return`. add_program_day переписати на SQLite `fizruk_plan_templates` або програми. set_goal або підключити до реального сховища, або прибрати тул.

**Докази:**

```text
settle() waits for durability only when the handler returns `confirm`. Only routine does (routinePersistence.ts). Finyk chat mirror: `const rt = await resolveChatDualWriteRuntime(); if (!rt) return;`, so before the runtime registers, the SQLite write is silently dropped: no buffer, no journal. Unlike nutrition (pendingBeforeRegistration) or routine (retry + confirm). The kv value is then visible only to chat, never to the UI.
add_program_day writes `fizruk_plan_template_v1` (@deprecated tombstone, storageKeys.ts:272-276). grep finds no web reader. Reply: "День ... збережено".
set_goal writes `hub_goals_v1`. No reader anywhere in apps/web or packages, not synced.
```

**Відтворення:**

```text
Static; grep -rn "fizruk_plan_template_v1\|hub_goals_v1" apps/web/src packages (only chatActions writers).
```

**Верифікатор:**

```text
Only routineActions.ts returns `confirm` (grep 'confirm:' in chatActions: routine only), so settle() never waits on finyk, nutrition or fizruk writes. add_program_day writes `fizruk_plan_template_v1` through lsSet. The key is @deprecated (storageKeys.ts:272-276), and repo-wide the only other references are a re-export and constants, with no reader. set_goal writes `hub_goals_v1`, which has no reader anywhere except its own test. Only daily_kcal takes effect, via nutrition prefs; target weight and workouts/week go nowhere visible. In chatBridge `if (!rt) return;` silently drops the SQLite mirror, and its fallback comment cites a residual import that was removed in 2026-08 (sqliteReadBoot.ts:18-23). The window is narrow because HubChat registers the finyk runtime on mount, but SQLite-unavailable environments hit it. The dead-key tools make this a definite broken-feature/phantom-success issue.
```

**Додаткові докази верифікатора:**

```text
grep -rn 'PLAN_TEMPLATE_STORAGE_KEY|hub_goals' apps packages (excluding dist): only the writer, constants, re-export and test. The add_program_day audit item (2026-09-13 product-full-review §2655) covered missing result cards, not the dead storage key.
```

<a id="rel-17"></a>

### `rel-17` [medium] Розрив з'єднання не скасовує upstream-виклики LLM і Groq: req.on('close') реєструється запізно

- **Стан:** виправлено в [#1393](https://github.com/SkOrDs-02/sergeant/pull/1393) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI chat / transcribe
- **Де:** apps/server/src/modules/chat/chat.ts:205-206,409-417; apps/server/src/modules/chat/chatStream.ts:436-445; apps/server/src/modules/transcribe/transcribe.ts:146-150
- **Першопричина:** Слухач req.on('close') додається в хендлері після async middleware (requireSession, requireAiQuota). У Node 22 IncomingMessage емітить 'close' одразу після того, як тіло дочитано, тож на момент реєстрації подія вже минула і clientAbort ніколи не спрацьовує.
- **Вплив:** Закрита вкладка, кнопка «стоп», обрив мобільної мережі чи 408 оплачуються повністю, разом із до 3 continuation-викликів із повним промптом. Refund-логіка, що спирається на abort, не спрацьовує. Задокументований захист від марних витрат фактично мертвий.
- **Що зробити:** Слухати res.on('close') з перевіркою !res.writableFinished (або 'close' на req.socket) і реєструвати слухача якомога раніше. Те саме зробити в transcribe.ts. Додати інтеграційний тест з реальним HTTP-сервером, що рве сокет посеред стріму.
- **Примітка:** Верифікатор незалежно відтворив на Node 22 з express 5.2.1 з репо, у JSON-режимі й у SSE.

Знахідок у кластері: 1.

#### [medium] Скасування upstream-виклику при відключенні клієнта не працює: req.on('close') спрацьовує ще до хендлера, тож LLM/Groq дограють і тарифікуються

- **ID:** `server-static/ai-layer#2` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/chat/chat.ts:409-417; apps/server/src/modules/chat/chatStream.ts:436-445; apps/server/src/modules/chat/chat.ts:205-206; apps/server/src/modules/transcribe/transcribe.ts:146-150
- **Вплив:** Кожен розрив зʼєднання (закрита вкладка, кнопка «стоп», мобільна мережа, 408 від глобального таймауту, що робить req.destroy()) все одно оплачується повністю, включно з до 3 continuation-викликів із повним промптом. Задокументований захист від марних витрат є мертвим кодом; також refund-логіка, що спирається на abort, ніколи не задіюється.
- **Рекомендація:** Слухати `res.on('close', ...)` (з перевіркою `!res.writableFinished`) або `req.socket.on('close')`, і реєструвати слухач якомога раніше (у middleware перед async-кроками). Те саме в transcribe.ts. Додати інтеграційний тест із реальним HTTP-сервером, що розриває сокет посеред стріму і перевіряє abort upstream (поточний chat.stream.test.ts:165 прямо каже, що 'close' не емітиться).

**Докази:**

```text
chat.ts:414 `req.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });` реєструється всередині хендлера ПІСЛЯ async-middleware (requireSession робить DB-запит, requireAiQuota теж). У Node >=16 (прод: Node 22) IncomingMessage емітить 'close' одразу після того, як body-parser дочитав тіло. Мій експеримент на Node v22.22.0 з express репо (<scratch>/agents/server-static-ai-layer/reqclose2.mjs, reqclose3.mjs): `--- delay=200 disconnect=true` -> `615ms client destroy / 616ms res close (writableEnded=false) / 1717ms handler done` -- req 'close' НЕ спрацював узагалі; без затримки він спрацьовує через ~1 мс після 'end', тобто до будь-якого await. Наслідок: clientAbort ніколи не abort-иться; у стрімі умова продовження `abortSignal?.aborted || res.writableEnded` після розриву лишається false, тож continuation (до CHAT_MAX_TEXT_CONTINUATIONS=3 повних повторних викликів) іде і для клієнта, якого вже немає. transcribe.ts:148 -- той самий патерн після `await assertTranscribeUsdCap`.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-ai-layer/reqclose2.mjs (express із apps/server, Node 22): обробник з await перед req.on('close') не отримує подію при розриві сокета, res.on('close') отримує. У чаті: почати синтез зі stream:true, закрити вкладку -- upstream-стрім і його continuation-и дочитуються до кінця (видно в ai_usage_daily / $ai_generation).
```

**Верифікатор:**

```text
Відтворив незалежно на Node v22.22.0 з express 5.2.1 з репо. Форма як у проді: express.json, потім два async middleware, потім хендлер, який реєструє req.on('close') і чекає на upstream з AbortSignal. На старті хендлера req.destroyed=true і readableEnded=true, тобто 'close' уже прогримів, коли тіло дочиталось. Слухач, доданий після цього, не спрацьовує ніколи. Клієнт розриває сокет на 400 мс: res 'close' приходить, а upstream доходить до кінця, aborted=false. Так і в JSON-режимі, і в SSE. Варіант без async-middleware показує дзеркальну проблему: там 'close' спрацьовує через 1 мс після хендлера і обриває upstream одразу, тож у будь-якій конфігурації сигнал не означає «клієнт пішов». У чаті перед хендлером стоять requireSession і requireAiQuota з DB-запитами, тож clientAbort ніколи не abort-иться. У стрімі після розриву res.writableEnded лишається false, тому continuation-и до CHAT_MAX_TEXT_CONTINUATIONS продовжуються. transcribe.ts:146-150 реєструє слухача після await assertTranscribeUsdCap, той самий патерн. Глобальний таймаут робить req.destroy() уже після 'close', тому теж не допомагає. Тест chat.stream.test.ts робить on() no-op і прямо пише, що 'close' не емітиться, тож тести ць …[обрізано]
```

**Додаткові докази верифікатора:**

```text
verify-server-static-ai-layer/reqclose-v2.mjs, варіант prod-shape: handler start readableEnded=true destroyed=true; CLIENT DESTROY 414ms; res.close writableEnded=false; upstream result=completed aborted=false. Варіант sync: req.close через 3ms, upstream ABORTED до будь-якого розриву. Попередні аудити помилково записують цей механізм у сильні сторони: ai-pipeline-2026-08-05.md:839 і ai-abuse-2026-08-05.md:226.
```

<a id="rel-18"></a>

### `rel-18` [medium] Розмір входу в LLM фактично не обмежений: tool_calls_raw і кореляції коуча обходять ліміт context

- **Стан:** виправлено в [#1393](https://github.com/SkOrDs-02/sergeant/pull/1393) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI chat / coach
- **Де:** packages/shared/src/schemas/api.ts:460,491,505,554,1131-1145; apps/server/src/http/bodySizePolicy.ts:171-181; apps/server/src/modules/chat/chat.ts:617-626,734-742; apps/server/src/modules/chat/coach.ts:127,304-325
- **Першопричина:** ToolUseBlockSchema.input і ToolSearchToolResultBlockSchema.content мають тип z.unknown() без ліміту. chat.ts кладе tool_calls_raw як є в повідомлення синтезу, повз context.max(40000) і повз обрізання tool_results. CoachMemoryPostSchema приймає кореляції без меж (блоб до 5 МБ), а getCoachCorrelationsBlock без обрізання дописує їх у system кожного першого туру.
- **Вплив:** Автентифікований користувач може зробити кожен свій запит вартістю в сотні тисяч вхідних токенів замість ~40-60 тис. Квота рахує запити, а не токени, тож для Pro це пряме спалювання бюджету. Надто великий блок ламає чат цього користувача (upstream 400) до ротації дайджестів.
- **Що зробити:** Обмежити байтовий розмір input/content у ToolCallsRawBlockSchema і сумарний розмір tool_calls_raw. У CoachMemoryPostSchema додати max на довжину рядків і кількість елементів, у getCoachCorrelationsBlock обрізати кореляції. Розглянути токенний бюджет на запит.

Знахідок у кластері: 1.

#### [medium] Розмір входу в LLM фактично не обмежений: tool_calls_raw[].input і tool_search_tool_result.content -- z.unknown() до 1 MB, а кореляції coach-памʼяті (до 5 MB) без обрізання йдуть у system prompt кожного першого туру чату

- **ID:** `server-static/ai-layer#3` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `perf`
- **Де:** packages/shared/src/schemas/api.ts:460, 491, 505, 554, 1131-1145; apps/server/src/http/bodySizePolicy.ts:171-181; apps/server/src/modules/chat/chat.ts:617-626, 734-742; apps/server/src/modules/chat/coach.ts:127, 304-325
- **Вплив:** Один автентифікований користувач може зробити кожен свій запит вартістю в сотні тисяч вхідних токенів (до межі контексту моделі, gemini -- 1M) замість задуманих ~40-60k; квота рахує запити, а не токени, тож для Pro (без тижневого ліміту) і в поєднанні з обходом квитка це пряме спалювання бюджету. Якщо блок перевищить контекст моделі, чат цього користувача ламається (upstream 400) до ротації дайджестів.
- **Рекомендація:** Обмежити розмір серіалізованого `input`/`content` у ToolCallsRawBlockSchema (наприклад, 4-8 KB на блок через refine на байтах) і сумарний розмір tool_calls_raw. У CoachMemoryPostSchema додати max на кожен рядок (correlations, overallRecommendations, summary -- 300-500 символів) і кількість елементів; у getCoachCorrelationsBlock обрізати кожну кореляцію. Розглянути токенний бюджет на запит (оцінка input tokens перед upstream) замість лише лічильника запитів.

**Докази:**

```text
ToolUseBlockSchema `input: z.unknown()` (api.ts:460), ToolSearchToolResultBlockSchema `content: z.unknown()` (:505); chat.ts:619-624 кладе tool_calls_raw як є в assistant-повідомлення синтезу -- обходить і `context.max(40_000)`, і усічення tool_results до 2000 символів. Тіло /api/chat до 1mb. CoachMemoryPostSchema: `correlations: z.array(z.string())` без лімітів, /api/coach/memory приймає 6mb, MAX_BLOB_SIZE 5MB. getCoachCorrelationsBlock (coach.ts:313-324) бере до 3 кореляцій без обрізання і chat.ts:740-742 дописує їх до context (повз ліміт 40 000). Наживо: POST /api/coach/memory з кореляцією 2 160 011 символів -> `200 {"ok":true}`, GET -> `bytes 2760301 corr0 len 2160011` (скрипт <scratch>/agents/server-static-ai-layer/coachmem.mjs, юзер audit_pool76). Плюс множник: до 4 викликів на хід через continuation.
```

**Відтворення:**

```text
1) node <scratch>/agents/server-static-ai-layer/coachmem.mjs -- памʼять коуча зберігає 2.16M-символьну кореляцію. 2) Увімкнути собі healthDataConsent; кожен наступний POST /api/chat (перший тур) отримає цей блок у system. 3) Альтернатива: тур синтезу з tool_calls_raw, де input -- JSON на ~900 KB (з валідним квитком він ще й безкоштовний для квоти, див. знахідку про round_trip_ticket).
```

**Верифікатор:**

```text
Схема: ToolUseBlockSchema.input і ToolSearchToolResultBlockSchema.content мають тип z.unknown() без ліміту (api.ts:460, 505). chat.ts:617-624 кладе tool_calls_raw як є в assistant-повідомлення синтезу, повз context.max(40000) і повз обрізання tool_results. validateToolCallsRawProvenance перевіряє лише name та id, input не дивиться. CoachMemoryPostSchema: correlations - z.array(z.string()) без лімітів, коментар у схемі прямо покладається лише на MAX_BLOB_SIZE 5MB. getCoachCorrelationsBlock бере до 3 кореляцій без обрізання, і chat.ts:734-742 дописує їх у context першого туру, далі buildSystem і wrapAndScanUserContext, без жодного усічення. Наживо на своєму pool-юзері: POST /api/coach/memory з кореляцією 1 440 011 символів дав 200 ok, GET повертає corr0 len 1440011. Для порівняння, задумана стеля першого туру: sanitizeMessages обрізає до 12 повідомлень по 8000 символів плюс context 40000, тобто близько 136K символів. Кореляційний блок перевищує її на порядок. Нюанси: блок вставляється лише за healthDataConsent самого користувача, тобто це самопідсилення вартості власних запитів. Per-user USD-cap для чату немає (є лише для transcribe). Medium правомірний: квота рахує запити, а не токе …[обрізано]
```

**Додаткові докази верифікатора:**

```text
verify-server-static-ai-layer/coachmem-v2.mjs (юзер audit_pool152): POST /api/coach/memory 200 {ok:true}; GET 200 corr0 len 1440011. api.ts:1131 коментар: розмірні ліміти на окремі поля не застосовуємо. promptCache.ts:166-168 обгортає context без обрізання.
```

<a id="rel-19"></a>

### `rel-19` [medium] Фонові полери не мають першого тіку: годинні задачі зсуваються після кожного деплою, а добова звірка Plata не виконується ніколи

- **Стан:** частково виправлено в гілці claude/fix-rel-19-worker-first-tick (стартовий тік у п'яти полерах і годинний slow tick Plata за `updated_at`; lastRunAt Plata у /health/workers та алерт на застарілий lastRunAt лишились)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: background workers
- **Де:** apps/server/src/modules/billing/plataSync.ts:47,293-300; apps/server/src/modules/gdpr/cleanupPoller.ts:105-113; apps/server/src/modules/me/deletionPoller.ts:118-126; apps/server/src/modules/webhooks/retentionPoller.ts:72; apps/server/src/modules/logRetention/archivePoller.ts:175; apps/server/src/obs/anthropicBudgetGuard.ts:381; apps/server/src/index.ts:220-264
- **Першопричина:** GDPR-cleanup, добивач видалень акаунтів, retention, архів логів, budget guard і Plata роблять лише setInterval і не запускають тік на старті, на відміну від SilpoSyncPoller. Slow-tick Plata — 24-годинний таймер процесу, який скидається кожним рестартом, а деплої йдуть кілька разів на день.
- **Вплив:** Після запуску Plata не працюватиме продовження current_period_end і перехід у past_due, коли вебхук загубився: платний користувач тихо стане free, а невдале списання не потрапить у дунінг. Годинні задачі (GDPR-черга, видалення акаунтів) у дні активних деплоїв зсуваються на години. Budget guard після кожного рестарту 5 хв нічого не бачить.
- **Що зробити:** Для всіх полерів робити перший тік на старті з невеликим jitter. Plata slow-tick перевести на модель «кому вже час»: годинний тік бере рядки з last_reconciled_at &lt; now()-24h. Показувати lastRunAt Plata в /health/workers і алертити на застарілий lastRunAt.
- **Примітка:** Частина про Plata латентна, поки PLATA_ENABLED=false. Пов'язано з rel-25: друга діра в страхувальній сітці Plata.

Знахідок у кластері: 1.

#### [medium] Фонові полери стартують через setInterval без першого тіку: після кожного деплою годинні задачі (GDPR, видалення акаунтів, retention) відкладаються, а 24-годинна звірка Plata фактично не виконується ніколи

- **ID:** `server-static/reliability-ops#1` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/billing/plataSync.ts:293-300 (fast 5 хв / slow 24 год); apps/server/src/modules/gdpr/cleanupPoller.ts:105-113; apps/server/src/modules/me/deletionPoller.ts:118-126; apps/server/src/modules/webhooks/retentionPoller.ts:72; apps/server/src/modules/logRetention/archivePoller.ts:175; apps/server/src/obs/anthropicBudgetGuard.ts:381 (5 хв); запуск у apps/server/src/index.ts:220-264
- **Вплив:** Повільна звірка Plata — єдиний шлях, що продовжує `current_period_end` після успішного рекурентного списання або ставить `past_due`, коли webhook загубився (швидкий тік покриває лише непідтверджені рядки молодші за годину, plataSync.ts:226-236). Без неї платний користувач після кінця періоду тихо стає free (getUserPlan.ts:84-90), а невдале списання ніколи не потрапляє в дунінг. Зараз це латентно, бо PLATA_ENABLED=false, але проблема проявиться одразу після запуску оплат. Годинні полери (GDPR-черга, добивач видалених акаунтів, retention) в активні дні деплоїв зсуваються на години; budget guard після кожного рестарту 5 хв не бачить пробиття бюджету.
- **Рекомендація:** Зробити перший тік на старті (з невеликою затримкою або jitter, як у SilpoSyncPoller) для всіх setInterval-полерів. Для Plata slow-tick перейти на модель «кому вже час» (`last_reconciled_at &lt; NOW() - 24h` при годинному тіку), а не на 24-годинний таймер процесу. Додати `lastRunAt` для Plata у /health/workers і алерт на застарілий lastRunAt.

**Докази:**

```text
Усі ці полери роблять лише `this.timer = setInterval(() => void this.runOnce()..., this.intervalMs)` і не запускають тік на старті (порівняй з SilpoSyncPoller, syncScheduler.ts:21-25,108-119, який прямо пише «контейнер рестартує на кожен деплой» і робить перший тік через 5 хв). Plata: `SLOW_TICK_MS = 24*60*60*1000` (plataSync.ts:47), а `slowTimer = setInterval(..., this.slowTickMs)` (297-300). Живий сервер: `GET /health/workers` о 23:13Z, процес стартував о 22:34:27Z (server_listening у логу) -> `"gdprCleanup":{"enabled":true,"intervalMs":3600000,"lastRunAt":null}`, `"accountDeletion":{..."lastRunAt":null}`. Каденс деплоїв бекенду (коміти в main, що зачіпають apps/server/packages): 2026-10-01 15:58, 17:00, 18:10, 20:36, 21:40, 22:38... тобто проміжки близько години. ENTRYPOINT перезапускає процес на кожному деплої (Dockerfile.api:321).
```

**Відтворення:**

```text
1) Перезапусти API. 2) `GET /health/workers` через 30-50 хв: `lastRunAt: null` у gdprCleanup/accountDeletion. 3) Для Plata: при PLATA_ENABLED=true і хоча б одному деплої на добу `runSlowTick` не виконається жодного разу, бо таймер на 24 год скидається кожним рестартом.
```

**Верифікатор:**

```text
Перевірено в коді: GdprCleanupPoller (cleanupPoller.ts:105), AccountDeletionPoller (deletionPoller.ts:118), WebhookEventsRetentionPoller (retentionPoller.ts:72), LogArchivePoller (archivePoller.ts:175), AnthropicBudgetGuard (anthropicBudgetGuard.ts:381) і PlataSyncPoller (plataSync.ts:293-300) роблять лише setInterval, без тіку на старті. Дефолти з env.ts:606-659: 1 год для годинних полерів, 5 хв для budget guard; SLOW_TICK_MS = 24 год (plataSync.ts:47). runSlowTick ніхто інший не викликає (grep: лише runSlow із slowTimer), тож за деплою хоча б раз на добу (git log: кілька комітів у apps/server на день, ENTRYPOINT перезапускає процес) повільна звірка Plata не виконується ніколи. Поруч SilpoSyncPoller (syncScheduler.ts:21-25) прямо описує цю проблему рестартів і вирішує її моделлю «кому вже час», тобто для решти полерів це не свідомий вибір. Жодного ADR чи коментаря, який приймав би таку поведінку, немає (ADR-0089 про рестарти мовчить). Серйозність лишаю medium: шлях Plata зараз латентний (PLATA_ENABLED=false), а вебхук лишається основним шляхом продовження, проте після запуску оплат резервна звірка мертва за побудовою. Годинні полери (GDPR, видалення акаунтів) лише зсуваються на го …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Живий сервер: у логу server_listening та *_poller_started о 2026-10-02T01:25:55Z, а GET /health/workers о 02:00:18Z (через 34 хв) повертає gdprCleanup.lastRunAt=null і accountDeletion.lastRunAt=null (скрипт verify-server-static-reliability-ops/health.mjs). Порівняння: syncScheduler.ts:56-58 DEFAULT_START_DELAY_MS=5 хв плюс beginTicking() робить негайний tick; у шапці plataSync.ts:23-25 сказано, що він повторює патерн «той самий, що GdprCleanupPoller / SilpoSyncPoller», але модель «кому вже час» звідти не взято.
```

<a id="rel-20"></a>

### `rel-20` [medium] Імпорт виписки чи скріна падає з 500 на весь файл через один рядок поза межами схеми відповіді

- **Стан:** виправлено в #1372 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: Фінік import
- **Де:** apps/server/src/modules/finyk/import/statementPreview.ts:101-125,239-248; apps/server/src/modules/finyk/import/screenshotAnalyze.ts:35-39,87-89,119-140,315-319; packages/shared/src/schemas/import.ts:242-250; packages/shared/src/schemas/bounds.ts:15
- **Першопричина:** classifyRows і normalizeImportScreenshotResult не обрізають description і bank та не відсіюють рядки, де сума чи дата поза межами. Хендлери валідують усю відповідь через Schema.parse, тож ZodError одного рядка стає 500 INTERNAL. receipts/analyze.ts для порівняння обрізає поля й клампить суми.
- **Вплив:** Виписка ФОП чи рахунку з «призначенням платежу» понад 300 символів або сумою понад 10 млн грн не імпортується взагалі, і людина бачить «Server error» без пояснення. Галюцинація року в скріні обнуляє весь розпізнаний драфт. Окремо: дробовий amount_kopiykas (модель прочитала гривні) мовчки округлюється до копійок, а валюта «грн» відкидається як не-UAH.
- **Що зробити:** Обрізати текстові поля до лімітів схеми, а рядки із сумою чи датою поза діапазоном класти в skipped або dropped із причиною. Нецілі копійки вважати непридатними. Для валюти використати isUahCurrencyValue.
- **Примітка:** Шлях скріна перевірено на чистій функції й схемі, бо LLM локально не налаштований.

Знахідок у кластері: 2.

#### [medium] Превʼю виписки падає з 500 на весь файл, якщо в одному рядку опис довший за 300 символів або сума понад 10 млн грн

- **ID:** `server-static/gap-finyk-import-receipts-correctness#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Де:** apps/server/src/modules/finyk/import/statementPreview.ts:101,116-118,239-248; packages/shared/src/schemas/import.ts:242-250; packages/shared/src/schemas/bounds.ts:15
- **Вплив:** Виписка ФОП чи рахунку з довгим «призначенням платежу» (банк дозволяє до 420 символів) не імпортується взагалі, і людина бачить загальну «Server error» без пояснення.
- **Рекомендація:** У classifyRows обрізати description до 300 символів, а рядок із сумою понад AMOUNT_MINOR_MAX класти в skipped (нова причина або unparsed_amount), а не валити відповідь. Те саме для screenshotAnalyze.

**Докази:**

```text
Privat24-CSV, де один рядок має «Опис операції» з 396 символів, дав 500 {"code":"INTERNAL"}. У лозі сервера: ZodError too_big maximum 300 path [rows,0,description] at statementPreviewHandler (statementPreview.ts:240). Рядок із сумою -12000000.00 теж дав 500 (amountKopiykas > AMOUNT_MINOR_MAX). classifyRows не обрізає опис і не перевіряє стелю суми, тож усю відповідь валить фінальний `ImportStatementPreviewResponseSchema.parse`.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/preview1.mjs (кейси long-desc-privat, huge-amount)
```

**Верифікатор:**

```text
Відтворено. classifyRows (statementPreview.ts:101-125) не обрізає description і не перевіряє стелю суми. Фінальний ImportStatementPreviewResponseSchema.parse (:240) кидає ZodError, і весь файл отримує 500 INTERNAL. Стеля: AMOUNT_MINOR_MAX = 1e9 (рівно 10 млн проходить, 12 млн падає), опис обмежено max(300) (import.ts:246). Commit-схема ті ж межі має, але туди рядок не доходить. Опис понад 300 символів реалістичний для виписок рахунків і довільних CSV з «призначенням платежу». Сума понад 10 млн трапляється рідко.
```

**Додаткові докази верифікатора:**

```text
preview.mjs: Privat24 з описом у 396 символів → 500 {"code":"INTERNAL"}. У лозі: ZodError too_big maximum 300 path [rows,0,description] at statementPreviewHandler (statementPreview.ts:240:44). mono-CSV з описом у 301 символ → 500. Рядок -12000000.00 → 500, у лозі too_big maximum 1000000000 path [rows,0,amountKopiykas]. -10000000.00 → 200.
```

#### [low] Нормалізатор скріна не обмежує поля: один «кривий» рядок від LLM дає 500 на весь аналіз, а дробові копійки мовчки округлюються

- **ID:** `server-static/gap-finyk-import-receipts-correctness#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/modules/finyk/import/screenshotAnalyze.ts:35-39,87-89,119-140,315-319
- **Вплив:** Довгий список на скріні або галюцинація року обнуляє весь розпізнаний драфт із «Server error». Сума, яку модель прочитала в гривнях, тихо зменшується в 100 разів.
- **Рекомендація:** Робити як receipts/analyze.ts: обрізати description і bank до лімітів схеми; рядок поза діапазоном дати чи суми рахувати як dropped.unreadable; нецілий amount_kopiykas вважати непридатним (або гривнями з помітно нижчою confidence); для валюти використати isUahCurrencyValue.

**Докази:**

```text
Прогін normalizeImportScreenshotResult і ImportScreenshotAnalyzeResponseSchema.safeParse на рядках від LLM: date "2206-08-16" дає schemaOk:false «Дата поза допустимим діапазоном»; description з 301 символу дає false; amount_kopiykas 2e9 дає false; bank з 121 символу дає false. У handler-і схема викликається через .parse (:315), тобто 500 на весь скрін. На відміну від нього, receipts/analyze.ts обрізає store і name до лімітів і клампить суми. Окремо: amount_kopiykas 95.5 (модель повернула гривні) стає 96 копійками без сигналу (:35-39), а currency "грн" потрапляє в dropped.nonUah (:119-127), хоча CSV-шлях вважає «грн» гривнею (csvProfiles.ts:332-335).
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/shot.ts (LLM локально не налаштований, перевірено на чистій функції та схемі)
```

**Верифікатор:**

```text
Підтверджено на чистій функції і схемі (LLM локально не налаштований). normalizeImportScreenshotResult не обрізає description і bank і не відкидає рядки поза межами дати чи суми, а handler викликає ImportScreenshotAnalyzeResponseSchema.parse (:315). Один кривий рядок дає ZodError і 500 на весь скрін, хоча власний докблок функції (:63-68) обіцяє «безпечний дефолт, а не throw». receipts/analyze.ts обрізає store і name та клампить суми. Дробовий amount_kopiykas 95.5 мовчки стає 96. Severity знижено до low: промпт прямо вимагає ціле число копійок і код "UAH" для ₴/грн (prompts.ts:35-56), тож «грн» і дробові суми означають непослух моделі, а описи на мобільних скрінах короткі. Тригери рідкісні, хоча дефект реальний.
```

**Додаткові докази верифікатора:**

```text
cd apps/server && node --import tsx <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/shot.ts: yearOutOfRange (2206) → schemaOk:false; longDesc 301 → false; hugeAmount 2e9 → false; bank 121 символ → false; hryvniaFloat 95.5 → amountKopiykas 96, schemaOk:true; currency 'грн' → dropped.nonUah:1.
```

<a id="rel-21"></a>

### `rel-21` [medium] Пошук їжі: збій Open Food Facts чи USDA видається за «нічого не знайдено» і публічно кешується до 10 хв

- **Стан:** виправлено в гілці claude/fix-rel-21-22-23-food-search-silpo
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: nutrition food-search / barcode
- **Де:** apps/server/src/modules/nutrition/food-search.ts:110,130,218-224; apps/server/src/routes/food-search.ts; apps/server/src/routes/barcode.ts
- **Першопричина:** fetchOFF і fetchUSDA на !r.ok повертають [], а виклики обгорнуті в .catch(() =&gt; []), тож таймаут чи 503 не відрізнити від порожнього результату. cachingMiddleware стоїть перед лімітером і хендлером і безумовно ставить public, max-age=300, stale-while-revalidate=300, зокрема на 4xx і 5xx barcode.
- **Вплив:** Поки OFF лежить (під час аудиту він віддавав 503), продукт, якого немає в локальному каталозі, «не знаходиться». Людина заводить його вручну або вирішує, що пошук зламаний, а відповідь «спробуй за хвилину» живе в кеші до 10 хв. Збою ніхто не бачить: немає ні метрики апстріму, ні логу.
- **Що зробити:** Зробити як у barcode (G5): якщо всі апстріми впали і власних результатів немає, повертати 503 з окремим кодом і no-store. Кешувати лише 2xx. Записувати recordExternalHttp для OFF і USDA search.

Знахідок у кластері: 1.

#### [medium] Пошук їжі: збій Open Food Facts / USDA мовчки стає «нічого не знайдено» (200 []), і ця відповідь публічно кешується до 10 хв

- **ID:** `api-live/ai-billing-integrations-live#5` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/nutrition/food-search.ts:110, :130 (`if (!r.ok) return []`), :218-224 (`.catch(() =&gt; [])`); apps/server/src/routes/food-search.ts і barcode.ts (cachingMiddleware stale-while-revalidate ставиться ДО лімітера і хендлера)
- **Вплив:** Поки OFF лежить (просто зараз він віддає 503 на пошук), будь-який запит, якого немає в generic_foods/product_catalog, показує користувачу «нічого не знайдено», хоча продукт у базі є. Користувач заводить продукт вручну або вважає пошук зламаним. Порожня відповідь кешується публічно, а операційно збій ніде не видно.
- **Рекомендація:** Повторити підхід G5 з barcode: якщо всі апстріми впали або не-ok і власних результатів немає, віддавати 503 з окремим кодом і без публічного кешу. Записувати recordExternalHttp для OFF/USDA search. cachingMiddleware застосовувати лише до 2xx (наприклад, ставити заголовок у хендлері перед res.json на успіху), а для 4xx/5xx/429 ставити no-store.

**Докази:**

```text
Анонімний GET /api/food-search?q=apple -> 200 за 1795 мс, Cache-Control: public, max-age=300, stale-while-revalidate=300, тіло {"products":[]}. Причина: прямий запит https://world.openfoodfacts.org/api/v2/search?search_terms=apple... -> 503 "Page temporarily unavailable - Open Food Facts". У /metrics для food-search немає жодної метрики апстріму (external_http_requests_total має лише off/usda/upcitemdb від barcode), а в логах жодного запису: збій невидимий. Для порівняння, /api/barcode розрізняє ці стани (G5: 503 «Бази продуктів зараз не відповідають»), але його 503/429/400 відповіді теж мають `public, max-age=300, stale-while-revalidate=300` (спостерігалось на 400 і 404), тож «спробуй за хвилину» браузер/CDN можуть віддавати з кешу до 10 хв.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p3_food.mjs і off.mjs
```

**Верифікатор:**

```text
Код підтверджено. fetchOFF і fetchUSDA на !r.ok повертають [] (food-search.ts:110, :130), а кожен виклик обгорнутий у .catch(() => []) (:218-224), тому таймаут чи 503 апстріму неможливо відрізнити від «нічого не знайдено». Відповідь — 200 {products:[]}, і recordExternalHttp для search ніде не викликається. Пов'язаний аудит G5 стверджує «food-search 504», але гілки 504 в цьому хендлері немає. cachingMiddleware(stale-while-revalidate) стоїть у роутері ДО лімітера й хендлера і безумовно ставить `public, max-age=300, stale-while-revalidate=300` на будь-який статус. Живий прогін: OFF /api/v2/search зараз віддає 503 напряму, а GET /api/food-search?q=apple -> 200 {"products":[]} за 126 мс із публічним Cache-Control. Для /api/barcode статуси 400 і 404 теж отримують публічний кеш (спостережено). 503-гілка barcode Cache-Control не перевизначає (видно з коду). Service worker кешує лише 200, тож порожня 200 потрапляє і туди, але використовується лише в NetworkFirst-режимі офлайн. Severity medium лишаю: це тихий збій на час аутейджу, і OFF search падає часто.
```

**Додаткові докази верифікатора:**

```text
x5_food.mjs: /api/food-search?q=apple 200 126ms `public, max-age=300, stale-while-revalidate=300` {"products":[]}; OFF direct api/v2/search -> 503; /api/barcode?barcode=abc 400 і ?barcode=99999999999999 404 — обидва з `public, max-age=300, stale-while-revalidate=300`. cacheMiddleware.ts:71-80 ставить заголовок безумовно.
```

<a id="rel-22"></a>

### `rel-22` [medium] Пошук їжі для підключених до Сільпо: гілка Сільпо без дедлайну і з 12-18 HTTP-запитами на кожне натискання

- **Стан:** частково виправлено в гілці claude/fix-rel-21-22-23-food-search-silpo (лишилось: кеш initialize-сесії, серверний кеш per user+query, мінімальна довжина запиту, 429 у breaker і Retry-After, ліміт розміру тіла MCP-відповіді)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: Сільпо MCP / food-search
- **Де:** apps/server/src/modules/nutrition/food-search.ts:146,214-234; apps/server/src/modules/silpo/foodSource.ts:464-518; apps/server/src/modules/silpo/mcpClient.ts:96-98,178-211,255-330,408-436
- **Першопричина:** AbortSignal.timeout(8000) передається лише в OFF і USDA, а searchSilpoProducts стоїть у тому самому Promise.all без сигналу. Кожен callMcpTool робить initialize, notifications/initialized і tools/call з власними ретраями по 15 с, і етапи йдуть послідовно. 429 не відкриває breaker, Retry-After ігнорується, розмір відповіді не обмежено.
- **Вплив:** Коли Сільпо повільний, typeahead висить до 120 с (requestTimeout) замість 8, хоча OFF і USDA давно відповіли. Один активний користувач робить сотні запитів на хвилину до спільного DCR client_id. Це загрожує throttle чи баном від Сільпо і відкритим breaker-ом для синку чеків і кошика всіх людей.
- **Що зробити:** Поставити на гілку Сільпо той самий дедлайн, з AbortSignal аж до postJsonRpc. Кешувати initialize-сесію, додати серверний кеш per user+query і мінімальну довжину запиту. Рахувати 429 у breaker, поважати Retry-After і обмежити розмір тіла MCP-відповіді.
- **Примітка:** Перевірено з підміненим fetch, бо локально SILPO_ENABLED=false.

Знахідок у кластері: 1.

#### [medium] Пошук їжі для підключеного до Сільпо користувача: гілка Сільпо не обмежена 8-секундним таймаутом і робить 12-18 HTTP-запитів до спільного client_id на кожне натискання клавіші

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `perf`
- **Де:** apps/server/src/modules/nutrition/food-search.ts:146, :214-234; apps/server/src/modules/silpo/foodSource.ts:464-518; apps/server/src/modules/silpo/mcpClient.ts:96-98, :178-211, :255-330, :408-436
- **Вплив:** Коли Сільпо повільний, typeahead у щоденнику підключеної людини висить до 120 с замість 8, хоча OFF і USDA давно відповіли. Один активний користувач створює сотні запитів на хвилину до спільного DCR client_id. Так недовго до throttle чи бану від Сільпо, а з ним і відкритого breaker-а для синку чеків і кошика всіх людей.
- **Рекомендація:** Обгорнути searchSilpoProducts у той самий дедлайн (Promise.race з таймаутом, AbortSignal аж до postJsonRpc). Кешувати initialize-сесію або хоча б не слати notifications/initialized на кожну тулу. Додати серверний кеш результатів Сільпо per user+query і debounce/мінімальну довжину запиту для гілки Сільпо. Рахувати 429 у breaker і поважати Retry-After. Обмежити розмір тіла відповіді MCP.

**Докази:**

```text
`signal = AbortSignal.timeout(8000)` передається лише в fetchOFF/fetchUSDA, а Promise.all чекає searchSilpoProducts без сигналу. Кожен callMcpTool складається з initialize (до 3 спроб по 15 с), notifications/initialized (до 15 с) і tools/call (до 3x15 с), тобто ~105 с на тулу. Batch і деталі йдуть послідовно, тож запит упирається в 120-секундний requestTimeout (408). Підрахунок з підміненим fetch (<scratch>/.../silpo-fanout.mts): `cold branch ctx: HTTP requests 18 {initialize:6, notifications/initialized:6, ...find_products_batch:1, get_product_details:3}`, `warm: HTTP requests 12`. Відповідь має `private, no-store`, а ліміт 40/хв, тобто до ~480 запитів на хв від одного користувача. 429 не відкриває breaker (`rate_limited` не викликає onBreakerFailure), Retry-After ігнорується, розмір відповіді не обмежено (`await response.text()`).
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/server && node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/silpo-fanout.mts
```

**Верифікатор:**

```text
food-search.ts:146 створює `AbortSignal.timeout(8000)` (NUTRITION_AI_TIMEOUTS_MS.foodSearch) і передає його лише в fetchOFF/fetchUSDA. searchSilpoProducts стоїть у тому самому Promise.all без сигналу, тож відповідь чекає на Сільпо. Кожен callMcpTool це initialize (mcpRpcCall: 3 спроби по 15 с), потім notifications/initialized (до 15 с), потім tools/call (3 по 15 с). Етапи cart ref -> cart by id -> batch -> details йдуть послідовно. Я запустив silpo-fanout.mts: cold 18 HTTP-запитів (initialize:6, notifications/initialized:6 ...), warm 12. 429 не викликає onBreakerFailure, тож breaker на ньому не відкривається, а Retry-After ігнорується. Частина тверджень перебільшена. Клієнт дебаунсить зовнішній пошук на 600 мс (useFoodSearch.ts OFF_DEBOUNCE_MS), тож це не «кожне натискання клавіші». Крім ліміту 40/хв діє ще добовий 600/добу. Гілка Сільпо запускається лише тоді, коли generic+catalog не заповнили limit, і лише для підключених. Головна вада все одно справжня: для підключеного користувача кожен пошук чекає 9-12 послідовних RTT до Сільпо, а при повільному Сільпо чекає десятки секунд, хоча OFF і USDA давно відповіли. Шкода в тому, що деградує основний флоу логування їжі для бета-тестерів …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Вивід silpo-fanout.mts: `cold branch ctx: products 3 HTTP requests 18 {"initialize":6,"notifications/initialized":6,...,"tools/call:silpo_get_product_details":3}`; `warm branch ctx: HTTP requests 12`; `429 from Silpo: 3 keystrokes -> HTTP requests 9 (breaker never opens on 429)`. routes/food-search.ts: ліміти 40/хв і 600/добу. Клієнт: useFoodSearch.ts:15 `OFF_DEBOUNCE_MS = 600`.
```

<a id="rel-23"></a>

### `rel-23` [medium] Здорове підключення Сільпо переводиться в reauth_required через хибну класифікацію помилок

- **Стан:** виправлено в гілці claude/fix-rel-21-22-23-food-search-silpo (повтор refresh з backoff свідомо не додано)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: Сільпо OAuth/MCP
- **Де:** apps/server/src/modules/silpo/mcpClient.ts:475-488,554-558; apps/server/src/modules/silpo/tokenStore.ts:382-422,524-555; apps/server/src/modules/silpo/oauth.ts:58-101,281-320
- **Першопричина:** looksLikeAuthRefusal застосовує регекс /unauthor|...|401|403|token|expired|сесі|авториз|токен/i до будь-якого тексту isError, тож бізнес-відмови на кшталт «Товар 3401567 відсутній» чи «Promo period expired» стають auth_required. Якщо відмова повторюється після refresh, ставиться reauth_required. performRefresh так само ловить будь-який виняток (таймаут, 5xx, 429, збій discovery чи БД) і безумовно викликає markReauthRequired, без retry.
- **Вплив:** Людина бачить «Перепідключіть Сільпо», фоновий полер її пропускає, і Сільпо зникає з пошуку їжі. Кожен хибний збіг спалює refresh-грант. Короткий аутейдж OAuth Сільпо чи відмова з таким словом у тексті за один тік полера розлогінює всіх підключених.
- **Що зробити:** Виводити auth_required лише з HTTP 401 або явного машинного коду. На refresh розрізняти invalid_grant/invalid_client, де справді потрібен reauth_required, і транзієнтні збої: для них повертати upstream_unavailable без зміни статусу, з 1-2 повторами і backoff. Повторну відмову після refresh повертати як tool_error.
- **Примітка:** Обидва шляхи перевірено з підміненим fetch (silpo-auth.mts, блоки A, B і D).

Знахідок у кластері: 2.

#### [medium] Евристика looksLikeAuthRefusal трактує бізнес-відмову тули Сільпо як протухлий токен: зайвий refresh, повтор і позначка reauth_required для здорового підключення

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#2` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/silpo/mcpClient.ts:475-488, :554-558; apps/server/src/modules/silpo/tokenStore.ts:524-555
- **Вплив:** Достатньо, щоб у тексті відмови були число з «401»/«403» (id товару, кількість) або слова expired/token/сесія, і /cart/apply, preview чи синк ротують refresh-токен, повторюють запит і переводять підключення в reauth_required. Людина бачить «Перепідключіть Сільпо», фоновий полер її пропускає (status='connected'), Сільпо зникає з пошуку їжі. Якщо в загальному інциденті Сільпо віддасть відмову з таким словом, один тік полера розлогінить усіх підключених.
- **Рекомендація:** Не виводити auth_required з вільного тексту: це сигнал HTTP 401 або явний машинний код. Якщо евристику лишити, звузити її до цілих слів (\bunauthorized\b, «токен недійсний») і без цифр. Головне: після refresh повторна відмова тим самим текстом не має ставити reauth_required, її слід повертати як tool_error.

**Докази:**

```text
Regex `/unauthor|unauthenticat|forbidden|401|403|token|expired|сесі|авториз|токен/i` застосовується до будь-якого тексту isError. Перевірка (<scratch>/.../silpo-auth.mts, підмінений fetch): `"Товар 3401567 відсутній у філії" -> kind=auth_required`, так само "Promo period expired", "Сесію кошика не знайдено", "Coupon token invalid", "Quantity 403 exceeds max". Повний шлях callWithFreshAccessToken: `B result: {"kind":"reauth_required","message":"Silpo access denied twice after refresh"}`, `connection status after: reauth_required`, і за один виклик спалено refresh-грант (POST /token).
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/server && node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/silpo-auth.mts (блоки A/B)
```

**Верифікатор:**

```text
mcpClient.ts:554-558 перетворює будь-який текст isError, що збігається з regex `/unauthor|unauthenticat|forbidden|401|403|token|expired|сесі|авториз|токен/i`, на auth_required. callWithFreshAccessToken (tokenStore.ts:524-555) тоді робить refresh (ротує refresh-токен) і повторює виклик. Якщо бізнес-відмова повторюється з тим самим текстом, викликається markReauthRequired. Докстрінг евристики стверджує, що хибний збіг «коштує зайвого refresh-у (дешево, ідемпотентно)», але насправді він ще й переводить здорове підключення в reauth_required. Тобто задокументований компроміс розходиться з кодом. Я запустив silpo-auth.mts: блок A класифікує 'Товар 3401567 відсутній у філії', 'Promo period expired', 'Сесію кошика не знайдено', 'Coupon token invalid' і 'Quantity 403 exceeds max' як auth_required. Блок B: `reauth_required ... Silpo access denied twice after refresh`, статус після виклику reauth_required, 1 POST /token. Сільпо живе в проді для бета-тестерів (спека: «перший тиждень у проді 2026-08-25»). Medium лишаю: шанс тригера залежить від реальних текстів відмов Сільпо, але слова «сесія», «expired» і числові id у відмовах цілком правдоподібні, а наслідок (примусове перепідключення, Сільпо …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Вивід silpo-auth.mts: `A2 refusal "Сесію кошика не знайдено" -> kind=auth_required`; `B result: {"ok":false,"error":{"kind":"reauth_required","message":"Silpo access denied twice after refresh"}}`, `B connection status after: reauth_required`, `B HTTP calls: 8 [ '.../token grant_type=refresh_token... -> 200' ]`. Коментар над looksLikeAuthRefusal: «хибний збіг коштує зайвого refresh-у (дешево, ідемпотентно)», хоча фактичний наслідок markReauthRequired.
```

#### [low] Будь-який тимчасовий збій token-ендпоінта чи metadata Сільпо під час refresh назавжди переводить підключення в reauth_required

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#3` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/modules/silpo/tokenStore.ts:382-422 (catch -&gt; markReauthRequired), apps/server/src/modules/silpo/oauth.ts:281-320, :58-101
- **Вплив:** Коли access-токен протух (~раз на 30 днів), секундна недоступність OAuth Сільпо, rate-limit або збій БД між обміном і записом залишає людині ручне перепідключення OAuth. Під час аутейджу OAuth Сільпо полер (syncAll) розлогінює кожного, кому випав refresh.
- **Рекомендація:** Розрізняти invalid_grant/invalid_client (400/401 від token endpoint), де справді потрібен reauth_required, і транзієнтні збої (мережа, таймаут, 5xx, 429), де слід повернути upstream_unavailable без зміни статусу. Додати 1-2 повтори з backoff саме на refresh.

**Докази:**

```text
performRefresh ловить БУДЬ-ЯКУ помилку oauthRefreshTokens: таймаут 15 с, мережу, 5xx, 429, збій discovery, помилку persistTokens. Після reread викликається markReauthRequired. Перевірка (silpo-auth.mts, блок D): token endpoint повертає 503 -> `D result: {"kind":"reauth_required","message":"Silpo refresh token exchange failed"} status after: reauth_required`. Retry чи backoff на refresh немає.
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/silpo-auth.mts (блок D)
```

**Верифікатор:**

```text
performRefresh (tokenStore.ts:382-422) ловить будь-який виняток oauthRefreshTokens/persistTokens. Після rereadAfterFailedRefresh (вона рятує лише випадок, коли токен ротовано деінде) безумовно викликається markReauthRequired. postTokenRequest і discoverOAuthMetadata (oauth.ts) кидають той самий generic Error на 5xx, 429, мережеву помилку, abort і збій discovery. Розрізнення invalid_grant і транзієнтних збоїв немає, retry теж немає. Блок D silpo-auth.mts: token endpoint 503 -> `reauth_required ... Silpo refresh token exchange failed`, status after: reauth_required. Severity знижую до low. Шкода настає лише тоді, коли транзієнтний збій OAuth Сільпо збігається з моментом refresh (протух access-токен), а це рідко. Для таймауту й збою persistTokens після успішного обміну reauth якраз може бути правильним, бо Сільпо ротує refresh-токен і старий уже спалено. Явно помилкова поведінка лише для 5xx/429/discovery/мережі до відправки. Наслідок обмежується одним кліком перепідключення, дані не втрачаються.
```

**Додаткові докази верифікатора:**

```text
Вивід silpo-auth.mts: `D result: {"ok":false,"error":{"kind":"reauth_required","message":"Silpo refresh token exchange failed"}} status after: reauth_required`. oauth.ts:296 `throw new Error(`Silpo OAuth token request failed: HTTP ${res.status}`)` кидає той самий клас помилки на будь-який non-2xx.
```

<a id="rel-24"></a>

### `rel-24` [medium] Вебхук Monobank не відповідає 200 на GET-валідацію URL

- **Стан:** виправлено в #1372 (змерджено 2026-10-03)
- **Перевірка:** спірне · **Зусилля:** S · **Швидкий виграш** · **Область:** server: Monobank webhook
- **Де:** apps/server/src/routes/mono-webhook.ts:61-62; apps/server/src/modules/mono/connection.ts:152-190,204-215
- **Першопричина:** routes/mono-webhook.ts реєструє лише POST. Прод працює в режимі API-only (servesFrontend=false), тож GET і HEAD на /api/mono/webhook/&lt;secret&gt; дають Express-404. Документація Monobank для POST /personal/webhook вимагає, щоб валідаційний GET отримав строго 200.
- **Вплив:** Якщо Monobank застосовує цю перевірку, нові підключення падають з 502 MONO_UPSTREAM_ERROR або вебхук не активується, і транзакції в реальному часі не надходять. Дані не губляться: backfill і refresh тягнуть 31 день, а банер давності попереджає.
- **Що зробити:** Додати r.get на /api/mono/webhook і /api/mono/webhook/:secret, що віддає 200 без перевірки секрету й без побічних ефектів: хеш секрету потрапляє в БД лише після реєстрації. Додати інтеграційний тест GET→200 і звірити з продом mono_webhook_received_total та last_event_at.
- **Примітка:** Спірно: фіндер ставив high, верифікатор low, скептик medium. Я перевірив код на HEAD: GET-обробника немає, connect кидає MONO_UPSTREAM_ERROR на будь-яку не-2xx відповідь Monobank. Проти: після квітневого cutover прод-смоук connect пройшов (monobank-roadmap.md:71), а в серпні вебхуки доставлялись у бекенд, який, імовірно, вже був API-only (міграція 119). За: дока Monobank і OSS-SDK явно вимагають GET 200, а історії git до 2026-09-14 в репо немає, тож чи існував тоді GET-обробник, не встановити. Без живого токена Monobank питання не закрити, а фікс дешевий.

Знахідок у кластері: 2.

#### [low] Немає GET-обробника для валідації webhook-URL Monobank

- **ID:** `server-static/webhooks-billing-quota#14` · **Вердикт:** сумнівно · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/mono-webhook.ts:61-62
- **Вплив:** Якщо Monobank застосовує GET-валідацію (як сказано в його доках), реєстрація вебхука в /api/mono/connect і ротація секрету можуть давати помилку або вебхук не активується; коментарі в коді натякають, що доставки в проді йдуть, тож це потребує перевірки.
- **Рекомендація:** Додати `r.get("/api/mono/webhook/:secret", (_req,res)=&gt;res.sendStatus(200))` (без DB-lookup, бо хеш ще не збережено на момент реєстрації) і тест; звірити з живою реєстрацією.

**Докази:**

```text
Зареєстровано лише `r.post("/api/mono/webhook", ...)` і `r.post("/api/mono/webhook/:secret", ...)`. Живий прогін: `GET /api/mono/webhook/<64 hex>` → 404 HTML «Cannot GET /api/mono/webhook/…». Документація /personal/webhook Monobank: на URL надсилається GET, і сервер має відповісти саме 200.
```

**Відтворення:**

```text
probe1.mjs рядок 'GET mono webhook/<sec>' → 404.
```

**Верифікатор:**

```text
Код і живий прогін підтверджують, що GET-обробника немає. `routes/mono-webhook.ts:61-62` реєструє лише POST, а `GET /api/mono/webhook/<64 hex>` і `GET /api/mono/webhook` дають 404 з HTML «Cannot GET» (r2.mjs). SPA-fallback у проді цього не рятує: `config.servesFrontend` завжди false (`http/security.ts:47-49`). Офіційна документація Monobank для `POST /personal/webhook`, за сніпетом пошуку зі сторінки monobank.ua/en/api-docs/.../post--personal--webhook, справді вимагає: «на неї буде надіслано GET-запит. Сервер має відповісти строго HTTP статус-кодом 200». Проте канон Фініка (`docs/product/modules/finyk.md:566`) пише, що Monobank webhook у проді «працює», а коментарі в `webhook.ts` описують реальні доставки й деактивацію вебхука після 500. Отже, Monobank або не застосовує GET-валідацію суворо, або проблема ще не проявилась. Підтвердити вплив на прод без живого підключення Monobank неможливо.
```

**Додаткові докази верифікатора:**

```text
connectHandler (`connection.ts:155-190`) кидає 502 MONO_UPSTREAM_ERROR, якщо `/personal/webhook` відповідає не-2xx. Якби валідація валила реєстрацію, підключення банку в проді падало б для всіх, а це суперечить канону. Перевірити варто логом `mono_webhook_register_failed` у проді. Не трекається.
```

#### [low] Вебхук Monobank не відповідає на GET-валідацію URL: GET /api/mono/webhook/&lt;secret&gt; віддає 404, а Monobank вимагає строго 200

- **ID:** `api-live/ai-billing-integrations-live#1` · **Вердикт:** сумнівно · **Лейн:** Живе API · **Категорія:** `reliability`
- **Серйозність від шукача:** high
- **Де:** apps/server/src/routes/mono-webhook.ts:61-62 (є лише r.post); apps/server/src/modules/mono/connection.ts:153-190 (реєстрація webHookUrl) і :204 (INSERT mono_connection уже ПІСЛЯ реєстрації)
- **Вплив:** Якщо Monobank досі валідує webHookUrl GET-запитом (так стверджує його документація), підключення Monobank або падає на кроці реєстрації вебхука (502 MONO_UPSTREAM_ERROR), або вебхук не активується і транзакції в реальному часі ніколи не надходять. Це ключова інтеграція Фініка (Track A).
- **Рекомендація:** Додати `r.get("/api/mono/webhook/:secret?", (_req,res)=&gt;res.sendStatus(200))` (і HEAD) без перевірки секрету та без побічних ефектів; додати інтеграційний тест на GET-&gt;200. Звірити з продом метрику mono_webhook_received_total і last_event_at у mono_connection, щоб підтвердити, чи вебхуки взагалі приходять.

**Докази:**

```text
Живий запит: GET /api/mono/webhook/0123456789abcdef -> 404 text/html "<pre>Cannot GET /api/mono/webhook/..."; HEAD /api/mono/webhook/0123 -> 404; GET /api/v1/mono/webhook/abc -> 404. У роутері є тільки `r.post("/api/mono/webhook")` та `r.post("/api/mono/webhook/:secret")`. Документація Monobank для POST /personal/webhook (monobank.ua/en/api-docs/monobank/kliientski-personalni-dani/post--personal--webhook): "To confirm the correctness of the provided address, a GET request is sent to it. The server must respond strictly with HTTP status code 200, and no other." Go-SDK go-monobank-sdk/webhook прямо пише: "GET /your-path returns 200. Mono pings the URL with a GET on subscription to verify that it is alive." Окрім того, connectHandler реєструє URL у Monobank (рядок 157) ДО того, як hash секрету записується в mono_connection (рядок 204), тож навіть GET-хендлер із перевіркою секрету не пройшов би валідацію.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p13_404.mjs (GET/HEAD на /api/mono/webhook/<будь-що>). Повний сценарій: POST /api/mono/connect з реальним токеном (потрібен MONO_WEBHOOK_ENABLED=true і верифікований email) -> Monobank робить GET на webHookUrl -> отримує 404.
```

**Верифікатор:**

```text
Сам дефект проти задокументованого контракту відтворюється. У routes/mono-webhook.ts:61-62 є лише r.post, а прод працює в режимі API-only (config.servesFrontend завжди false, SPA-fallback app.get(/.*/) не монтується), тож GET/HEAD повертають Express-404. Офіційна дока Monobank (POST /personal/webhook) справді вимагає «строго 200» на валідаційний GET, і кілька OSS-реалізацій (taxes-ua, household, go-monobank-sdk) додають GET-хендлер саме через це. Заявлений вплив («підключення падає або вебхук не активується») суперечить доказам у самому репо. Міграція 119_mono_account_is_jar.sql описує «знахідку founder-а 2026-08-10»: рядки-заглушки в mono_account, які створює ЛИШЕ обробник вебхука (23503-гілка в modules/mono/webhook.ts:333-360, backfill їх не створює). Отже, в серпні 2026 Monobank реально доставляв вебхуки на прод-сервер, який на GET відповідав 404: і Railway, і Hetzner/Coolify (ADR-0074, з 2026-07-11) працюють в API-only режимі. На практиці валідація зараз, схоже, не блокує. Лишається латентний ризик: якщо Monobank почне перевіряти суворо, як написано в доці, ламаються нові підключення і 90-денна ротація rotateSecret.ts. Виправлення дешеве (GET/HEAD -> 200), але проблему high-рів …[обрізано]
```

**Додаткові докази верифікатора:**

```text
x1_mono_get.mjs: GET /api/mono/webhook/<64hex> -> 404 text/html; HEAD /api/mono/webhook/0123 -> 404; GET /api/v1/mono/webhook/abc -> 404. apps/server/src/config.ts:44 servesFrontend:false; security.ts:46-48 «runtime ніколи не передає servesFrontend: true». migrations/119_mono_account_is_jar.sql: «Коли Monobank доставляє вебхуком транзакцію по рахунку, якого ми ще не бачили... Знахідка founder-а 2026-08-10». Дока Monobank (через пошук): «на неї надсилається GET-запит. Сервер має відповісти строго HTTP статус-кодом 200».
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the defect, but I think "high" overstates its impact. I would rate it medium.

**What holds up (confirmed):**
- apps/server/src/routes/mono-webhook.ts:61-62 registers only `r.post` for `/api/mono/webhook` and `/api/mono/webhook/:secret`. No GET, HEAD or `all` handler exists anywhere in the server.
- The SPA fallback that could have answered a GET with 200 (`app.get(/.*/)`) is mounted only when `servesFrontend && distPath` (apps/server/src/app.ts:171). Production never mounts it, because `config.ts:44` hard-codes `servesFrontend: false`.
- I re-ran the probe myself (scratch .../skeptic-api-live-ai-billing-integrations-live-1/get_probe.mjs):
  - GET `/api/mono/webhook/<32 hex>` returns 404 text/html, as do GET `/api/mono/webhook` and GET `/api/v1/mono/webhook/abc`.
  - HEAD returns 404.
  - Only OPTIONS returns 200, from CORS, and Monobank does not send OPTIONS.
- Monobank's documentation does say a GET is sent to `webHookUrl` and it must get strictly 200. Several independent sources repeat this.
- The ordering point is also correct: connection.ts:157 registers the URL, and the `webhook_secret_hash` is only written at :204. So a fix must answer 200 without checking the secret. This is a constraint on how to fix it, not a second bug.

**Why the severity is inflated:**

1. **Production evidence points the other way.** apps/server/src/migrations/119_mono_account_is_jar.sql:6-10 and :22 record that on 2026-08-10 the founder found "ghost" jar rows in `mono_account …[обрізано]
```

## low

<a id="rel-25"></a>

### `rel-25` [low] Повторний Plata-checkout не оновлює created_at: підписка, оплачена з другої спроби, лишається без полінгової страховки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: billing Plata
- **Де:** apps/server/src/modules/billing/plata.ts:305-313; apps/server/src/modules/billing/plataSync.ts:226-248; apps/server/src/migrations/133_plata_subscription.sql
- **Першопричина:** ON CONFLICT (user_id) у createCheckoutSession оновлює subscription_id і confirmed_at, але не created_at. Fast tick бере лише непідтверджені рядки з created_at, молодшим за годину, а slow tick — лише підписки, що вже active або past_due.
- **Вплив:** Хто кинув перший checkout і оплатив повторний більш ніж через годину, отримає Pro, лише якщо дійде вебхук. Якщо вебхук загубився, гроші списано, а доступу немає.
- **Що зробити:** У ON CONFLICT ставити created_at = NOW() або завести окрему колонку checkout_started_at. У slow tick додати непідтверджені рядки, молодші за 7 днів.
- **Примітка:** Латентно, поки PLATA_ENABLED=false. Фіндер ставив medium. Разом із rel-19 це дві діри в одній страхувальній сітці.

Знахідок у кластері: 1.

#### [low] Повторний Plata-checkout не оновлює created_at — швидкий тик звірки ігнорує нову підписку

- **ID:** `server-static/webhooks-billing-quota#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/modules/billing/plata.ts:305-313; apps/server/src/modules/billing/plataSync.ts:226-248; apps/server/src/migrations/133_plata_subscription.sql
- **Вплив:** Гроші: оплачена підписка без доступу для будь-кого, хто не оплатив з першої спроби; страхувальна сітка «активація не чекає доби, якщо webhook не дійшов» не працює саме тоді, коли потрібна.
- **Рекомендація:** У ON CONFLICT ставити `created_at = NOW()` (або окрему колонку checkout_started_at і фільтрувати по ній); додати в slow tick непідтверджені рядки молодші за, скажімо, 7 днів.

**Докази:**

```text
Upsert мапінгу: `ON CONFLICT (user_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, confirmed_at = NULL, updated_at = NOW()` — created_at лишається від першої спроби. Fast tick: `WHERE confirmed_at IS NULL AND created_at > NOW() - make_interval(secs => $1)` (1 год). Slow tick бере лише юзерів з `subscriptions.status IN ('active','past_due')` і provider='plata', тож новий підписник туди не потрапляє.
```

**Відтворення:**

```text
Користувач натискає Plata, кидає сторінку; через >1 год (або наступного дня) оформлює знову й платить. Якщо вебхук не дійшов (див. знахідку про URL вебхуків), fast tick рядок не бачить, slow tick теж → Pro не активується ніколи.
```

**Верифікатор:**

```text
Підтверджено в коді. ON CONFLICT (user_id) у createCheckoutSession оновлює subscription_id, confirmed_at=NULL і updated_at, але created_at не чіпає. runFastTick бере лише `confirmed_at IS NULL AND created_at > NOW() - 1h`. runSlowTick джойнить subscriptions з provider='plata' і status IN ('active','past_due'), тож новий підписник без рядка в subscriptions туди не потрапляє. Хто кинув перший checkout і оплатив повторний більш ніж через годину, не має полінгової страховки, і доступ залежить лише від вебхука. Severity знижено до low: це резервний шлях. Основний шлях, вебхуки, у проді працює через Vercel edge-проксі (див. спростування #1), тож шкода виникає лише при подвійному збої (вебхук загубився і checkout повторний). Крім того, PLATA_ENABLED=false у проді.
```

**Додаткові докази верифікатора:**

```text
plata.ts:305-313 `ON CONFLICT (user_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, confirmed_at = NULL, updated_at = NOW()`. plataSync.ts:46-48 FAST_WINDOW_MS = 1 год; :226-235 фільтр fast tick за created_at; :238-248 slow tick вимагає рядок subscriptions зі статусом active/past_due.
```

<a id="rel-26"></a>

### `rel-26` [low] Некоректний ввід доходить до Postgres і повертає 500 з сирим SQLSTATE замість 400

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: валідація вводу / errorHandler
- **Та сама першопричина, що й** [`sec-39`](./security.md#sec-39): Той самий дефект: errorHandler перетворює помилки вводу, що дійшли до Postgres, на 500 і віддає клієнту SQLSTATE.
- **Де:** apps/server/src/http/errorHandler.ts:48-57,94-101; apps/server/src/modules/finyk/receipts/get.ts:27; apps/server/src/modules/finyk/import/batches.ts:26-31; apps/server/src/modules/mono/read.ts:138-179; packages/shared/src/schemas/api.ts:1412-1418; apps/server/src/modules/silpo/receiptsRead.ts:52-75; apps/server/src/modules/sync/syncV2Stream.ts:194-200,237-238
- **Першопричина:** Частина параметрів не валідується до SQL: id без верхньої межі int8 (finyk receipts, import batches), from/to/cursor у /api/mono/transactions як довільний z.string(), курсор чеків Сільпо, Last-Event-ID у SSE. User-рядки не відсікають U+0000 і самотні сурогати. errorHandler трактує pg-помилки класу 22 як programmer error (500 і Sentry) і віддає err.code клієнту.
- **Вплив:** Кривий параметр чи рядок з NUL на будь-якому write-ендпоінті дає 500 і Sentry.captureException: один клієнт може влаштувати шторм алертів, а внутрішній SQLSTATE витікає назовні. Підроблений Last-Event-ID обриває SSE з error-логом. Даних це не зачіпає, крос-юзерного доступу немає.
- **Що зробити:** Перший крок (S): у errorHandler мапити SQLSTATE класу 22 на 400 VALIDATION без pg-коду. Далі: у спільних Zod-схемах відкидати U+0000 і непарні сурогати, валідувати from/to як datetime, курсори через Date.parse, id через Number.isSafeInteger, а Last-Event-ID тією ж схемою, що й since, до flushHeaders.
- **Примітка:** Шість незалежних знахідок однієї природи. input-fuzz#1 фіндер ставив medium через масштаб: зачеплено весь write-шлях.

Знахідок у кластері: 6.

#### [low] Out-of-range числові та биті дата/курсор параметри дають 500 із сирим SQLSTATE замість 400 (finyk receipts/batches, mono transactions, sync stream)

- **ID:** `server-static/gap-blocked-input-route-findings#8` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Де:** apps/server/src/modules/finyk/receipts/get.ts:27 та import/batches.ts:28 (Number(idParam) без верхньої межі bigint); modules/mono/read.ts:138-177 (from/to/cursor без валідації перед SQL); modules/sync/syncV2Stream.ts:195-238 (Last-Event-ID)
- **Вплив:** Некоректна валідація вводу: 500 замість 400, витік внутрішнього SQLSTATE у відповідь, зайвий шум у Sentry/логах, обрив SSE-стріму на підробленому Last-Event-ID. Експлуатації даних немає (запити user-scoped), але це гнилий контракт помилок і дрібний self-DoS на логи.
- **Рекомендація:** Відсікати id/limit/since верхньою межею (Number.isSafeInteger та ≤ 2^63-1, або z.coerce.bigint з max) до біндингу; валідувати from/to як дати і cursor-формат перед SQL; readLastEventId має відкидати не-safe-integer. Повертати 400 VALIDATION без PG-коду.

**Докази:**

```text
Живі відповіді (p7.mjs/p1b.mjs) + server.log: GET /api/finyk/receipts/99999999999999999999 → 500 code 22003 'value out of range for type bigint'; GET та DELETE /api/finyk/import/batches/99999999999999999999 → 500 22003; GET /api/mono/transactions?from=abc → 500 22007; ?to=2026-99-99 → 500 22008; ?cursor=zzz:1 → 500 22007. validators приймають Number.isInteger&&>0, але не відсікають значення поза діапазоном int8, тож биндяться у PG і падають. Для /api/v2/sync/stream readLastEventId приймає Number() (переповнення не ловить): Last-Event-ID:99999999999999999999 → лог sync_v2_stream_replay_failed 'out of range for type bigint', 1e+300 → 'invalid input syntax for type bigint', стрім обривається. 500-ки повертають клієнту сирий PG-код (22003/22007/22008) у полі code.
```

**Відтворення:**

```text
node p7.mjs / p1b.mjs; grep '22003|out of range' server.log — підтверджує 500 і повідомлення PG. Ендпоінти user-scoped (ownership у WHERE), тож не крос-юзерний витік, але 500 замість 400 і витік SQLSTATE.
```

**Верифікатор:**

```text
Підтверджено і в коді, і на живому сервері. Валідатори id у finyk/receipts/get.ts:27-28 та import/batches.ts:26-31 перевіряють лише `Number.isInteger(n) && n > 0`. Для '99999999999999999999' це дає 1e20 (Number.isInteger(1e20) === true), значення біндиться в PG і падає з помилкою 22003. MonoTransactionsQuerySchema (packages/shared/src/schemas/api.ts:1412) пропускає `from`/`to` як довільні z.string(), а cursor у read.ts:166-178 перевіряє лише наявність ':'. Тому біті дати й курсор доходять до SQL. Сирий SQLSTATE просочується через http/errorHandler.ts:52-53: `code = (typeof e.code === 'string' && e.code) || ...`, а pg-помилка несе e.code='22003'. Повідомлення при цьому загальне 'Server error', і помилка не-операційна, тож вона ще й іде в Sentry.captureException. readLastEventId (syncV2Stream.ts:194-200) пропускає 1e20 і '1e+300' (обидва isFinite і isInteger). SELECT при replay падає, catch пише лог sync_v2_stream_replay_failed і робить res.end() на вже відданих 200-заголовках. Ніде в middleware ці значення не нейтралізуються. Експлуатації немає: усі запити обмежені власником через WHERE user_id, а легітимний EventSource шле Last-Event-ID лише з `id:`, який віддав сам сервер. Отже об …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Живий прогін <scratch>/agents/verify-server-static-gap-blocked-input-route-findings/v1.mjs (власний pool-юзер 'verify-ssgbir'). GET /api/finyk/receipts/99999999999999999999, /9223372036854775808 і /1e20 дають 500 {"error":"Server error","code":"22003"}, контроль /123 дає 404 NOT_FOUND. GET і DELETE /api/finyk/import/batches/99999999999999999999 дають 500 code 22003. /api/mono/transactions?from=abc дає 500 22007, ?to=2026-99-99 дає 500 22008, ?cursor=zzz:1 дає 500 22007, контроль ?from=2026-01-01 дає 200. Прогін v2.mjs: SSE /api/v2/sync/stream з Last-Event-ID 99999999999999999999 повертає 200, порожнє тіло, сервер закриває з'єднання за 173 мс. З '1e+300' те саме за 129 мс. Контроль '5' дає hello+caught_up, з'єднання лишається відкритим. У server.log з'явились записи sync_v2_stream_replay_fa …[обрізано]
```

#### [low] GET /api/mono/transactions з невалідним from, to чи cursor дає 500 і SQLSTATE у відповіді

- **ID:** `server-static/gap-finyk-import-receipts-correctness#16` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/mono/read.ts:151-179; packages/shared/src/schemas/api.ts:1412-1418
- **Вплив:** Будь-яке криве значення в параметрі дає 500 замість 400, засмічує error-алерти і віддає клієнту SQLSTATE Postgres.
- **Рекомендація:** Валідувати from і to як z.string().datetime({offset:true}), а час у cursor через Date.parse з 400 при помилці. У errorHandler не віддавати сирий err.code для не-операційних помилок.

**Докази:**

```text
Живі запити: ?from=abc дає 500 {"code":"22007"}; ?to=2026-02-30 дає 500 {"code":"22008"}; ?cursor=notatime:abc дає 500 {"code":"22007"}. MonoTransactionsQuerySchema описує from і to як z.string() без формату, а час із cursor іде в SQL сирим.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/monoq.mjs
```

**Верифікатор:**

```text
Reproduced live as userA with verify-server-static-gap-finyk-import-receipts-correctness/monoq.mjs. Results: ?from=abc gives 500 {"error":"Server error","code":"22007"}; ?to=2026-02-30 gives 500 code 22008; ?cursor=notatime:abc gives 500 code 22007. Valid values (?from=2026-08-16, an ISO cursor) return 200, and ?limit=abc returns a clean 400 VALIDATION, so only from, to and cursor-time lack validation. In the code, MonoTransactionsQuerySchema (packages/shared/src/schemas/api.ts:1412-1418) declares from and to as plain z.string(). read.ts:151-179 pushes them and the cursor time straight into the `t.time >= $n` timestamptz comparisons, so Postgres throws a cast error. errorHandler.ts:52-53 copies any string `e.code` into the response, which is why the pg SQLSTATE reaches the client, and errors with status ≥500 go to Sentry.captureException at line 95. I found no guard elsewhere that would neutralise this. Severity stays low: the user must be authenticated, the only leak is a SQLSTATE code (no message, no stack), and the effect is mainly noise in error alerts plus a wrong status code.
```

**Додаткові докази верифікатора:**

```text
Live: `?from=abc -> 500 {"error":"Server error","message":"Server error","code":"22007",...}`, `?to=2026-02-30 -> 500 ... "code":"22008"`, `?cursor=notatime:abc -> 500 ... "code":"22007"`, `?limit=abc -> 400 VALIDATION`. The SQLSTATE echo is a general errorHandler behaviour (`(typeof e.code === "string" && e.code)` for non-operational errors). Every route that lets a pg error escape is affected, not only this one.
```

#### [low] GET /api/mono/transactions: невалідні from/to/cursor дають 500 з SQLSTATE у полі code і вводом користувача в error-лозі

- **ID:** `api-live/ai-billing-integrations-live#10` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `crash`
- **Де:** packages/shared/src/schemas/api.ts:1412-1418 (from/to: z.string() без формату), apps/server/src/modules/mono/read.ts:151-178 (значення напряму в параметри timestamptz)
- **Вплив:** Помилка клієнта стає 5xx (шум в алертах і Sentry), назовні видно коди Postgres, у логи потрапляє довільний текст користувача.
- **Рекомендація:** Валідувати from/to як ISO-дату (z.string().datetime() або z.coerce.date() з межами), розбирати cursor за схемою і віддавати 400. В errorHandler не прокидати pg-коди (22xxx) як `code` клієнту.

**Докази:**

```text
Як aibill1: ?from=notadate -> 500 {"error":"Server error","code":"22007",...}; ?from=0&to=99999999999999 -> 500 code "22008"; ?cursor=notadate:abc -> 500 code "22007"; ?to=2026-13-45 -> 500 code "22008". Лог: `"level":"error","msg":"request_failed","status":500,"code":"22007","err":{"message":"invalid input syntax for type timestamp with time zone: \"notadate\"","stack":"... at transactionsHandler (read.ts:242:20)"}`. SQL-ін'єкції немає, запити параметризовані.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p17_mono.mjs і p18_cursor.mjs
```

**Верифікатор:**

```text
Відтворено наживо. MonoTransactionsQuerySchema (packages/shared/src/schemas/api.ts:1412-1418) приймає from і to як довільний z.string(). read.ts:151-178 передає їх і частину cursor до двокрапки прямо в параметри порівняння з timestamptz. Postgres кидає 22007 або 22008, а errorHandler бере e.code з pg-помилки як `code` відповіді. Status у такої помилки немає, тож виходить 500 з error-логом, стеком і вводом користувача в повідомленні. SQL-ін'єкції немає: запити параметризовані. Перевірка cursor на двокрапку (read.ts:165) ловить лише відсутність `:`. Наслідки: шум 5xx і Sentry від власної сесії користувача та розкриття SQLSTATE клієнту. Вплив низький.
```

**Додаткові докази верифікатора:**

```text
y1_all.mjs від імені пул-юзера: ?from=notadate -> 500 {"error":"Server error","code":"22007"}; ?from=0&to=99999999999999 -> 500 code "22008"; ?cursor=notadate:abc -> 500 "22007"; ?to=2026-13-45 -> 500 "22008"; контроль ?from=2026-01-01 -> 200. Лог requestId 01959d35…: level error, status 500, code 22007, message «invalid input syntax for type timestamp with time zone: "notadate"», at transactionsHandler (read.ts:242). errorHandler.ts: `(typeof e.code === "string" && e.code)` віддає будь-який pg-код назовні.
```

#### [low] Last-Event-ID у SSE обходить валідацію `since`: overflow bigint дає error-лог і порожній 200-потік

- **ID:** `api-live/sync-live#10` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:194-200,237-238 (readLastEventId: лише Number.isInteger, без верхньої межі; перекриває провалідований since)
- **Вплив:** Клієнтський ввід генерує error-рівень у логах/Sentry і цикл перепідключень EventSource (кожне з'єднання миттєво закривається). Помилка валідації маскується під серверну.
- **Рекомендація:** Валідувати Last-Event-ID тією ж схемою, що і since (int, 0..MAX_SAFE_INTEGER), а при невалідному значенні відповідати 400 до flushHeaders.

**Докази:**

```text
GET /api/v2/sync/stream?since=0, Last-Event-ID: 1e21 → 200, з'єднання закрито сервером без жодного кадру; лог: {"level":"error","msg":"sync_v2_stream_replay_failed","err":"invalid input syntax for type bigint: \"1e+21\""}
Last-Event-ID: 99999999999999999999 → те саме, err "value \"100000000000000000000\" is out of range for type bigint"
Для порівняння GET /api/v2/sync/pull?since=1e20 → 400 VALIDATION.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t15_stream_edge.mjs
```

**Верифікатор:**

```text
I reproduced it live (d4/v10_lei.mjs). readLastEventId (syncV2Stream.ts:194-200) only checks Number.isFinite/isInteger/>=0, then overrides the zod-validated `since` (line 238). It runs after parseQuery, and the replay SELECT runs after flushHeaders, so the status is already 200. These Last-Event-ID values each gave HTTP 200, a server-closed stream with zero frames, and an error-level `sync_v2_stream_replay_failed` log: '1e21' ('invalid input syntax for type bigint: "1e+21"'), '99999999999999999999' (out of range), and '9223372036854775807' (Number() rounds it to 9223372036854776000, which is out of range). By contrast `?since=1e20` gives 400 VALIDATION, and MAX_SAFE_INTEGER works normally. The error path also increments sync_operations_total{op='v2_stream',outcome='error'}, which feeds the sync error-ratio recording rules (outcome=~'error|too_large|unauthorized'). So client input pollutes the server error SLI. Two parts of the reported impact are overstated. There is no web client SSE consumer yet (sync-client-wiring.md: 'SSE consumer відсутній', Phase 3). A browser EventSource only echoes ids the server sent, which are valid bigints, so the 'EventSource reconnect loop' needs a cra …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v10_lei.mjs: 'LEI 1e21 status=200 ended_by_server=true frames=[]', same for 99999999999999999999 and 9223372036854775807; 'LEI 9007199254740991 status=200 frames=[hello,caught_up]'; 'query since=1e20 status=400 VALIDATION'. Server log: 'error sync_v2_stream_replay_failed invalid input syntax for type bigint: "1e+21"' / 'value "100000000000000000000" is out of range for type bigint' / 'value "9223372036854776000" is out of range for type bigint', each followed by 'http 200'. Recording rules: docs/operations/observability/prometheus/recording_rules.yml:65-82.
```

#### [low] GET /api/silpo/receipts з довільним cursor (валідний base64-JSON з некоректною датою) дає 500 INTERNAL замість 400

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#17` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Де:** apps/server/src/modules/silpo/receiptsRead.ts:52-75 (decodeCursor перевіряє лише непорожні рядки), :98-106
- **Вплив:** Шум у Sentry і 5xx на сміттєвому вводі. Даних не зачіпає.
- **Рекомендація:** У decodeCursor перевіряти Date.parse(parsed[0]) і кидати ValidationError (400).

**Докази:**

```text
decodeCursor приймає будь-які два непорожні рядки, далі `r.purchased_at < $n` з 'abc' дає помилку Postgres 22007 «invalid input syntax for type timestamp with time zone». Це не AppError, тож errorHandler віддає 500 і Sentry.captureException.
```

**Відтворення:**

```text
Статично (локально SILPO_ENABLED=false): GET /api/silpo/receipts?cursor=<base64url(JSON.stringify(["abc","x"]))> -> 500
```

**Верифікатор:**

```text
Відтворено на живій БД через справжній `listReceipts` з `db.query` і справжній `errorHandler`. Курсор base64url(JSON.stringify(["abc","x"])) проходить decodeCursor (receiptsRead.ts:61-68 перевіряє лише, що це непорожні рядки) і SilpoReceiptsQuerySchema (`cursor: z.string().min(3)`). Postgres кидає DatabaseError 22007 «invalid input syntax for type timestamp with time zone». Це не AppError, тому errorHandler віддає 500 і для не-operational 5xx викликає Sentry.captureException. Між викликом і БД немає жодного обробника, що перетворив би 22xxx на 400: db.query просто перекидає помилку далі. Наслідок: 5xx і шум у Sentry на сміттєвому вводі, дані не зачеплено. Low коректне.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-server-static-gap-silpo-and-shared-product-catalog/cursor-500.mts: `thrown: DatabaseError code= 22007 msg= invalid input syntax for type timestamp with time zone: "abc"` → `errorHandler -> 500 {"error":"Server error","message":"Server error","code":"22007","requestId":"r1"}`. Курсор з валідною датою повертає `{"data":[],"nextCursor":null}`. Побічно: errorHandler пропускає pg-код `22007` у поле `code` відповіді, бо бере будь-який рядковий `e.code`. Локально маршрут не відтворити, бо SILPO_ENABLED=false дає 503 до parseQuery; у проді інтеграцію ввімкнено.
```

#### [low] NUL-байт / самотній сурогат у будь-якому write-полі валить 500 на всій поверхні запису (єдина першопричина)

- **ID:** `api-live/input-fuzz#1` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `crash`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/routes/{me,finyk,coach,push,feedback}.ts (хендлери -&gt; Postgres); реекспорт SQLSTATE у apps/server/src/http/errorHandler.ts:48-57,94
- **Вплив:** Кожен write-ендпоінт (витрати, нотатки, профіль, hubPrefs, памʼять коуча, фідбек, пуш-токен, імʼя) падає 500-ю на стрічці з NUL/сурогатом замість чистої 400. У проді: шторм Sentry.captureException (ці 500 неоперативні) від одного кривого чи зловмисного клієнта, плюс витік внутрішнього SQLSTATE у полі code. Без втрати даних і крос-юзер-доступу, але системна прогалина робастності валідації по всьому запису.
- **Рекомендація:** Додати у спільні Zod-схеми (packages/shared) refine, що відкидає U+0000 і непарні сурогати в усіх user-рядках, повертаючи 400 VALIDATION. У errorHandler не віддавати сирий SQLSTATE як code.

**Докази:**

```text
Автентифіковано своїм юзером. POST /api/finyk/manual-expenses {category:'fo\u0000od'} -> 500 code=22P05; note лише-сурогат \ud800 -> 500 22P02; PATCH /api/me/preferences {hubPrefs:{a:'x\u0000y'}} -> 500 22P05; {hubPrefs:{a:'\udfff'}} -> 500 22P02; PUT /api/me/profile {profile:{name:'a\u0000b'}} -> 500 22P05; {profile:{'k\u0000':1}} -> 500 22P05; POST /api/coach/memory weekKey '2026-W40\u0000' -> 500 22P05; POST /api/feedback message 'a\u0000b' -> 500 22021; POST /api/push/register ios token 'abc\u0000def' -> 500 22021; POST /api/auth/update-user {name:'a\u0000b'} -> 500 з ПОРОЖНІМ тілом. Клієнту віддається сирий SQLSTATE у полі code.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-input-fuzz/r1_semantic.mjs (секції manual-expenses / prefs/profile / push/coach).
```

**Верифікатор:**

```text
Відтворено на власному користувачі (vif2-main) на поточному сервері. POST manual-expenses: category з NUL дає 500 code=22P05, note з самотнім сурогатом дає 500 22P02; контроль із валідною сурогатною парою (emoji) дає 201. PATCH /api/me/preferences hubPrefs NUL дає 500 22P05, surrogate 500 22P02. PUT /api/me/profile: NUL у значенні і NUL у ключі обидва дають 500 22P05. POST /api/coach/memory weekKey NUL дає 500 22P05. POST /api/feedback {category:'idea', message з NUL} дає 500 22021. POST /api/push/register ios token з NUL дає 500 22021. POST /api/auth/update-user name з NUL дає 500 з порожнім тілом. У коді немає жодної санітизації U+0000 чи сурогатів ні в apps/server/src, ні в packages/shared/src. errorHandler.ts:52-53 бере `e.code` будь-якої помилки, тож SQLSTATE з pg-помилки потрапляє клієнту в поле `code`. Гілка `status>=500 && !operational` на :95 шле подію в Sentry. Те саме буде в проді: PG17 так само відкидає \u0000 у jsonb і 0x00 у text. Severity знижено до low. Шкода лише для власного запиту відправника, без втрати даних і без крос-юзер ефекту. SQLSTATE-код не є чутливим секретом. Sync-шлях (/api/v2/sync/push) відкидає NUL поштучно (`rejected/oplog_write_failed`), тож черга …[обрізано]
```

**Додаткові докази верифікатора:**

```text
r2/v1_nul.mjs, r2/v1b.mjs. Нюанс: feedback з самотнім сурогатом приймається (200), бо text-колонка через node-postgres мовчки замінює його на U+FFFD. Падає лише jsonb, куди JSON.stringify пише escape \ud800. Лог: request_failed module=coach code=22P05 'unsupported Unicode escape sequence'. Sync-фаз фіндера (p10_sync.log) показує NUL як per-op rejected, а не 500 на весь батч.
```

<a id="rel-27"></a>

### `rel-27` [low] Запити sync push і pull без таймауту: один завислий push блокує відправку змін на всю сесію

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** api-client / web sync engine
- **Де:** packages/api-client/src/endpoints/syncV2.ts:116-133; packages/api-client/src/httpClient.ts:184-193; packages/api-client/src/endpoints/syncV2.pushScheduler.ts; apps/web/src/core/syncEngine/singleton.ts:613
- **Першопричина:** pushV2 і pullV2 не передають ні signal, ні timeoutMs, а httpClient не має дефолтного таймауту. Поки inflight !== null, push-планувальник пропускає тіки і повертає той самий promise.
- **Вплив:** На мобільних мережах (перемикання Wi-Fi/LTE, black-holed TCP) черга змін висить хвилинами без жодної помилки в UI: у відтворенні 165 с. Якщо тим часом закрити вкладку, дані лишаються тільки локально.
- **Що зробити:** Передавати AbortSignal.timeout(20-30 с) у pushV2 і pullV2 і задати дефолтний timeoutMs у createApiClient. Таймаут трактувати як повторювану транспортну помилку з backoff і показувати в стані синку.
- **Примітка:** Фіндер ставив medium, верифікатор знизив до low.

Знахідок у кластері: 1.

#### [low] Запити sync push і pull не мають таймауту: один завислий push блокує всю відправку змін на всю сесію

- **ID:** `browser-crosscut/resilience-offline-perf#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** packages/api-client/src/endpoints/syncV2.ts:116-133 (pushV2/pullV2 без signal/timeoutMs); packages/api-client/src/httpClient.ts:184-193 (таймаут лише коли opts.timeoutMs заданий, дефолту немає); apps/web/src/core/syncEngine/singleton.ts:613
- **Вплив:** На мобільних мережах (перемикання Wi-Fi/LTE, black-holed TCP) черга змін зависає на хвилини, поки браузер, TCP чи проксі не здадуться. Зміни не доходять до хмари й інших пристроїв, помилка ніде не показується. Якщо вкладку тим часом закрити, дані лишаються тільки локально.
- **Рекомендація:** Передавати AbortSignal.timeout(20-30 с) у pushV2 і pullV2 та задати дефолтний timeoutMs у createApiClient. Таймаут вважати повторюваною транспортною помилкою з backoff і показувати в стані синку.

**Докази:**

```text
run-pushhang.log: '3 push requested (hold=true)', '4 added HANG-28603-1', '48 added HANG-28603-2', далі '78/108/138/168 banner=Синхронізація · 2 в черзі' без жодної нової спроби push за 165 с (pull тим часом ішли: '49 200 GET pull', '112 200 GET pull'); '168 --- release' -> '168 200 POST /api/v2/sync/push', '175 200 POST …'; лише після цього 'server has -1: true -2: true'.
```

**Відтворення:**

```text
node 31-push-hang.mjs 150000: route на /api/v2/sync/push тримає перший запит без відповіді; на /finyk/transactions додати 2 витрати; спостерігати 150 с; відпустити.
```

**Верифікатор:**

```text
I verified this in code. syncV2.ts pushV2 and pullV2 pass no signal or timeoutMs. httpClient combineSignals applies a timeout only when opts.timeoutMs is set, and createApiClient in apps/web/src/shared/api/index.ts sets no default. In packages/api-client/src/endpoints/syncV2.pushScheduler.ts, periodicTick skips while `inflight !== null` and flushNow returns the same in-flight promise. One hung push therefore blocks every later push, including flush-on-reconnect and notifyEnqueued, until the fetch settles. The reader has the same single-flight pattern for pull. Anonymous-data migration awaits reader.pullOnce() and flushUntilSettled with no timeout of its own, so it can hang too. I downgraded to low. The server has a global requestTimeout middleware (apps/server/src/http/timeout.ts, app.ts:121) that ends server-side hangs with a 408. Chrome aborts in-flight requests on a network change (ERR_NETWORK_CHANGED). The outbox lives in SQLite, so the effect is delayed sync, not data loss. A residual risk remains for a silently black-holed socket, such as a stale NAT entry on mobile, which can hang for minutes.
```

**Додаткові докази верифікатора:**

```text
The finder's run-pushhang.log shows a held push from 3 s to 168 s while pulls kept working (49 s, 112 s), and both ops reached the server after release. In code: pushScheduler.ts `if (inflight !== null) { onSkippedTick?.(); return; }`, and the writer breadcrumb 'sync v2 push tick skipped while in flight' in syncEngineWriter.ts. anonymousDataMigration.ts:849/901 runs `await reader.pullOnce()` with no timeout.
```

<a id="rel-28"></a>

### `rel-28` [low] Платіжні вебхуки без rate-limit віддають 500 зі стеком, коли провайдер не налаштований, а Plata ходить по pubkey ще до перевірки підпису

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: billing webhooks
- **Де:** apps/server/src/routes/billing.ts:355-421; apps/server/src/modules/billing/plata.ts:50-56,92-107; apps/server/src/modules/billing/liqpay.ts:60-69,436-439; apps/server/src/http/errorHandler.ts:95-101; apps/server/src/obs/securityEvents.ts
- **Першопричина:** Вебхук-роути LiqPay і Plata змонтовані незалежно від LIQPAY_ENABLED і PLATA_ENABLED. plataWebhookHandler спершу викликає ensurePlataPubkey() (fetch monopay /pubkey з getToken()) і лише потім дивиться на X-Sign. BillingConfigurationError не проходить через handleBillingError (503) і стає неоперативною 500. Ні rate-limit, ні CSRF на цих роутах немає, а прибирання security-подій глобальне на тип.
- **Вплив:** Будь-хто анонімно генерує необмежені 500, error-логи зі стеком і Sentry-події (витрата квоти, шум алертів) скрізь, де провайдер вимкнений. Флуд підробленими підписами в межах 10/хв на тип ховає справжні bad_sig-події. У проді з увімкненою Plata недоступний /pubkey на холодному кеші дав би 500 і справжнім колбекам оплати.
- **Що зробити:** Перевіряти наявність і форму X-Sign до ensurePlataPubkey. Ловити BillingConfigurationError і віддавати операційну 503 або не монтувати вимкнений провайдер. Додати per-IP rate-limit на вебхуки, а security-події прибирати за парою (тип, IP).
- **Примітка:** Локальна причина 500 — незаданий PLATA_TOKEN. Але це реалістичний прод-стан для вимкненого провайдера, тож проблема не лише в середовищі.

Знахідок у кластері: 4.

#### [low] Анонімний POST на неналаштований вебхук провайдера дає 500 зі стеком і подію в Sentry

- **ID:** `server-static/webhooks-billing-quota#11` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/billing.ts:358-367,385-394; apps/server/src/modules/billing/liqpay.ts:60-69,436-439; apps/server/src/modules/billing/plata.ts:50-56,92-100; apps/server/src/http/errorHandler.ts:95-101
- **Вплив:** Поки будь-який із провайдерів вимкнено в проді, анонім може генерувати нескінченні error-логи зі стеком і Sentry-події (вичерпання квоти Sentry, шум алертів), без автентифікації і без rate-limit на цих роутах.
- **Рекомендація:** Не монтувати вебхук провайдера, коли він вимкнений (або повертати 404/503 як operational AppError до виклику getKeys); додати легкий per-IP rate-limit на bad_sig.

**Докази:**

```text
Вебхук-роути змонтовано незалежно від LIQPAY_ENABLED/PLATA_ENABLED; verifyWebhookSignature/ensurePlataPubkey викликають getKeys()/getToken(), які кидають BillingConfigurationError (не AppError) → errorHandler: status 500, non-operational → `Sentry.captureException(err)`. Живий прогін: POST /api/billing/plata-charge, /plata-status, /liqpay-callback без підпису → 500 {"code":"INTERNAL"}; у server.log `"level":"error","msg":"request_failed",..."message":"PLATA_TOKEN is not set","stack":"BillingConfigurationError...` і `LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set`.
```

**Відтворення:**

```text
probe1.mjs: рядки 'POST plata-charge anon', 'POST liqpay-callback anon' → 500; requestId 63b7d4fa-…, a1d561c5-… у server.log.
```

**Верифікатор:**

```text
Відтворено живцем (r2.mjs). Анонімні `POST /api/billing/plata-charge` (з X-Sign), `/plata-status` і `/liqpay-callback` (з data+signature) дають 500 `{"code":"INTERNAL"}`. У server.log для requestId 1356e6a6-… та b38c96a0-… є `level:error msg:request_failed` зі стеком `BillingConfigurationError: PLATA_TOKEN is not set at getToken (plata.ts:53) at ensurePlataPubkey (plata.ts:99)` і `LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set at getKeys (liqpay.ts:64) at verifyWebhookSignature`. `BillingConfigurationError extends Error` (`provider.ts:42`), а не AppError, тож `errorHandler.ts:95-101` вважає його non-operational 5xx і викликає `Sentry.captureException`. Вебхук-роути змонтовано безумовно (`billing.ts:353-456`), глобального rate-limit на /api немає (`app.ts` app.use-ланцюг). Ситуація реальна для прода, поки один із провайдерів не налаштований (білінг ще «Скоро»). Stripe-вебхук на відсутній секрет коректно дає 400. Severity low: це шум у логах, Sentry і алертах, без доступу до даних.
```

**Додаткові докази верифікатора:**

```text
Варіант liqpay без signature дає 400 (зразу bad_sig), тож 500 виникає лише коли є і data, і signature. Попутно: plata-хендлер навіть із налаштованим токеном на кожен невалідний X-Sign викликає `ensurePlataPubkey(true)`, але там є cooldown 60 с (`PUBKEY_FORCE_COOLDOWN_MS`), тож ампліфікації немає. Знахідка F30 (CSRF блокує вебхуки) в verification/findings.json про інше. Ця знахідка не трекається.
```

#### [low] Платіжні вебхуки без rate-limit: для неналаштованого провайдера будь-який анонімний POST дає 500 зі стеком у логах рівня error, а прибирання security-подій глобальне на тип

- **ID:** `api-live/ai-billing-integrations-live#8` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/billing.ts:355-421 (liqpay-callback, plata-charge/status: BillingConfigurationError не мапиться, на відміну від checkout/portal); apps/server/src/obs/securityEvents.ts (MAX_EVENTS_PER_MINUTE=10 на тип глобально)
- **Вплив:** Будь-хто може генерувати необмежену кількість 500 і error-логів зі стеками (шум у Sentry/алертах, витрата квоти) на будь-якому середовищі, де один із провайдерів не налаштований (preview, staging, прод після вимкнення провайдера). Флуд підробленими підписами в межах 10/хв на тип ховає справжні bad_sig-події того ж типу.
- **Рекомендація:** У вебхуках ловити BillingConfigurationError і віддавати 503 (або 404, якщо провайдер вимкнений) без стеку. Додати per-IP rateLimitExpress на /api/billing/*-webhook/callback і /api/mono/webhook (Monobank і платіжки шлють з обмеженого пулу IP). Прибирання security-подій робити за (тип, IP).

**Докази:**

```text
25 паралельних анонімних запитів на кожен роут (p5_webhook_flood.mjs): /api/billing/plata-charge {"500":25}; /api/v1/billing/plata-status {"500":25}; /api/billing/liqpay-callback (data=...&signature=...) {"500":25}; /api/billing/stripe-webhook {"400":25}. Жодного 429. Лог: `"level":"error","msg":"request_failed","path":"/api/billing/plata-charge","status":500,"err":{"message":"PLATA_TOKEN is not set","stack":"BillingConfigurationError ... at ensurePlataPubkey (plata.ts:99:27)..."}` (те саме для LIQPAY_PUBLIC_KEY). Після 10 подій stripe_webhook_bad_sig за хвилину решта логується як security_event_rate_limited (656 рядків за сесію).
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p5_webhook_flood.mjs
```

**Верифікатор:**

```text
Відтворено наживо і підтверджено в коді. Вебхук-роути в routes/billing.ts:355-421 не мають ні requireSession, ні rateLimitExpress, і глобального лімітера на /api/* немає (rateLimitExpress підключається лише для окремих роутів). plataWebhookHandler першим ділом викликає ensurePlataPubkey() → getToken() кидає BillingConfigurationError. liqpay-callback для запиту з data і signature викликає verifyWebhookSignature() → getKeys(), яка теж кидає. Обидва роути, на відміну від checkout/portal, не проходять через handleBillingError. BillingConfigurationError extends Error, а не AppError, тому errorHandler віддає 500 INTERNAL, пише error-лог зі стеком і викликає Sentry.captureException (умова status>=500 && !operational). Це не лише локальна проблема середовища: за реєстром прапорців (docs/engineering/architecture/feature-flags.md:87-88) LIQPAY_ENABLED і PLATA_ENABLED у проді досі false до запуску платежів, тож ключів там, найімовірніше, немає. Підпункт про глобальне прибирання security-подій на тип задокументовано як намір (docs/start/instructions/security-events.md:16), і метрика billing_webhook_total однаково рахує всі bad_sig. Ця частина слабка, але суть знахідки тримається.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-api-live-ai-billing-integrations-live/y1_all.mjs, по 12 паралельних анонімних POST на роут: /api/billing/plata-charge {"500":12}; /api/v1/billing/plata-status {"500":12}; /api/billing/liqpay-callback {"500":12}; /api/billing/stripe-webhook {"400":12}. Жодного 429. Лог (requestId 7225f1d6…): level error, msg request_failed, status 500, message "PLATA_TOKEN is not set", стек BillingConfigurationError at getToken (plata.ts:53) at ensurePlataPubkey (plata.ts:99) at routes/billing.ts:394. Для LiqPay (c0486cbe…): BillingConfigurationError "LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set" at verifyWebhookSignature (liqpay.ts:437). errorHandler.ts: Sentry.captureException для 5xx, що не є operational.
```

#### [low] plata-charge / plata-status кидають неоперативну 500 (анонімно, без rate-limit, шлють у Sentry) замість чистої 503, коли PLATA_TOKEN не заданий

- **ID:** `api-live/input-fuzz#6` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/routes/billing.ts (plataWebhookHandler на /api/billing/plata-charge, /api/billing/plata-status; CSRF-exempt, no RL) — пор. billing/portal, що віддає операційну 503
- **Вплив:** Ендпоінти анонімні, CSRF-exempt і без rate-limit. Коли PLATA_TOKEN не сконфігурований (локально — так; у проді — реалістичний misconfig), будь-хто з інтернету нескінченно генерує неоперативні 500 + Sentry.captureException без жодного ліміту (флуд алертів), замість керованої 503 як у billing/portal. Це баг обробки помилок (throw замість операційної 503), а не лише env-шум.
- **Рекомендація:** У plataWebhookHandler перевіряти наявність PLATA_TOKEN і повертати операційну 503 (AppError) до будь-якої роботи — як billing/portal. Додати per-IP rate-limit на plata-charge/plata-status.

**Докази:**

```text
Анонімно, будь-яке тіло: POST /api/billing/plata-charge {} / [] / text/plain / без тіла / X-Sign junk -> усі 500 code=INTERNAL (25/25 у гістограмі). POST /api/billing/plata-status — те саме. Контраст: liqpay-callback {} -> 400 'Invalid LiqPay signature'; stripe-webhook {} -> 400 'Invalid Stripe signature'; billing/portal -> 503 BILLING_UNAVAILABLE (чисто). errorHandler шле неоперативні 500 у Sentry.captureException.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_csrf.mjs (рядки plata-charge/plata-status = 500); node .../r1_matrix.mjs fuzz1.
```

**Верифікатор:**

```text
Відтворено анонімно: plata-charge і plata-status на {}, без тіла і з X-Sign junk дають 500 INTERNAL, 15/15 у гістограмі. Лог: 'BillingConfigurationError: PLATA_TOKEN is not set at getToken (plata.ts:53) at ensurePlataPubkey (plata.ts:99) at billing.ts:394'. У коді: plataWebhookHandler (routes/billing.ts:387-418) викликає ensurePlataPubkey() ДО перевірки підпису і не пропускає помилку через handleBillingError, який мапить BillingConfigurationError на 503 (billing.ts:74). BillingConfigurationError не є AppError, тож errorHandler дає 500 і Sentry.captureException. Rate-limit і CSRF на цих роутах немає. У проді це реалістично: PLATA_ENABLED за замовчуванням false (env.ts:420), а перевірка на старті вимагає токен лише коли PLATA_ENABLED=true. Отже, поки Plata не запущена, ендпоінти змонтовані й 500-лять для будь-кого. Додатково виявилось, що той самий клас стосується LiqPay: liqpay-callback з полями data і signature дає 500 'LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set' (getKeys у liqpay.ts:64). Контроль фіндера '{} → 400' тримається лише тоді, коли полів немає. Severity знижено до low: наслідок лише шум error-логів і Sentry (у Sentry є власний spike protection), без впливу на дан …[обрізано]
```

**Додаткові докази верифікатора:**

```text
r2/v6_plata.mjs. liqpay-callback 'data=x&signature=y' дає 500, requestId d5d8e995 → BillingConfigurationError у liqpay.ts:64. stripe-webhook {} дає 400, бо verifyStripeSignature повертає false без throw.
```

#### [low] POST /api/billing/plata-charge і /api/billing/plata-status відповідають 500 на анонімний запит: ensurePlataPubkey() виконується ДО перевірки наявності підпису X-Sign

- **ID:** `api-live/unauth-sweep#2` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/billing.ts:387-420 (plataWebhookHandler); apps/server/src/modules/billing/plata.ts:92-107 (ensurePlataPubkey), :51-53 (getToken кидає коли PLATA_TOKEN unset)
- **Вплив:** Неавтентифікований запит дає 500 (необроблений виняток) на платіжні webhook-роути і може змусити сервер робити вихідний виклик до monopay (/pubkey з merchant-токеном) ще до будь-якої перевірки підпису. У проді, коли /pubkey monopay недоступний, ці два webhook-и 500-тять для всіх, включно зі справжніми колбеками оплати (підтвердження тихо не доходять). Тіло помилки чисте (без stack/секретів) — витоку даних немає.
- **Рекомендація:** Перевіряти наявність/форму X-Sign ПЕРЕД викликом ensurePlataPubkey() (як stripe/liqpay): відсутній підпис -&gt; одразу 400, без зовнішнього fetch. Загорнути збій ensurePlataPubkey у явну обробку, що віддає 400/503 (а не 500).

**Докази:**

```text
Анонімно, порожнє тіло: POST /api/billing/plata-charge -> 500 {"error":"Server error","code":"INTERNAL"}; те саме для plata-status. Код: handler спершу await ensurePlataPubkey() (billing.ts:394) і лише ПОТІМ перевіряє підпис (billing.ts:402-414). ensurePlataPubkey() на cold-cache робить fetch(MONOPAY/pubkey,{headers:{'X-Token':getToken()}}) (plata.ts:98-99), а getToken() кидає BillingConfigurationError('PLATA_TOKEN is not set') (plata.ts:51-53). Для порівняння stripe/liqpay перевіряють підпис ПЕРШИМ і дають чистий 400: POST /api/billing/stripe-webhook -> 400 'Invalid Stripe signature', POST /api/billing/liqpay-callback -> 400 'Invalid LiqPay signature'.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-unauth-sweep/01-sweep.mjs -> рядки '500 POST /api/billing/plata-charge' і '500 POST /api/billing/plata-status' (тіла в sweep-results.json). Локально причина 500 — PLATA_TOKEN unset (env-артефакт); прод-причина того ж 500 — недоступний monopay /pubkey при холодному кеші: анонімний непідписаний запит однаково змушує робити зовнішній fetch і 500-ить якщо той впав.
```

**Верифікатор:**

```text
Відтворено. Анонімний POST на /api/billing/plata-charge і /api/billing/plata-status з порожнім тілом дає 500 INTERNAL, і заголовок X-Requested-With на це не впливає. Причина в порядку дій у billing.ts:388-414: handler спершу викликає `await ensurePlataPubkey()` і лише потім дивиться на X-Sign. У plata.ts:92-107 на холодному кеші ця функція робить fetch на monopay /pubkey з `getToken()`, а getToken кидає BillingConfigurationError, коли PLATA_TOKEN не заданий (plata.ts:51-53).

Stripe і LiqPay на тому ж стеку відповідають чистим 400 на відсутній підпис, тож Plata тут непослідовна.

Це стосується і проду, а не лише локального оточення:
(а) PLATA_ENABLED за замовчуванням false (env.ts:420), а роути монтуються безумовно. Тож на проді без PLATA_TOKEN кожен анонімний POST дає 500, error-лог зі stack і Sentry.captureException: errorHandler.ts:90-93 шле в Sentry всі 5xx. Це шум у логах і витрата квоти Sentry.
(б) З токеном: cachedPubkey оновлюється тільки при успішному fetch, а cooldown діє лише для force-гілки. Тому під час збою monopay /pubkey після спливання TTL кожен непідписаний запит робить вихідний fetch із merchant-токеном, і всі вебхуки, включно зі справжніми, отримують 500.

Виток …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Перевірка: <scratch>/agents/verify-api-live-unauth-sweep/01-verify.mjs.
- plata-charge і plata-status повертають 500 `{"error":"Server error","code":"INTERNAL"}` як із csrf, так і без csrf.
- stripe-webhook повертає 400 «Invalid Stripe signature», liqpay-callback повертає 400 «Invalid LiqPay signature».
- Лог сервера для requestId 63951f5c-47f0-4011-909d-aa3a128ada12: `BillingConfigurationError: PLATA_TOKEN is not set at getToken (plata.ts:53) at ensurePlataPubkey (plata.ts:99) at billing.ts:394`.
- Попередня знахідка F30 про те, що CSRF-гейт блокує вебхуки, на HEAD уже неактуальна: запит без X-Requested-With доходить до handler-а.
```

<a id="rel-29"></a>

### `rel-29` [low] Тижнева перевірка бекапу БД нічого не перевіряє, а ранбук відновлення спирається на недосяжний публічний URL

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** ops: CI / DR
- **Де:** .github/workflows/db-backup-verify.yml:75-100,150-200; docs/start/instructions/database-backup-restore.md:53-55; apps/server/AGENTS.md:42
- **Першопричина:** db-backup-verify.yml робить pg_dump з MIGRATE_DATABASE_URL, а такого секрету немає: за apps/server/AGENTS.md:42 публічного порту бази на Coolify немає. Без секрету job мовчки падає в migration-only прогін і світиться зеленим. Справжніх артефактів бекапу Coolify чи S3 він не відновлює ніколи.
- **Вплив:** Відновлюваність прод-БД нічим не підтверджена: останні 5 scheduled-прогонів зелені за ~1 хв і без жодних прод-даних. Інструкція DR на інциденті впреться в недосяжний хост. Якщо ж «полагодити» job відкриттям публічного порту суперкористувача, прод-база опиниться в інтернеті, а дамп — у CI публічного репо.
- **Що зробити:** Відновлювати останній артефакт бекапу зі сховища в ефемерний Postgres і падати, якщо бекапу немає або він старший за N годин. Публічний порт БД не відкривати. Прибрати лічильники користувачів і сесій зі step summary. Оновити database-backup-restore.md під фактичну топологію: термінал Coolify або SSH-тунель.
- **Примітка:** Фіндер ставив medium. Верифікатор підтвердив за логами GitHub Actions і знизив до low, бо самі бекапи Coolify можуть існувати. Чи вони є, з репо не видно: це залежить від налаштувань Coolify.

Знахідок у кластері: 1.

#### [low] Тижнева «перевірка бекапу» і ранбук відновлення розраховані на публічний URL Postgres, якого (за документацією сервера) немає; справжні бекапи не перевіряються взагалі

- **ID:** `client-static/infra-headers-ci-deps#3` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** .github/workflows/db-backup-verify.yml:75-100 (pg_dump з secrets.MIGRATE_DATABASE_URL), рядки зі STEP_SUMMARY ~150-200; docs/start/instructions/database-backup-restore.md:53-55; apps/server/AGENTS.md:42
- **Вплив:** Відновлюваність прод-БД ніщо не підтверджує: тижневий «зелений» статус нічого не каже про бекапи, а інструкція DR на інциденті впреться в недосяжний хост. Друга половина ризику: якщо «полагодити» job відкриттям публічного порту суперкористувача postgres, прод-база стає досяжною з інтернету, а дамп опиняється в CI публічного репо.
- **Рекомендація:** Перевіряти саме артефакти бекапу: завантажувати останній бекап зі сховища (S3/Coolify) і відновлювати його в ефемерний Postgres; job має падати, якщо бекапу немає або він старший за N годин. Публічний порт БД не відкривати. Прибрати лічильники користувачів і сесій зі step summary або маскувати їх. Узгодити database-backup-restore.md з фактичною топологією (термінал ресурсу в Coolify або SSH-тунель).

**Докази:**

```text
Workflow: «Requires MIGRATE_DATABASE_URL in GH Secrets — the public Coolify Postgres connection string»; без секрету: `::warning::... falling back to migration-only verify (no production data)` і job зелений. Ранбук: `export PGURL="$MIGRATE_DATABASE_URL"  # postgresql://postgres:<pass>@<api-host>:5432/postgres`. Водночас apps/server/AGENTS.md:42: «На Coolify це те саме значення — внутрішнє імʼя контейнера бази, публічного порту в неї немає ... з робочої машини ця база недосяжна». Тобто з GitHub-раннера дамп або не робиться (тихий fallback на «зелений» migration-only прогін), або падає. Сам job робить `pg_dump` живої БД і жодного разу не відновлює реальний артефакт бекапу (Coolify/S3). Якщо ж публічний порт колись відкриють: повний прод-дамп (сесії, акаунти, фінансові дані) опиняється на раннері вже публічного репо, разом із `pnpm install`, а кількості users/accounts/sessions/mono_conn пишуться в $GITHUB_STEP_SUMMARY, який для публічного репо видно будь-кому.
```

**Відтворення:**

```text
Прочитати db-backup-verify.yml:75-100 і крок «Smoke-test schema integrity» (ROW_COUNTS -> STEP_SUMMARY); порівняти з apps/server/AGENTS.md:42 і database-backup-restore.md:53-55.
```

**Верифікатор:**

```text
Підтверджено живими прогонами GitHub Actions. Останні 5 scheduled-прогонів «Weekly DB backup verify» (2026-08-16..2026-09-13) зелені, тривають близько 1 хв і мають анотацію `MIGRATE_DATABASE_URL not configured — falling back to migration-only verify (no production data)`. Лог: `Running migrations against empty DB`. Job, отже, жодного разу не дампив і не відновлював нічого з проду. Справжні бекапи Coolify (scheduled backups / S3) він за задумом не чіпає взагалі. apps/server/AGENTS.md:42 прямо каже, що публічного порту в БД немає, тож рецепт `PGURL=$MIGRATE_DATABASE_URL` з database-backup-restore.md §1 з раннера чи ноутбука не спрацює. Severity знижено до low. Це засіб контролю defense-in-depth, а fallback у зелене задуманий і позначений ::warning::. Що бекапів немає, не доведено. Ризик витоку лічильників у STEP_SUMMARY гіпотетичний, бо секрету немає.
```

**Додаткові докази верифікатора:**

```text
gh run list --workflow db-backup-verify.yml: 34748035911 (2026-09-13, success, 1m2s) і ще 4 зелені. gh run view 34748035911: ANNOTATIONS «MIGRATE_DATABASE_URL not configured — falling back to migration-only verify», лог «Running migrations against empty DB (migration-only verify)». Повʼязане, але інше: DG-25 у docs/work/specs/audits/2026-09-23-docs-governance-audit.md (job «не виконується») не фіксує, що він і раніше не дампив нічого.
```

<a id="rel-30"></a>

### `rel-30` [low] migration-down-drill нічого не порівнює: Phase C знову починає з порожньої схеми

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** ops: CI міграцій
- **Де:** scripts/migration-down-drill.mjs:22-30,95-99,125-131,282,297-310; .github/workflows/ci.yml:1213-1221
- **Першопричина:** applyForward() перед ups викликає resetSchema() (DROP SCHEMA public CASCADE) і в Phase A, і в Phase C. Тож Phase D порівнює два детерміновані прогони на свіжій схемі, а стан після Phase B (downs) не знімається ніде.
- **Вплив:** Обов'язковий для deploy-api гейт дає хибну впевненість. Down, що лишає об'єкти або не відкочує зміну, проходить CI, а повторний up після ручного rollback під час інциденту може впасти.
- **Що зробити:** Після Phase B знімати fingerprint і порівнювати зі схемою міграцій, які не мають down. Phase C робити без resetSchema, тобто ups поверх відкоченої схеми, і порівнювати з A. Виправити заголовок скрипта й коментар у ci.yml.
- **Примітка:** Фіндер ставив medium.

Знахідок у кластері: 1.

#### [low] migration-down-drill нічого не порівнює: Phase C скидає схему, тож fingerprint A === C завжди

- **ID:** `server-static/db-migrations#4` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** scripts/migration-down-drill.mjs:22-30, 95-99, 125-131, 282, 297-310; .github/workflows/ci.yml:1213-1221
- **Вплив:** Обовʼязковий для деплою гейт (needs у deploy-api) дає хибну впевненість: down, що лишає обʼєкти або не відкочує зміну, проходить CI; повторний up після ручного rollback в інциденті може впасти. Ловиться лише помилка виконання самого down.
- **Рекомендація:** Після Phase B знімати fingerprint і порівнювати з fingerprint схеми, яку дають лише міграції без down (001-005, 007, 011, 034); Phase C робити БЕЗ resetSchema (ups поверх відкоченої схеми) і тоді порівнювати з A. Виправити заголовок і коментар у ci.yml.

**Докази:**

```text
`async function applyForward(client, files) { await resetSchema(client); for (const f of files) ... }` — resetSchema = `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public`. Phase A = applyForward(ups); Phase B = downs у зворотному порядку; Phase C = applyForward(ups) знову з порожньої схеми (:297). Phase D порівнює два детерміновані прогони ups на свіжій схемі — вони ідентичні за побудовою. Стан після Phase B ніде не перевіряється. Заголовок ("If a down migration ever leaks state ... the drill fails") і ci.yml:1218-1221 («re-apply all ups → fingerprint-compare ... Any drift fails the build») описують перевірку, якої немає.
```

**Відтворення:**

```text
Прочитати applyForward/main; або додати до будь-якого .down.sql лишній `CREATE TABLE leak(x int)` — drill лишиться зеленим (Phase C все одно починає з DROP SCHEMA).
```

**Верифікатор:**

```text
Verified in code. applyForward() calls resetSchema() (DROP SCHEMA public CASCADE; CREATE SCHEMA public) before applying the ups, and main() uses it for both Phase A and Phase C. So Phase D compares two deterministic forward runs on a fresh schema, and the state left by Phase B is never fingerprinted. A down that leaks objects or fails to revert a change passes. The header's claim ('If a down migration ever leaks state ... the drill fails') and the ci.yml comment ('Any drift fails the build') describe a check that does not exist. I downgrade to low: the drill still fails on any SQL error while executing the downs in reverse, which catches the most common breakage (a reference to a dropped column, a missing object without IF EXISTS). Per the script header, downs are local-only and production never runs them, so the impact is false confidence in a non-prod rollback path, not a prod risk.
```

**Додаткові докази верифікатора:**

```text
scripts/migration-down-drill.mjs: `async function applyForward(client, files) { await resetSchema(client); ... }`, called for both phases. Header line 'Phase C — fresh schema → apply all ups again' contradicts the Phase D rationale. docs/work/specs/audits/2026-08-04-test-coverage-depth-audit.md cites migration-down-drill as part of an exemplary integration layer and does not notice the vacuous comparison.
```

<a id="rel-31"></a>

### `rel-31` [low] Graceful shutdown пропускає зупинку фонових воркерів, якщо HTTP-drain триває понад 4,5 с

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: lifecycle
- **Де:** apps/server/src/index.ts:367-382,447-452,485-524,546-553; apps/server/src/env/env.ts:462,473
- **Першопричина:** За дефолтів (GRACE 5000, HARD 9000) tailReserve = 4000, а graceMs = 4500. Якщо server.close() за цей час не завершився (стрім чату, перший хід AI на 7-14 с), runBackgroundStop отримує 0 мс. Усі воркери, зокрема reminderScheduler, отримують shutdown_phase_skipped, після чого закривається пул.
- **Вплив:** Деплой, що збігся з довгим запитом і хвилинним проходом нагадувань, лишає нагадування застовпленими в push_reminder_log, але не надісланими, і користувач їх не отримає зовсім. Коментар у коді вимагає уникати саме цього.
- **Що зробити:** Резервувати під зупинку reminderScheduler фіксовану частку бюджету (наприклад 1 с) або зупиняти воркери до чи паралельно з HTTP-drain. Як мінімум узгодити коментар із фактичною політикою.

Знахідок у кластері: 1.

#### [low] Бюджет graceful shutdown: після повного HTTP-drain кожна зупинка фонових воркерів отримує 0 мс і пропускається, зокрема reminderScheduler, хоча коментар вимагає його дочекатися

- **ID:** `server-static/reliability-ops#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/index.ts:367-382 (phaseBudgetMs, tailReserveMs), 447-452 (runBackgroundStop), 485-524 (HTTP drain), 546-553 (reminder_scheduler)
- **Вплив:** Якщо деплой збігається з довгим запитом і хвилинним проходом нагадувань, частина нагадувань у цю хвилину застовплена в push_reminder_log, але не надіслана, і користувач не отримає їх зовсім. Аналогічно перериваються in-flight тіки інших полерів (безпечно лише для ідемпотентних).
- **Рекомендація:** Резервувати для background-stop фіксовану частку (наприклад, 1 с на reminder scheduler) або зупиняти воркери ДО/паралельно з HTTP-drain, а не після. Як мінімум узгодити коментар reminderScheduler з фактичною політикою.

**Докази:**

```text
Дефолти: SHUTDOWN_GRACE_MS=5000, HARD=9000. deadline = now+8500. tailReserve = floor(5000/2)+750*2 = 4000. graceMs = min(5000, 8500-4000) = 4500. Якщо server.close() не завершився за 4500 мс (будь-який запит у польоті довше 4,5 с: SSE чату, перший хід AI ~7-14 с, аналіз фото), то remaining ~ 4000 і runBackgroundStop бере min(1000, 4000-4000) = 0 -> `shutdown_phase_skipped` для всіх 6-12 воркерів. Далі пул закривається. Коментар index.ts:547-550: «Закрити пул під ним означало б, що людина не отримає нагадування ВЗАГАЛІ — рядок дедупу є, пуша немає».
```

**Відтворення:**

```text
Відкрий довгий запит (стрім /api/chat), надішли SIGTERM: у логах послідовність shutdown_grace_expired_closing_all, потім shutdown_phase_skipped для reminder_scheduler/gdpr/... і pg_pool_end.
```

**Верифікатор:**

```text
Арифметику перевірено за кодом index.ts і дефолтами env.ts:462,473 (GRACE 5000, HARD 9000). deadline = now+8500; tailReserveMs = floor(5000/2) + 750*2 = 4000; graceMs = min(5000, 8500-4000) = 4500. Якщо server.close() не встиг за 4500 мс, залишок ≈4000-ε, і runBackgroundStop бере min(1000, залишок-4000), що ≤ 0. Отже, `shutdown_phase_skipped` отримують усі зупинки воркерів, зокрема reminder_scheduler, після чого закривається пул. Пропуск полерів у шапці коду названо свідомим компромісом, бо «вони ідемпотентні» (runBackgroundStop, tailReserveMs). Але reminder sweep робить claim-before-send (sweep.ts:29-35), тож він неідемпотентний, і коментар у index.ts:547-550 прямо вимагає його дочекатися. Суперечність реальна. Severity low: потрібен збіг довгого запиту понад 4,5 с (SSE чату) з хвилинним проходом нагадувань у мить SIGTERM. Наслідок (втрачене нагадування на добу) sweep.ts і так приймає як прийнятну сторону помилки. Навіть без пропуску scheduler.stop чекає лише STOP_DRAIN_MS=1000.
```

**Додаткові докази верифікатора:**

```text
Живий SIGTERM не надсилав, бо бриф забороняє зупиняти сервер. Перевірка лише за кодом: phaseBudgetMs (index.ts) = max(0, min(nominal, remaining - reserve)); runBackgroundStop передає reserve = tailReserveMs() = 4000; HTTP-drain бере ту саму резерву, тому за повного grace залишок дорівнює рівно резерву.
```

<a id="rel-32"></a>

### `rel-32` [low] Один «отруйний» чек Сільпо (NUL-символ чи інша помилка БД) назавжди ламає синк користувача

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: Сільпо receipts
- **Де:** apps/server/src/modules/silpo/receipts.ts:691-695,704-718; apps/server/src/modules/silpo/receiptsUpsert.ts:114-130
- **Першопричина:** Цикл upsertReceipt у receipts.ts не має try/catch. Рядки з U+0000 перед записом у JSONB і TEXT не санітизуються. recordSyncFailure викликається лише на помилках MCP, тож виняток БД виходить як 500.
- **Вплив:** Людина з таким чеком більше не отримує ні нових чеків, ні лінків. UI збою не показує (last_error_code порожній), а полер щогодини повторює спробу і сипле 5xx у Sentry.
- **Що зробити:** Огорнути кожен upsertReceipt у try/catch: пропускати чек і логувати форму помилки. Видаляти U+0000 з рядків, обмежити розмір raw і викликати recordSyncFailure також для не-MCP винятків.
- **Примітка:** Зламаний акаунт, який так з'являється, потрапляє в чергу без backoff з rel-33.

Знахідок у кластері: 1.

#### [low] Один «отруйний» чек (NUL-символ у будь-якому полі чи інша помилка БД) назавжди ламає весь синк користувача і не записується як збій

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#9` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/silpo/receipts.ts:704-718 (цикл upsertReceipt без try/catch), :691-695 (recordSyncFailure лише для MCP-помилок); apps/server/src/modules/silpo/receiptsUpsert.ts:114-130 (JSON.stringify(receipt.raw) у JSONB)
- **Вплив:** Людина з таким чеком більше ніколи не отримує нових чеків і лінків. UI не показує збою (last_error_code порожній), а в Sentry сиплеться 5xx.
- **Рекомендація:** Огорнути кожен upsertReceipt у try/catch: логувати форму помилки й пропускати чек. Санітизувати рядки (видаляти \u0000) перед записом. Обмежити розмір raw. Для не-MCP винятків теж викликати recordSyncFailure.

**Докази:**

```text
Увесь сирий order пишеться в JSONB, назва позиції в TEXT. psql: `select $$"x\u0000y"$$::jsonb -> ERROR: unsupported Unicode escape sequence`; `select 'abc' || chr(0) -> ERROR: null character not permitted`. Помилка upsertReceipt виходить з pullAndSyncReceipts як не-AppError, тобто 500. Наступні чеки не вставляються, matchAndLink не біжить, recordSyncFailure не викликається (last_failed_at не ставиться). Полер повторює щогодини безкінечно. Принцип файлу «a receipt/item that doesn't parse is DROPPED ... never crashes the sync» на рівні БД не виконується.
```

**Відтворення:**

```text
psql -c "select \$\$\"x\\u0000y\"\$\$::jsonb" (read-only), далі статично: чек Сільпо з \u0000 у назві товару -> кожен POST /api/silpo/sync = 500
```

**Верифікатор:**

```text
Підтверджено. Цикл у receipts.ts:707-716 викликає upsertReceipt без try/catch. recordSyncFailure (:694) викликається лише в гілці `!call.ok`, тобто на помилках MCP і токенів. Помилка БД з upsertReceipt виходить із pullAndSyncReceipts як не-AppError. syncHandler -> withSyncDiagnosis повертає її без змін (routes/silpo.ts:388-390), далі errorHandler віддає 500. Наступні чеки, matchAndLink і оновлення last_sync_at не виконуються, last_error_code не ставиться. Санітизації NUL у модулі немає (grep u0000/\x00/sanitiz дав 0). Поведінку PG перевірив через справжній драйвер `pg` на read-only SELECT. `$1::jsonb` з JSON.stringify({name:'x\u0000y'}) дає ERR 22P05 «unsupported Unicode escape sequence», а `$1::text` з 'x\u0000y' дає ERR 22021 «invalid byte sequence for encoding UTF8: 0x00». Окрім того, `{"a":"\ud800"}::jsonb` (одинокий сурогат, який JSON.stringify теж пропускає) падає з «Unicode low surrogate must follow a high surrogate». Оскільки last_sync_at не оновлюється, полер щогодини знову бере цього користувача (минає поріг 8 год). Принцип заголовка файлу «never crashes the sync» на рівні БД справді не виконується. Severity low, бо тригер (NUL або одинокий сурогат будь-де в сирому order) …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Скрипт: <scratch>/agents/verify-server-static-gap-silpo-and-shared-product-catalog/nul.mjs (лише SELECT) -> `ERR 22P05 unsupported Unicode escape sequence` / `ERR 22021 invalid byte sequence for encoding "UTF8": 0x00`. psql: `select $${"a":"\ud800"}$$::jsonb` -> invalid input syntax for type json.
```

<a id="rel-33"></a>

### `rel-33` [low] Фоновий синк Сільпо без backoff: акаунти, що постійно падають, щотіку йдуть першими й витісняють решту

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: Сільпо syncAll
- **Де:** apps/server/src/modules/silpo/syncAll.ts:87-98,108-125; apps/server/src/modules/silpo/receipts.ts:646-667; apps/server/src/routes/internal/silpo.ts:18-56
- **Першопричина:** Кандидати сортуються за last_sync_at ASC NULLS FIRST LIMIT 100, а провал змінює лише last_failed_at. Internal /sync-all (до 500 акаунтів) виконується синхронно в HTTP-запиті і не перевіряє poller.running. Розподіленого lock немає.
- **Вплив:** Сотня зламаних акаунтів зупиняє автоматичний синк чеків для всіх інших, а повтори без backoff щогодини палять спільну квоту client_id. Після 408 оператор повторює виклик і запускає другий паралельний обхід тих самих людей.
- **Що зробити:** Вести next_attempt_at з експоненційним backoff і сортувати за ним. Брати lease на користувача (UPDATE ... sync_lease_until). Internal-роут запускати асинхронно (202) з перевіркою «вже біжить».

Знахідок у кластері: 1.

#### [low] Фоновий синк Сільпо без backoff: акаунти, що постійно падають, ідуть першими щотіку й можуть витіснити решту; internal /sync-all не взаємовиключний з полером

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#10` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/silpo/syncAll.ts:87-98, :108-125; apps/server/src/modules/silpo/receipts.ts:646-667 (recordSyncFailure не чіпає last_sync_at); apps/server/src/routes/internal/silpo.ts:18-56
- **Вплив:** Сотня «зламаних» акаунтів зупиняє автоматичний синк чеків для всіх інших. Повтори без backoff щогодини витрачають спільну квоту client_id. Подвійні прогони посилюють гонку дублювання позицій.
- **Рекомендація:** Вести next_attempt_at з експоненційним backoff по last_failed_at і сортувати за нею. Брати lease (UPDATE ... SET sync_lease_until = now()+X WHERE ... RETURNING) на кожного користувача, щоб полер, internal-роут, кнопка й репліки не перетиналися. internal-роут запускати асинхронно (202) з перевіркою «вже біжить».

**Докази:**

```text
Кандидати: `WHERE status='connected' AND (last_sync_at IS NULL OR last_sync_at < NOW()-8h) ORDER BY last_sync_at ASC NULLS FIRST LIMIT 100`. Провал синку оновлює лише last_failed_at, тож акаунт, що падає, щогодини знову перший, без жодного backoff. Якщо таких >= 100 (усі, хто жодного разу не синкнувся успішно, мають NULL і стоять першими), здорові акаунти не синкаються взагалі. POST /api/internal/silpo/sync-all (limit до 500) виконується синхронно в HTTP-запиті і не перевіряє poller.running. При 120 с requestTimeout оператор отримує 408, а прогін іде далі у фоні, тож повтор запускає другий паралельний обхід тих самих людей. Розподіленого lock-а між репліками немає.
```

**Відтворення:**

```text
Статично: прочитати syncAll.ts:87-125 і receipts.ts:646-667; змоделювати 100+ підключень із постійною помилкою (наприклад, отруйний чек вище)
```

**Верифікатор:**

```text
Логіку підтверджено в коді. Кандидатів syncAll.ts:87-98 сортує за `last_sync_at ASC NULLS FIRST LIMIT 100`, а провал (recordSyncFailure, receipts.ts:646-667) змінює лише last_failed_at і last_error_code. Тож акаунт, що постійно падає, лишається зі старим або NULL last_sync_at і щогодини стоїть першим. Backoff немає, last_failed_at у вибірці не враховується. Internal-роут виконує прогін синхронно (до 500 акаунтів, пауза 250 мс плюс MCP-виклики) і не перевіряє poller.running. Глобальний requestTimeout (REQUEST_TIMEOUT_MS = 120_000, http/requestTimeout) віддає 408, а обробник працює далі, тож повторний виклик запускає паралельний обхід. Пом'якшення: акаунти з auth-збоєм переходять у status='reauth_required' і з вибірки випадають. Глобальні збої (Сільпо лежить, schema_drift, rate_limited) б'ють по всіх однаково, тож витіснення там нічого не змінює. Для голодування здорових акаунтів потрібно 100 і більше підключень із постійною per-user помилкою (наприклад, як у #9), чого на масштабі беті немає. Internal-роут є ручним ops-інструментом за INTERNAL_API_KEY. Тому severity low, ближче до info.
```

**Додаткові докази верифікатора:**

```text
apps/server/src/env/env.ts:36 REQUEST_TIMEOUT_MS: intFromEnv(120_000); syncScheduler.ts:150-152 `if (this.running || this.stopping) return null` захищає лише сам полер; routes/internal/silpo.ts:44 без перевірки «вже біжить».
```

<a id="rel-34"></a>

### `rel-34` [low] Один користувач може вичерпати глобальний добовий бюджет Voyage і вимкнути пам'ять AI для всіх

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: ai-memory
- **Де:** apps/server/src/routes/me.ts:229-257; apps/server/src/modules/ai-memory/profileMirror.ts:97,315-334; apps/server/src/modules/ai-memory/voyageBudget.ts; apps/server/src/modules/ai-memory/service.ts:201-213,331-337
- **Першопричина:** PUT /api/me/profile (60 за 5 хв) дзеркалить memoryBank в ai_memories, і кожен змінений текст факту дає новий embed. Бюджет Voyage глобальний на процес (soft 1 USD, hard 5 USD), а per-user ліміту ембеддингів немає, хоча коментар у routes/ai-memory.ts його обіцяє.
- **Вплив:** Після soft-cap для всіх пропускається non-critical ingest, після hard-cap — і recall/RAG у чаті, аж до UTC-півночі. Гроші обмежені стелею, але фіча падає глобально через один акаунт.
- **Що зробити:** Додати per-user денний ліміт ембеддингів для source=profile і дебаунс дзеркалення профілю. Винести лічильник бюджету в спільне сховище, щоб він не обнулявся при рестарті.
- **Примітка:** Наживо не перевірено: локально AI_MEMORY_ENABLED=false і немає VOYAGE_API_KEY. Верифікатор підтвердив механізм у коді, але вважає масштаб перебільшеним.

Знахідок у кластері: 1.

#### [low] Один користувач може вичерпати глобальний добовий бюджет Voyage і вимкнути памʼять AI для всіх (PUT /api/me/profile з постійно змінними фактами)

- **ID:** `server-static/ai-layer#8` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/me.ts:229-257; apps/server/src/modules/ai-memory/profileMirror.ts:97, 315-334; apps/server/src/modules/ai-memory/voyageBudget.ts (in-process, без per-user ліміту); apps/server/src/modules/ai-memory/service.ts:201-213, 331-337; apps/server/src/env/env.ts:671-673
- **Вплив:** Відмова в обслуговуванні функції памʼяті AI (запис фактів і RAG у чаті) для всіх користувачів на решту доби силами одного автентифікованого акаунта; гроші обмежені стелею, але фіча падає глобально.
- **Рекомендація:** Додати per-user денний ліміт ембеддингів (кількість або токени) у service.remember/enqueueMemoryIngest для source=profile; дебаунс дзеркалення (не частіше ніж раз на N хвилин на юзера); винести лічильник бюджету в спільне сховище (Redis/ai_usage_daily), щоб він не обнулявся при рестарті.

**Докази:**

```text
Ліміт PUT /api/me/profile -- 60/5хв на юзера (ipLimit 300/5хв). Кожен PUT дзеркалить memoryBank у ai_memories: змінений текст факту -> новий embed (dedupeSalt = відбиток змісту, near-dup guard для profile не діє, бо sourceRef != null). Бюджет Voyage -- лише глобальний на процес (VOYAGE_DAILY_BUDGET_USD_SOFT=1, HARD=5), per-user квоти в service.remember немає, попри коментар у routes/ai-memory.ts («Точніший анти-абʼюз -- Voyage квотою (per-user)»). Після soft-cap пропускаються всі non-critical ingest (дайджест, профіль) для всіх; після hard -- і recall/RAG (service.ts:331) для всіх до UTC-півночі.
```

**Відтворення:**

```text
Скрипт від одного (або кількох) акаунтів: щохвилини PUT /api/me/profile з ~16 KB memoryBank, де текст кожного факту щоразу змінюється. Наживо не перевірено: локально AI_MEMORY_ENABLED=false і немає VOYAGE_API_KEY.
```

**Верифікатор:**

```text
The core claim checks out in the code, but its scope is overstated. PUT /api/me/profile (me.ts:229-257, 60/5 min per user, ipLimit 300/5 min) mirrors memoryBank through mirrorProfileMemoryEntries. A changed fact text means forgetSource plus enqueueMemoryIngest with a new dedupeSalt. Up to 200 facts of up to 500 chars fit in the 16 KB payload. No per-user cap on embeds exists anywhere: not in profileMirror, not in enqueueMemoryIngest, not in service.remember. The routes/ai-memory.ts comment promises one 'у service.remember()', but it is not there. The budget is one in-process counter shared by all users (voyageBudget.ts, SOFT=1, HARD=5). At the default model voyage-3.5-lite ($0.02/MTok), the $1 soft cap is 50M tokens. One account at the full rate is 17,280 PUT/day at about 4-8k tokens each, roughly $1.4-2.8/day, so it crosses the soft cap in about 9-17 h. Five accounts behind one IP do it in about 2-3.5 h. After the soft cap, every remember() is non-critical, so all profile-mirror and digest ingestion is skipped for everyone until UTC midnight or a process restart. CORRECTION: the hard-cap/recall part of the finding is wrong for this vector. callVoyage runs checkVoyageSoftBudget BEF …[обрізано]
```

**Додаткові докази верифікатора:**

```text
embeddings.ts:274-288 (soft preflight before fetch, non-critical -> throw); service.ts:201-213 (hard gate), 223-245 (soft skip returns silently, no retry); voyageBudget.ts:263 allow = criticality==='critical'; env.ts:563 default model voyage-3.5-lite, embeddings.ts pricing 0.02 $/MTok; packages/shared api.ts:317 USER_PROFILE_MAX_BYTES=16KB; profileMirror.ts:97 cap 200, 108 content 500 chars.
```

<a id="rel-35"></a>

### `rel-35` [low] Анонімні /api/barcode і /api/food-search спалюють спільні добові квоти UPCitemdb і USDA DEMO_KEY

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: nutrition barcode / food-search
- **Та сама першопричина, що й** [`sec-24`](./security.md#sec-24): Той самий дефект: анонімні /api/barcode і /api/food-search спалюють спільні добові квоти UPCitemdb і USDA.
- **Де:** apps/server/src/routes/barcode.ts:21-36; apps/server/src/modules/nutrition/barcode.ts:331-380,444; apps/server/src/routes/food-search.ts:20-29
- **Першопричина:** Анонімний добовий ліміт barcode — 300 запитів на IP, тоді як тріал UPCitemdb дає 100 запитів на добу на весь продукт. Глобального лічильника на апстрім немає, а USDA без ключа падає на DEMO_KEY.
- **Вплив:** Один анонімний клієнт за кілька хвилин (100 унікальних кодів, яких немає в OFF і USDA) вимикає третє джерело каскаду для всіх до кінця доби. Після 429 від апстріму користувачі отримують 503 «бази не відповідають».
- **Що зробити:** Додати глобальний добовий лічильник на кожен лімітований апстрім, менший за його квоту, і пропускати апстрім при вичерпанні. Опитувати UPCitemdb лише для автентифікованих. Задати USDA_FDC_API_KEY у проді й перевіряти його на старті.
- **Примітка:** Уже згадано в product-knowledge-nutrition.md (E7), 2026-08-05-external-critique-surface.md (§2.4) і security-comprehensive-2026-08-04.md. Обхід per-IP через підроблений X-Forwarded-For — локальний артефакт: у проді Traefik дописує крайній запис сам. Див. також rel-03.

Знахідок у кластері: 2.

#### [low] Анонімний /api/barcode (та /api/food-search) спалює спільну добову квоту upstream'ів; per-IP відро обходиться підробкою X-Forwarded-For

- **ID:** `server-static/gap-blocked-input-route-findings#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Уже відстежується:** docs/work/specs/audits/product-knowledge-nutrition.md (E7: UPCitemdb trial 100/день, USDA DEMO_KEY) та docs/work/specs/audits/2026-08-05-external-critique-surface.md (§2.4)
- **Де:** apps/server/src/routes/barcode.ts:21-31 (300/добу per-IP) + modules/nutrition/barcode.ts:331-380 (UPCitemdb trial 100/добу на весь проєкт); routes/food-search.ts:20-29 (600/добу per-IP, USDA DEMO_KEY); getIp apps/server/src/http/rateLimit.ts:92-98
- **Вплив:** Анонімний актор (одна адреса з ротацією XFF під проксі, або просто 100 запитів) вичерпує спільну 100/добу квоту UPCitemdb → третє джерело каскаду barcode мертве для всіх на добу; аналогічно USDA DEMO_KEY для food-search. Коли upstream віддає 429, isTransientHttpStatus→throw→503 «бази не відповідають» усім користувачам.
- **Рекомендація:** Для barcode/food-search ввести глобальне добове відро на кожен upstream (як для ДПС), а не лише per-IP. Перевірити коректність TRUST_PROXY під фактичним ланцюгом Vercel→Traefik, щоб req.ip не був client-controlled; за потреби ключувати анонімні відра не лише по req.ip. Перевести trial-ключі UPCitemdb/USDA на платні або кешувати агресивніше.

**Докази:**

```text
barcode.ts коментар сам визнає: UPCitemdb trial = 100 запитів/добу на весь проєкт, а per-IP добовий ліміт = 300. getIp() повертає req.ip, який під app.set('trust proxy', TRUST_PROXY) (config default 1) береться з X-Forwarded-For. Жива перевірка (xff.mjs): GET /api/barcode з X-Forwarded-For:198.51.100.7 веде власний бакет (Remaining лишився 299), тоді як 127.0.0.1/none ділять інший (299→298) — тобто змінюючи XFF, клієнт отримує новий per-IP бакет. Каскад послідовний: кожен не-hit доходить до UPCitemdb.
```

**Відтворення:**

```text
node xff.mjs — показує, що per-IP добовий лічильник barcode ключується на client-controlled X-Forwarded-For; ротація XFF дає необмежену кількість свіжих 300/добу відер, кожне з яких веде на UPCitemdb (100/добу загалом).
```

**Верифікатор:**

```text
Підтверджено лише частково. Обхід per-IP через підробку X-Forwarded-For є артефактом локального середовища. Локально клієнт підключається напряму, і trust proxy=1 довіряє його XFF. У проді api.sergeant.com.ua резолвиться прямо на 167.233.98.92 (Hetzner/Coolify Traefik, CDN немає: ні cf-ray, ні via), TRUST_PROXY за замовчуванням 1 (config.ts, env-vars.md). Express бере крайній правий запис, який дописує Traefik, і клієнт на нього не впливає. Справжня частина така: анонімний добовий ліміт 300 на IP більший за спільну trial-квоту UPCitemdb 100/добу на весь проєкт. Одна адреса за ~100 випадкових штрихкодів, яких немає в OFF/USDA, вичерпує третє джерело. Після 429 isTransientHttpStatus→upstreamThrew дає 503, і результат не кешується. Наслідок відчують лише штрихкоди, яких немає в OFF/USDA, тобто помірний. Ризик trial-квоти вже позначено AI-DANGER у коді і зафіксовано в аудитах. До того ж органічний трафік і так її вичерпує, тож атака додає небагато.
```

**Додаткові докази верифікатора:**

```text
verify-.../apidns.mjs: api.sergeant.com.ua A [167.233.98.92], CNAME/AAAA немає. GET /livez → 200, заголовків server/cf-ray/via немає. routes/barcode.ts:21-31: 30/хв і 300/добу per-IP, коментар визнає ліміт UPCitemdb 100/добу. modules/nutrition/barcode.ts:167-169 трактує 429 як transient. Шлях upstreamThrew → 503 описано в handler, приблизно рядки 509-533.
```

#### [low] Анонімний /api/barcode дозволяє одній IP вичерпати проектну квоту UPCitemdb (100/добу на весь продукт): добовий ліміт на IP — 300

- **ID:** `api-live/ai-billing-integrations-live#12` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** apps/server/src/routes/barcode.ts:24-36 (30/хв і 300/добу на IP), apps/server/src/modules/nutrition/barcode.ts:335-345 (AI-DANGER: trial 100 запитів/добу на весь продукт), lookupUSDA з fallback на DEMO_KEY
- **Вплив:** Один анонімний клієнт за ~4 хв (100 унікальних кодів, яких немає в OFF/USDA) вимикає третє джерело каскаду для всіх користувачів до кінця доби. Так само з USDA DEMO_KEY, якщо в проді немає USDA_FDC_API_KEY.
- **Рекомендація:** Додати глобальний (не per-IP) добовий лічильник на UPCitemdb, менший за квоту тріалу, і пропускати апстрім, коли він вичерпаний. Опитувати UPCitemdb лише для автентифікованих або для запитів із сесією. Задати USDA_FDC_API_KEY у проді й перевіряти його на старті.

**Докази:**

```text
Анонімні запити доходять до платних/лімітованих апстрімів: після кількох анонімних сканів /metrics показує `barcode_lookups_total{source="upcitemdb",outcome="miss"} 4`, `{source="upcitemdb",outcome="hit"} 1` і вже `{source="usda",outcome="rate_limited"} 1`. GET /api/barcode?barcode=4820000000000 -> 200 source "upcitemdb" (CD-альбом «Circle Story - Uncovered Fears» з null-макросами). Лімітер: api:barcode 30/60 с і api:barcode:daily 300/24 год на IP. Коментар у роуті каже, що добовий бакет «обмежує саме це», але 300 > 100.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p3_food.mjs; node metrics.mjs "barcode_lookups". Вичерпання навмисно не відтворювалось, щоб не палити реальну квоту.
```

**Верифікатор:**

```text
Підтверджено в коді, вичерпання квоти навмисно не відтворювалось. /api/barcode відкритий без сесії (routes/barcode.ts:17-33). Лімітери: 30/хв і 300/добу на суб'єкта, для аноніма це IP. Коментар у роуті прямо каже, що добовий бакет «обмежує саме це», але сам модуль (barcode.ts:331-336, AI-DANGER, і :444) фіксує квоту тріалу UPCitemdb у 100 запитів на добу на весь продукт, тобто 300 > 100. Глобального лічильника чи бюджет-гварда для UPCitemdb немає, а grep по apps/server це підтверджує. Каталог і кеш (6 год для хітів, 30 хв для промахів) рятують лише повторні коди: унікальні коди, яких немає в OFF і USDA, щоразу доходять до UPCitemdb. Метрики поточного запуску показують, що каскад справді доходить до upcitemdb. Сам ризик анонімного вигорання квоти вже записаний у попередньому security-аудиті. Ця знахідка додає новий факт: доданий після нього добовий бакет недостатній. Дрібна неточність: в коді діють обидві назви змінної, USDA_FDC_API_KEY і USDA_API_KEY.
```

**Додаткові докази верифікатора:**

```text
y2_metrics.mjs (/metrics, без нових апстрім-запитів): barcode_lookups_total{source="upcitemdb",outcome="miss"} 1, {source="usda",outcome="miss"} 1, rate_limit_hits_total{key="api:barcode:daily",outcome="allowed"} 3. barcode.ts:491-510: послідовний каскад OFF → USDA → UPCitemdb без жодного гейта квоти. Реєстр verification/findings.json: EXT-20260805-2-4 (ліміти UPCitemdb/USDA) зі статусом open.
```

<a id="rel-36"></a>

### `rel-36` [low] Спільне добове відро токена ДПС списується навіть невалідними запитами, і один актор може його вичерпати

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** server: Фінік receipts/lookup
- **Де:** apps/server/src/routes/finyk.ts:46-72
- **Першопричина:** Глобальний лімітер finyk:dps-daily-budget (800 на добу, фіксований subject, failMode closed) стоїть перед хендлером, а parseBody виконується всередині хендлера, тож відповіді 400 теж списують квоту. Per-user частки немає.
- **Вплив:** Один користувач або кілька акаунтів за добу вичерпують спільні 800 запитів, і решта не може знайти чек за QR. Зараз шлях законсервований: DPS_QR_SCAN_ENABLED=false, а DPS_API_TOKEN у проді не задано.
- **Що зробити:** Списувати глобальне відро лише перед реальним викликом fetchDpsCheckXml, після валідації. Додати per-user частку глобальної квоти.
- **Примітка:** Латентно, поки реєстр ДПС закритий на час воєнного стану. Фіндер ставив medium.

Знахідок у кластері: 1.

#### [low] Глобальне спільне добове відро ДПС-токена (receipts/lookup) вичерпується одним актором; навіть невалідні (400) запити списують квоту

- **ID:** `server-static/gap-blocked-input-route-findings#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/routes/finyk.ts:46-72 (ліміт finyk:dps-daily-budget 800/добу, subject фіксований DPS_DAILY_GLOBAL_SUBJECT, failMode:'closed')
- **Вплив:** Один користувач (або анонімна серія ботів через per-user-гейт 30/хв у кілька акаунтів) за добу вичерпує 800 спільних токенів ДПС невалідними або валідними запитами → решта користувачів отримує відмову пошуку чека за QR на добу. У вебі зараз DPS_QR_SCAN_ENABLED=false (dpsQrGate.ts), але шлях досяжний через bulk-import-хук (useBulkReceiptsImport.ts) і прямий API/мобільний клієнт.
- **Рекомендація:** Не списувати глобальне відро на запитах, що не дійшли до реального виклику ДПС: перенести лічильник ПІСЛЯ валідації/перед самим fetchDpsCheckXml, або інкрементувати лише при фактичному зверненні до upstream. Розглянути per-user підлімітування частки глобальної квоти, щоб один актор не з'їв усе.

**Докази:**

```text
Другий rateLimitExpress із subject:()=>'dps-token-daily' — один бакет на ВСІХ користувачів (ДПС-токен спільний, квота провайдера ~1000/добу). Ліміт стоїть ПЕРЕД handler-ом і ПЕРЕД валідацією тіла (lookupReceiptHandler робить parseBody вже всередині). Жива перевірка (rl.mjs): POST /api/finyk/receipts/lookup з порожнім тілом → 400 VALIDATION, але RateLimit-Remaining впав 799→798 на двох невалідних запитах поспіль. Тобто навіть биті запити з'їдають спільне відро. failMode:'closed' означає: при деградації лімітера всі отримують відмову.
```

**Відтворення:**

```text
node rl.mjs: два POST з body:{} → 400, Remaining 799 потім 798 (спільний бакет 800/добу списується на невалідних запитах).
```

**Верифікатор:**

```text
Механізм підтверджено. У routes/finyk.ts глобальне відро 'finyk:dps-daily-budget' 800/добу з фіксованим subject стоїть перед lookupReceiptHandler, а parseBody виконується вже всередині handler. Тому невалідні запити (400) теж списують спільний бюджет. Severity знижую до low, бо шлях законсервований. DPS_QR_SCAN_ENABLED=false (dpsQrGate.ts). Згідно з коментарем там же, DPS_API_TOKEN у Coolify не додано, доки реєстр ДПС закритий на час воєнного стану. Без токена fetchDpsCheckXml повертає {status:'no_token'} і віддає 503 без жодного звернення до upstream. Вичерпати відро зараз означає заблокувати функцію, яка й так не працює. Спільне відро з failMode:'closed' є свідомим, задокументованим компромісом (докстрінг routes/finyk.ts). Справжній дефект один: невалідні тіла рахуються в бюджет. Його варто виправити до розконсервації.
```

**Додаткові докази верифікатора:**

```text
verify-.../rl.mjs: POST /api/finyk/receipts/lookup з body {} → 400 VALIDATION, RateLimit-Limit=800, Remaining=799. Валідний за формою body → 503 'Пошук чека за QR тимчасово недоступний…', Remaining=798. Тобто обидва запити списали глобальний бюджет, і жоден не дійшов до ДПС.
```

<a id="rel-37"></a>

### `rel-37` [low] POST /api/auth/send-verification-email без власного ліміту і без стелі на акаунт

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: auth (Better Auth)
- **Та сама першопричина, що й** [`sec-25`](./security.md#sec-25): Той самий дефект: send-verification-email (і change-email) без app-ліміту і без стелі на акаунт.
- **Де:** apps/server/src/routes/auth.ts:23-28; apps/server/src/auth.ts:345-409; node_modules/better-auth/dist/context/create-context.mjs:171
- **Першопричина:** Цей шлях не входить у підрядки authSensitiveRateLimit і authAccountRateLimit. auth.ts не задає rateLimit явно, тож вбудований лімітер Better Auth увімкнений лише при NODE_ENV=production (дефолт 3 запити за 60 с на IP).
- **Вплив:** Скрипт без Origin і без CSRF-заголовка змушує систему слати верифікаційні листи на чужу адресу. У проді розсилка з багатьох IP бомбить скриньку жертви і палить квоту Resend. У будь-якому non-production деплої весь catch-all /api/auth/* поза п'ятьма захищеними шляхами не має throttle.
- **Що зробити:** Додати send-verification-email і решту чутливих catch-all шляхів до власних auth-лімітерів з per-email бакетом або явно задати rateLimit.enabled=true у betterAuth, щоб не залежати від NODE_ENV.
- **Примітка:** Енумерації акаунтів не виявлено: відповідь іде за константні ~500 мс. Фіндер ставив medium.

Знахідок у кластері: 1.

#### [low] POST /api/auth/send-verification-email — анонімний тригер розсилки листів без власного ліміту і без per-account стелі (email-bomb), поза покриттям обох кастомних auth-лімітерів

- **ID:** `api-live/gap-better-auth-catchall-subroutes#2` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/routes/auth.ts:23-28; apps/server/src/auth.ts:345-409 (немає блоку rateLimit); upstream better-auth/dist/context/create-context.mjs:171 (enabled ?? isProduction), better-auth/dist/api/rate-limiter/index.mjs:377-383 (дефолт send-verification-email -&gt; 60s/max3 per-IP)
- **Вплив:** Будь-який скрипт (у т.ч. server-to-server без Origin) змушує систему слати верифікаційні листи на чужу адресу. У проді єдиний захист — дефолтний per-IP ліміт Better Auth 3/60с: per-account стелі немає зовсім, тож розподілена розсилка (ботнет IP) безмежно бомбить скриньку жертви (Resend); акаунти з REQUIRE_EMAIL_VERIFICATION=false (дефолт) лишаються unverified назавжди — постійна ціль. Гірше: у будь-якому non-production деплої (preview/staging, NODE_ENV!=production) весь catch-all /api/auth/* поза 5 підрядками не має жодного auth-throttlу. Репо гартує лише 5 шляхів, покладаючись на env-гейтнутий per-IP upstream-дефолт.
- **Рекомендація:** Додати до authSensitiveRateLimit/authAccountRateLimit покриття send-verification-email (і решти чутливих катч-ол шляхів) АБО явно задати rateLimit:{enabled:true,...} у betterAuth із per-account правилом, щоб не залежати від NODE_ENV. Додати per-email бакет для send-verification-email.

**Докази:**

```text
send-verification-email не входить ні в authSensitiveRateLimit, ні в authAccountRateLimit (їх підрядки: sign-in/sign-up/forget-password/request-password-reset/reset-password). Upstream-лімітер Better Auth увімкнений лише при NODE_ENV===production. Жива перевірка (dev): burst 7x POST одному email -> [200,200,200,200,200,200,200], any429=false. existing(unverified) vs ghost -> обидва 200 {status:true}, ~508-546мс (constant-time floor 500мс; enumeration НЕ виявлено). Без X-Requested-With і з Origin=https://attacker.example.com або порожнім -> 200 {status:true} (жодного CSRF/origin-гейту).
```

**Відтворення:**

```text
node <scratch>/agents/api-live-gap-better-auth-catchall-subroutes/02-send-verif.mjs; node .../06-origin-csrf.mjs (no-CSRF / foreign Origin -> 200).
```

**Верифікатор:**

```text
The gap itself is real. send-verification-email does not match any substring used by authSensitiveRateLimit or authAccountRateLimit. auth.ts sets no `rateLimit` option, so Better Auth's own limiter is `enabled: options.rateLimit?.enabled ?? isProduction` (node_modules/better-auth 1.6.23, dist/context/create-context.mjs:171), with the special rule `/send-verification-email` at 60s/max 3 per IP (rate-limiter/index.mjs:379-382). Upstream handler (email-verification.mjs): an anonymous call with an existing, unverified email calls sendVerificationEmailFn; for a missing or verified user it only creates a token. Live in dev: 6 rapid anonymous calls with no CSRF header and no Origin to my own unverified user all returned 200, and server.log shows 7 `auth_transactional_email_skipped_dev_no_resend kind=email_verification` for that emailHash (1 from sign-up plus 6). The prod impact is overstated, though. The finding missed the per-recipient dedupe in apps/server/src/lib/jobs/authMail.ts:186: `jobId: ${kind}:${to.toLowerCase()}:${floor(now/60000)}`. Completed jobs are kept (removeOnComplete age 7d / count 1000), and prod runs Redis (ADR-0074:13), so prod sends at most about 1 verification mail …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Verifier script <scratch>/agents/verify-api-live-gap-better-auth-catchall-subroutes/v2-sendverif.mjs gave statuses [200x6], any429=false. grep of emailHash 1947d83c5b7a in server.log shows 7x kind=email_verification dispatch, because dev has no Redis and therefore no dedupe. Dedupe code is in authMail.ts:181-186; the queue's defaultJobOptions.removeOnComplete={age:604800,count:1000} keeps job ids for dedupe. @better-auth/core env-impl.mjs:32 has isProduction = NODE_ENV==='production'. No secondaryStorage is configured, so the upstream limiter uses per-process memory.
```

<a id="rel-38"></a>

### `rel-38` [low] Немає обробника pushsubscriptionchange, а «підписано» береться з localStorage: після ротації підписки пуші мовчки зникають

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: service worker / push
- **Де:** apps/web/src/sw.ts:63-158; apps/web/src/shared/hooks/usePushNotifications.ts:112-113; apps/web/src/shared/hooks/usePushNotifications.webpush.ts:71-76; apps/web/src/sw/messages.ts:109-114
- **Першопричина:** sw.ts не слухає pushsubscriptionchange. usePushNotifications читає стан з LS-прапорця і ніде не звіряє його з pushManager.getSubscription() чи з сервером.
- **Вплив:** Після ротації чи інвалідації підписки браузером сервер soft-delete-ить endpoint, а нова підписка не реєструється, хоча тумблер показує «увімкнено». Нагадування й банківські пуші перестають приходити без жодного сигналу, а при закритому застосунку сервер — єдиний канал доставки.
- **Що зробити:** Додати в sw.ts обробник pushsubscriptionchange, який перепідписується і робить POST /api/v1/push/register. На старті звіряти getSubscription() з прапорцем і перереєструвати endpoint, якщо він змінився або зник.

Знахідок у кластері: 1.

#### [low] Немає обробника pushsubscriptionchange, а статус «підписано» береться з LS-прапорця: після ротації підписки пуші мовчки зникають

- **ID:** `client-static/service-worker-pwa#6` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/sw.ts:63-158 (лише message/notificationclick/notificationclose/activate/push); apps/web/src/shared/hooks/usePushNotifications.ts:112-113; apps/web/src/shared/hooks/usePushNotifications.webpush.ts:71-76; apps/web/src/sw/messages.ts:109-114
- **Вплив:** Нагадування звичок/їжі/тренувань і банківські пуші перестають приходити без жодного сигналу користувачу; повторно увімкнути нема підстав, бо тумблер показує «увімкнено».
- **Рекомендація:** Додати в sw.ts `pushsubscriptionchange`: перепідписатися з тим самим applicationServerKey і POST /api/v1/push/register (credentials: include). На старті застосунку звіряти getSubscription() з прапорцем і перереєструвати endpoint на сервері, якщо він змінився або зник.

**Докази:**

```text
grep -rn 'pushsubscriptionchange' apps/web/src → 0 збігів. `const [subscribed] = useState(() => safeReadStringLS(PUSH_SUB_KEY) === "1")` — стан ніде не звіряється з pushManager.getSubscription() (getSubscription викликається лише в unsubscribeFromWebPush). Коментар messages.ts:109-114: локальний цикл нагадувань прибрано, «Нагадування тепер шле сервер» — тобто пуш єдиний канал нагадувань при закритому застосунку.
```

**Відтворення:**

```text
Статично. Сценарій: браузер (Firefox, або Chrome після відкликання/ротації) змінює підписку → сервер отримує 404/410 і soft-delete-ить endpoint → нова підписка на сервер не відправляється → UI у налаштуваннях і далі показує «увімкнено».
```

**Верифікатор:**

```text
Підтверджено кодом. grep 'pushsubscriptionchange' по apps/web/src дає 0 збігів, sw.ts має лише обробники message/notificationclick/notificationclose/activate/push. `subscribed` береться з LS (`hub_push_subscribed`) і ніде не звіряється з pushManager.getSubscription() чи сервером. Query pushKeys.status лише інвалідують, ніхто його не читає. Частину сценаріїв перекрито: якщо користувач відкликав дозвіл, тумблер показує «Заблоковано» через permission === "denied". Лишаються ротація або інвалідація підписки push-сервісом: сервер отримує 404/410, робить soft-delete, а UI далі пише «Увімкнено: звички, тренування, бюджет». Нагадування тепер шле лише сервер (messages.ts:109-114), тож канал зникає мовчки. Severity low: у Chrome таке трапляється рідко, частіше у Firefox.
```

**Додаткові докази верифікатора:**

```text
usePushNotifications.ts:112-113 useState(() => safeReadStringLS(PUSH_SUB_KEY) === "1"). PushNotificationToggle.tsx: blocked ? «Заблоковано…» : subscribed ? «Увімкнено…» : «Вимкнено». pushKeys.status ніде не використовується як queryKey useQuery.
```

<a id="rel-39"></a>

### `rel-39` [low] Локальне нагадування чекає navigator.serviceWorker.ready без таймауту: без SW воно не показується, а fallback недосяжний

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: нагадування модулів
- **Де:** apps/web/src/shared/hooks/useModuleReminder.ts:103-127; apps/web/src/core/app/swControl.ts:20-38; apps/web/src/modules/routine/hooks/useRoutineReminders.ts:101-105
- **Першопричина:** useModuleReminder робить await navigator.serviceWorker.ready, а без активного SW цей promise не завершується ніколи, тож catch із new Notification не спрацьовує. swReady() з таймаутом у swControl.ts існує, але тут не використаний. Нагадування також не мають data, тож тап веде на /.
- **Вплив:** У середовищах без SW (приватне вікно Firefox, невдала реєстрація) нагадування мовчки не показуються, хоча ключ «надіслано» вже записаний. Тап по показаному нагадуванню не відкриває потрібний модуль.
- **Що зробити:** Використати swReady() з таймаутом і в разі невдачі падати в new Notification. Передавати data: {module} у showNotification.

Знахідок у кластері: 1.

#### [low] showReminderNotification чекає navigator.serviceWorker.ready без таймауту: без SW нагадування не показується і fallback не спрацьовує

- **ID:** `client-static/service-worker-pwa#13` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/shared/hooks/useModuleReminder.ts:103-127
- **Вплив:** Нагадування мовчки не показуються в середовищах без SW; тап по показаному нагадуванню не відкриває відповідний модуль.
- **Рекомендація:** Обгорнути ready тим самим swReady() з таймаутом (swControl.ts) і падати в new Notification; передавати data: {module} у showNotification.

**Докази:**

```text
`if ("serviceWorker" in navigator) { const reg = await navigator.serviceWorker.ready; await reg.showNotification(...); return; }` і лише в catch → `new Notification(...)`. swControl.ts:20-38 сам документує, що `ready` «never rejects and never times out» без активного SW (приватний режим Firefox, невдала реєстрація) — тоді catch не настає і fallback недосяжний. Крім того, локальні нагадування не мають `data`, тож тап у sw.ts:85 веде на `/`, а не в модуль.
```

**Відтворення:**

```text
Статично. Firefox у приватному вікні (SW недоступні, але navigator.serviceWorker існує) → увімкнути нагадування звички → у час нагадування нічого не з'являється.
```

**Верифікатор:**

```text
Verified in code, and the underlying primitive reproduced. useModuleReminder.ts:103-127 awaits navigator.serviceWorker.ready with no timeout whenever 'serviceWorker' in navigator. `ready` never settles when no SW is active, so the catch, and with it the `new Notification` fallback, is unreachable. swControl.ts:20-38 documents this exact hazard and wraps it in swReady(), but this helper does not use it. Consequences: useRoutineReminders.ts:101-105 writes the 'sent' localStorage key right after the fire-and-forget call, so that day's reminder is silently lost. useFizrukWorkoutReminder's firedRef stays set and its .then/.catch never run. I disagree with the cited repro: Firefox private browsing likely does not expose navigator.serviceWorker at all, so it would take the fallback and work. Realistic triggers are SW registration failures where the API is still exposed, such as Chrome with site data blocked, enterprise policy, or a failed sw.js, plus the Capacitor Android WebView where the PWA plugin is disabled. The 'tap opens / instead of the module' sub-claim is weak: local reminders fire only while the app tab is open, and notificationclick just focuses that tab.
```

**Додаткові докази верифікатора:**

```text
Script <scratch>/agents/verify-client-static-service-worker-pwa/v13-ready-hang.mjs, Chromium with serviceWorkers:'block' and notifications granted. Result: hasSW:true, getRegistration:false, Notification.permission:'granted', and navigator.serviceWorker.ready still pending after 5 s. Log v13.log.
```

<a id="rel-40"></a>

### `rel-40` [low] Вотермарк pull за кластерним xmin зв'язує синк усіх: будь-яка довга транзакція в кластері затримує доставку змін

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** L · **Область:** server: sync v2 pull/stream
- **Та сама першопричина, що й** [`data-12`](./data-integrity.md#data-12): Обидва наслідки вотермарка pull за кластерним xmin: пропуск оп-ів паралельних транзакцій і затримка доставки через довгі транзакції. Курсор (tx_id, id) або per-user серіалізація записів міняє той самий механізм.
- **Де:** apps/server/src/modules/sync/syncV2-core.ts:40-41; apps/server/src/modules/sync/syncV2.ts:660; apps/server/src/modules/sync/syncV2Stream.ts:273
- **Першопричина:** Pull і stream фільтрують оп-и за умовою tx_id &lt; pg_snapshot_xmin(pg_current_snapshot()), тобто за найстаршою відкритою xid у всьому кластері Postgres, а не лише в цій БД чи для цього користувача.
- **Вплив:** Push іншого користувача, імпорт виписки, ручна psql-сесія в іншій БД, міграція чи забута prepared transaction ховають уже закомічені оп-и всіх користувачів до свого COMMIT. idle_in_transaction_session_timeout діє лише на з'єднання застосунку.
- **Що зробити:** Перейти на курсор (tx_id, id), який дає коректність без глобального очікування. Тимчасово алертити на вік найстаршої xid (pg_stat_activity.backend_xid) і на pg_prepared_xacts.
- **Примітка:** Затримку задокументовано як свідому ціну коректності, але її глобальний масштаб (між користувачами і між базами) підтверджено наживо. Посилює rel-62: довга міграція заморожує pull усім.

Знахідок у кластері: 1.

#### [low] Вотермарк по кластерному xmin зв'язує синк усіх користувачів: чужа довга транзакція затримує pull

- **ID:** `api-live/sync-live#9` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `reliability`
- **Де:** apps/server/src/modules/sync/syncV2-core.ts (SYNC_OP_LOG_COMMITTED_WATERMARK_SQL), syncV2.ts:660, syncV2Stream.ts:273
- **Вплив:** Затримка задокументована як свідома ціна, але вона глобальна: будь-яка транзакція з xid у ВСЬОМУ кластері Postgres (інша БД на тому ж сервері, ручна psql-сесія, забута prepared transaction, імпорт виписки іншого юзера) зупиняє доставку змін для всіх користувачів. idle_in_transaction_session_timeout з db.ts діє лише на з'єднання застосунку.
- **Рекомендація:** Перейти на курсор (tx_id, id) (див. знахідку про пропуск оп-ів): він дає коректність без глобального очікування. Тимчасово: алерт на вік найстаршої активної xid-транзакції (pg_stat_activity.backend_xid) і на pg_prepared_xacts.

**Докази:**

```text
User V (інший акаунт) push 200 важких оп-ів (~1.6 с). На 334 мс user U push 1 оп → 200 applied, op_id 2078.
GET pull з 2-го пристрою U: 359, 702, 1037, 1363, 1648 мс → ops=0 (закомічений оп U НЕ видно)
1652 мс: push V закомічено → 1931 мс pull U → ops=1.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t14_coupling.mjs
```

**Верифікатор:**

```text
I reproduced it both across users and across databases. Cross-user (d4/v9_coupling.mjs): user vsyncb2 pushes 200 ops. During that push vsyncb1's op is committed (200, last_op_id=11358), but pulls from its second device return ops=0 at 206/386/551 ms. The op becomes visible only at 715 ms, after V's push finished at 572 ms. Cross-database (d4/v9b_xdb.mjs): a psql session in the separate database `postgres` holds an xid (BEGIN; pg_current_xact_id(); pg_sleep(2.5); ROLLBACK; no data written). U's committed op (tx_id 60089) stays invisible for ~2.6 s because hub's pg_snapshot_xmin is 60086, and it appears right after the foreign session rolls back. So the watermark is coupled across the whole cluster, beyond this app's own database. Mitigating context: migration 147 and docs/work/specs/tech-debt/backend.md:337 record the cluster-wide delay as a consciously accepted cost, and ops are delayed but not lost. The finding's real new point holds, though. The documented safeguard (idle_in_transaction_session_timeout from db.ts) applies only to the app pool's connections. The server-level setting is 0 here, so a manual psql session, another app's DB on the same cluster, or an active long write …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v9_coupling: '[181ms] user U push committed ... last_op_id=11358' / '[206ms][386ms][551ms] ops=0 not visible (V push finished=false)' / '[572ms] V heavy push done' / '[715ms] ops=1 VISIBLE'. v9b_xdb: 'psql(db=postgres): xid|60086' / 'hub snapshot xmin vs op tx_id: 60086 vs 60089' / pulls not visible 410..2552ms / ROLLBACK at 2577ms / VISIBLE at 2967ms. SHOW max_prepared_transactions=0; SHOW idle_in_transaction_session_timeout=0 (server-level). Watermark: syncV2-core.ts:40-41; documented trade-off: migrations/147_sync_op_log_tx_watermark.sql header and docs/work/specs/tech-debt/backend.md:331-339 (closed item, cost accepted; not an open audit entry).
```

<a id="rel-41"></a>

### `rel-41` [low] У memory-режимі SQLite кожне завантаження сторінки заново пушить незнятий журнал з новими ключами і новим device id

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: durability / sync engine
- **Де:** apps/web/src/core/durability/dualWriteJournal.ts:90-91; apps/web/src/core/syncEngine/singleton.ts:503; apps/web/src/modules/*/lib/sqliteWriter/index.ts
- **Першопричина:** У :memory: ack журналу пропускається. originDeviceId живе в kv_store цієї ж бази і на кожному буті новий, а адаптери генерують свіжий idempotency_key. Кожен memory-бут ще й додає до журналу новий знімок дефолтних комор.
- **Вплив:** Поки диск повний (а це може тривати днями), кожен reload додає до 200 відхилених рядків у sync_op_log, палить push-ліміт і ламає ехо-фільтр pull: сервер повертає пристрою його ж старі оп-и. Цілісність даних не страждає, бо LWW відкидає повтори.
- **Що зробити:** Дублювати SYNC_ORIGIN_DEVICE_ID у localStorage, давати записам журналу детермінований idempotency_key і знімати журнал за підтвердженням push, а не лише за записом у SQLite.
- **Примітка:** Фіндер ставив medium.

Знахідок у кластері: 1.

#### [low] Memory-режим: кожне завантаження сторінки повторно пушить увесь незнятий журнал з новими idempotency-ключами і новим origin_device_id, sync_op_log розростається

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/durability/dualWriteJournal.ts:90-91 (ack пропускається в memory, реплей на кожному буті), apps/web/src/core/syncEngine/singleton.ts:503 (originDeviceId у webKVStore → kv_store у :memory:), apps/web/src/modules/*/lib/sqliteWriter/index.ts (реплей журналу)
- **Вплив:** Поки пристрій у memory-режимі (тобто поки диск повний, може бути днями), кожен reload додає до 200 відхилених рядків журналу на сервері. Push-ліміти вигорають, сервер росте без меж, ехо-фільтр pull ламається через новий device id на кожному буті.
- **Рекомендація:** Зберігати SYNC_ORIGIN_DEVICE_ID дублем у localStorage (safeWriteStringLSDurable), щоб він переживав memory-режим. Записам журналу давати детермінований idempotency_key (від id запису журналу), щоб повтори ставали 'duplicate' без нових рядків. Не реплеїти в memory-режимі записи, які сервер уже прийняв: знімати журнал за підтвердженням push, а не лише за SQLite.

**Докази:**

```text
03-quota.mjs (gap-longsess-3, квота 3e6): 5 дій користувача за ~3 хв дали 237 рядків sync_op_log, з них 184 'rejected lww_conflict', і 13 різних origin_device_id для одного браузера. Той самий finyk_manual_expenses id 1790915033796 (client_ts 04:23:53) відправлено 13 разів з різними ключами. У 06 m_bootstrap пушився на кожному переході сторінки (6+ разів). Інші користувачі: j12IH6… 56 рядків / 38 rejected / 4 device id; b22W3… 48/33/7; yljZy… 40/24/7. Через зміну device id pull повертає клієнту його ж власні старі операції.
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/03-quota.mjs gap-longsess-3 3000000 q3m. Далі psql: select count(*), count(distinct origin_device_id), sum((status='rejected')::int) from sync_op_log where user_id='P1bJEbBTFagVGzOze12WoGEZSZi9Wj42'.
```

**Верифікатор:**

```text
Відтворено. У memory-режимі originDeviceId (resolveOriginDeviceId через webKVStore → kv_store у :memory:) щоразу новий. Незнятий журнал реплеїться на кожному бутi, а адаптери мінтять свіжий crypto.randomUUID() idempotency_key, тож сервер приймає ті самі операції новими рядками sync_op_log і відхиляє їх як lww. Крім того, кожен memory-бут додає в журнал НОВИЙ знімок дефолтних комор, тож журнал і обсяг реплею ростуть. Цілісність даних не страждає: реплей несе оригінальну clientTs, і LWW відкидає старіше, а повернене pull-ом ехо ідемпотентне. Наслідок обмежено ростом журналу на сервері і витратою push-бюджету в рідкісному деградованому режимі. Тому low.
```

**Додаткові докази верифікатора:**

```text
vfy-lsp-2 (Qlrx9Y5W…) за ~1,5 хв і 4 memory-завантаження: 54 рядки sync_op_log, origin_device_id 7cba150d (OPFS), 6f461a49, 38e4b459, 48a6fca0, 9933c0d5 (новий на кожне memory-завантаження). Ті самі ops nutrition_pantries freezer/fridge/home @05:28:08.201 надіслано 5 разів з різними idempotency_key, 4 рази з них rejected. Знімки комор @05:28:16.937 і @05:28:25.696 додались наступними бутами.
```

<a id="rel-42"></a>

### `rel-42` [low] Outbox не відправляється на старті застосунку: накопичені зміни йдуть лише через ~30 с

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: sync engine writer
- **Де:** packages/api-client/src/endpoints/syncV2.pushScheduler.ts:158-162; apps/web/src/core/syncEngine/syncEngineWriter.ts:177-189; apps/web/src/core/syncEngine/singleton.ts:134-147,506
- **Першопричина:** bootSyncEngineWriter лише армує інтервал планувальника (перший тік через intervalMs, ≈30 с ±20%) і підписується на online і visibilitychange. Явного flushNow() на буті немає.
- **Вплив:** Короткі відкриття застосунку («перевірив і закрив») не відправляють накопичене. Дані довше живуть лише локально, і зростає ризик розбіжностей між пристроями.
- **Що зробити:** Викликати flushNow() одразу після boot writer-а і після першого pull.

Знахідок у кластері: 1.

#### [low] Push outbox не виконується на старті застосунку: відкладені зміни відправляються лише через ~30 с після запуску

- **ID:** `browser-surfaces/fizruk-flows#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `reliability`
- **Де:** packages/api-client/src/endpoints/syncV2.pushScheduler.ts:160 («first periodic tick fires intervalMs after start() (NOT immediately)»); apps/web/src/core/syncEngine/syncEngineWriter.ts:177-183
- **Вплив:** Короткі відкриття застосунку (перевірив і закрив) не відправляють накопичене. Дані довше живуть лише локально, і разом із втратою локальних записів після аварійного закриття це підвищує ризик розбіжностей.
- **Рекомендація:** Робити flushNow() одразу після boot writer-а (і після першого pull), а не чекати першого інтервалу.

**Докази:**

```text
drain.mjs: сторінка готова о 02:38:13 з «Синхронізація · 205 в черзі», перший POST /sync/push о 02:38:47 (+34 с). pull.mjs: готово 02:40:01, push о 02:40:32. Плашка «N в черзі» тримається між короткими сесіями (наприклад, «4 в черзі» видалення W3 висіло кілька запусків, доки сесія не протрималась 35 с).
```

**Відтворення:**

```text
Зробити правку, закрити вкладку до push (або офлайн) → відкрити застосунок онлайн і стежити за Network: перший /api/v2/sync/push лише через ~30 с.
```

**Верифікатор:**

```text
Підтверджено кодом. bootSyncEngineWriter (singleton.ts:134-147) викликає runtime.start(), а той (syncEngineWriter.ts:184-189) лише армує інтервал scheduler-а і підписує flush-on-reconnect на події online/visibilitychange. За контрактом scheduler-а (syncV2.pushScheduler.ts:158-162) перший тік приходить через intervalMs (30 с ±20%, singleton.ts:506), а не одразу. Явного flushNow() на буті немає ніде: grep по getSyncEngineWriter() знаходить лише useSyncStatus.getStatus, recoverAllDeadLetters, flushBeforeLogout і SyncRejectedList. visibilitychange при першому завантаженні не стріляє, а нудж notifyEnqueued спрацьовує тільки на НОВИЙ enqueue. Для порівняння, reader (syncEngineReader.ts:288-293) у start() робить scheduleTick() одразу, тож асиметрія не схожа на навмисну. Тайминги finder-а (+31..34 с) з цим збігаються.
```

**Додаткові докази верифікатора:**

```text
Рандомізацію інтервалу пояснено як «desynchronize fleet-wide drain ticks» (singleton.ts:702-707). Пропуск немедленного flush вона не обґрунтовує, тим більше що pull на старті й так іде одразу.
```

<a id="rel-43"></a>

### `rel-43` [low] Після великого імпорту Strong Фізрук десятки секунд показує фальшиві порожні стани і «Тренування не знайдено»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Фізрук (warm cache / імпорт)
- **Де:** apps/web/src/modules/fizruk (useSqliteTickOverlay, cache.refreshedAt; strongImport → commitStrongImport); маршрути /fizruk, /fizruk/history, /fizruk/workouts, /fizruk/workout/:id
- **Першопричина:** Поки warm-кеш не оновлений (refreshedAt), екрани Фізрука рендерять empty state і «не знайдено» замість лоадера. Водночас імпорт 100 тренувань дає тисячі оп-ів, які через 429 і перезаливку історії (rel-08, rel-09) дренуються ~10 хв.
- **Вплив:** Після імпорту людина бачить «історії немає» або «тренування видалено» і може записати чи видалити його повторно. Інші пристрої й сервер ~10 хв не отримують нових даних.
- **Що зробити:** Поки кеш не прогрітий, показувати skeleton замість empty state, а на /fizruk/workout/:id чекати refreshedAt. Імпорт пушити батчами з backoff.
- **Примітка:** Фіндер ставив medium. Верифікатор відтворив (118 відповідей 429 на 148 push, «не знайдено» до 10 с) і знизив до low.

Знахідок у кластері: 1.

#### [low] Після імпорту ~2000 рядків Strong (100 тренувань) Фізрук на кожному старті 25-30 с показує фальшиві порожні стани, а свіже ретро-тренування відкривається як «Тренування не знайдено». Нові зміни стоять у черзі за ~1700 оп і йдуть на сервер ~10 хв

- **ID:** `browser-surfaces/gap-module-secondary-mutating-flows#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Серйозність від шукача:** medium
- **Де:** /fizruk/history, /fizruk, /fizruk/workouts, /fizruk/workout/&lt;id&gt;; fizruk warm-cache (useSqliteTickOverlay, cache.refreshedAt) + outbox drain; strongImport → commitStrongImport
- **Вплив:** Людина після імпорту бачить «історії немає» або «тренування видалено» і може записати чи видалити повторно. Інші пристрої й сервер ~10 хв не отримують нових даних, а через спільний із pull бакет 60/хв гальмує і вхідна синхронізація.
- **Рекомендація:** Поки кеш не прогрітий, показувати skeleton чи лоадер, а не empty state або «не знайдено». На маршруті /fizruk/workout/:id чекати refreshedAt. Імпорт пушити окремими батчами з backoff і не дублювати перезаливку всієї історії (див. відому знахідку).

**Докази:**

```text
f24-strong s-big.csv (2000 рядків): за 30 с 147 push-запитів, із них 117×429. Через 90 с на сервері лише 17 зі 100 тренувань, далі по ~100 оп на тік ~36 с. Кнопка синхронізації показує «1590…1699…2339 в черзі». Позначки болю, швидкий запис і ретро ще кілька хвилин не доходили до сервера. f40: на тому самому пристрої «Завершено: 1» тримається 25 с, потім стає 111. На дашборді «Тіло ще не має історії. Перше тренування покаже…», на /fizruk/workouts «Перше тренування – попереду». f31: після «Записати» на 2-6 с видно «Тренування не знайдено. Його вже видалили, або посилання застаріле.» (скрін f31-notfound.png). У f28 скрипт через це так і лишився на сторінці «не знайдено». Повʼязано з відомою «перезаливкою всієї історії», але це новий симптом, який бачить користувач.
```

**Відтворення:**

```text
f24-strong.mjs s-big.csv kg big, потім f40-hist-long.mjs f-dev1 і f31-notfound.mjs (у <scratch>/agents/browser-surfaces-gap-module-secondary-mutating-flows/).
```

**Верифікатор:**

```text
Mostly reproduced on my own user. Importing s-big.csv (100 workouts, 1500 matched sets) caused a push storm: within 60 s, 148 push requests carried 5970 ops and got 118×429. The server had 11/100 workouts after 100 s, 17 after about 3 min and 70 after about 10 min. While that backlog drained, creating a retro workout ('Записати проведене → Вправи по підходах → Записати') showed «Тренування не знайдено» from +0.5 s to +10.1 s; in an earlier run it lasted the whole 10 s window. The control on a fresh user with no backlog went straight to the session (+0.47 s). The cause: the /fizruk/workout/<id> route mounts its own Workouts that reads the warm cache, which lags behind the busy dual-write queue (useWorkoutsLifecycle.ts:44-60 admits 'ще немає' and 'немає взагалі' cannot be told apart). I saw the fake empty state ('Перше тренування – попереду' while 100+ workouts and an active session existed) once during the backlog. Later boots showed data at +1.4 s, so that part is intermittent rather than 25-30 s on every start. I downgraded the severity. It is a transient window after a one-time bulk import, with no data loss: the outbox persists and everything eventually reached the server. The p …[обрізано]
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-gap-module-secondary-mutating-flows/v7-big.mjs import: '+59s pushReqs=147 ops=5870 429=118 db=6', '+100s … db=11'. v7-notfound.mjs: big user [{ms:556,'NOT FOUND'},{ms:10149,'SESSION'}]; fresh control vfy-gsm-f2 [{ms:472,'SESSION'}]. Screenshot shots/verify-gap-secondary/v7-notfound-vf-dev1.png. v7-boot2.mjs later: '+1.4s ACTIVE' (no empty state). Root causes already tracked: docs/work/specs/audits/2026-10-01-full-app-audit/reliability.md:506 (every edit re-uploads the whole workout history) and :1833 (push and pull share a 60/min bucket, 429 ignores Retry-After). The not-found and empty-state symptoms are not recorded.
```

<a id="rel-44"></a>

### `rel-44` [low] Повноекранний гейт «Переношу дані в профіль…» блокує вхід і холодний старт, навіть коли переносити нічого

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: durability (анонімна міграція)
- **Та сама першопричина, що й** [`ux-01`](./ux-a11y.md#ux-01): Один і той самий гейт AuthenticatedMigrationGate, що на кожному старті проганяє розвідку анонімної партиції й показує «Переношу дані в профіль…». Фікс один: кешувати висновок і робити дешевий preflight.
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:75,84-90,365-415; apps/web/src/core/durability/anonymousDataMigration.ts:813-828
- **Першопричина:** runMigration завжди перемикається на анонімну партицію, проганяє migrateModuleSchemas для чотирьох модулів і робить snapshot. Провайдер показує панель з текстом про перенесення, щойно probe перевищив PROBE_GRACE_MS=500, навіть коли transferring=false. /reset-password і /verify-email не входять у GATE_EXEMPT_PATHS.
- **Вплив:** Кожен вхід на новому пристрої показує неправдиве повідомлення і блокує інтерфейс на ~3-5 с (у пісочниці до 17 с). Після цього модуль ще кілька секунд порожній, доки не прийде перший pull. Гейт стоїть і перед сторінкою скидання пароля.
- **Що зробити:** Пропускати probe анонімної партиції, коли немає ознак анонімних даних. До onTransferStart показувати нейтральний лоадер. Стартувати pull паралельно з гейтом. Додати /reset-password і /verify-email до GATE_EXEMPT_PATHS.
- **Примітка:** Пов'язано з відомою SR-5 у docs/work/specs/planning/product-knowledge-backlog.md. Верифікатор заміряв 2,7-4,8 с у новому контексті. На теплих reload панель блимає на 0,2-0,4 с.

Знахідок у кластері: 2.

#### [low] Після входу і на кожному холодному старті екран «Переношу дані в профіль і зберігаю на сервері…» блокує застосунок, навіть коли переносити нічого

- **ID:** `browser-surfaces/public-auth-pages#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:75 (PROBE_GRACE_MS=500), :365-415 (повноекранний гейт), :84-90 (GATE_EXEMPT_PATHS без /reset-password, /verify-email, /sign-in)
- **Вплив:** Кожен вхід на новому пристрої й кожен холодний старт показують повноекранну заглушку з неправдивим текстом про перенесення даних. Тривалість залежить від ініціалізації SQLite (у контейнері під навантаженням 4–18 с). Якщо перенос впаде, сторінка скидання пароля для залогіненого теж буде схована за панеллю помилки.
- **Рекомендація:** Показувати текст про перенесення лише після onTransferStart (snapshot.length &gt; 0). Для «розвідки» лишати нейтральний лоадер. Додати /reset-password і /verify-email до GATE_EXEMPT_PATHS. Профілювати switchSqliteUser(null)→(user) з подвійним migrateModuleSchemas на холодному OPFS.

**Докази:**

```text
11-gate-first.mjs (свіжий профіль, pool user без анонімних даних): `5692ms DOM / | Переношу дані в профіль і зберігаю на сервері…`, наступна подія `23326ms REQ GET /api/v1/me/profile`. Тобто 17.6 с блокування без жодного мережевого запиту в цьому вікні. Повторний прогін на /finyk: 1.6 с → 5.4 с. Вхід через форму в 09-signin-success.mjs: 16.1 с від кліку до /. Той самий гейт стоїть перед /reset-password?token=… і /sign-in для залогінених (10-gate-timing.mjs: «Переношу дані…» на /reset-password до 5.1 с). Пов'язано з уже відомою SR-5 у docs/work/specs/planning/product-knowledge-backlog.md.
```

**Відтворення:**

```text
Новий контекст браузера з сесією (A.newContext(b,'pa-signin')), відкрий / або /finyk і заміряй, скільки висить «Переношу дані в профіль…». Скрипт 11-gate-first.mjs.
```

**Верифікатор:**

```text
Відтворив, але тривалість значно менша, ніж у звіті. v11-gate.mjs, новий контекст, тобто «новий пристрій», користувач без анонімних даних: панель «Переношу дані в профіль і зберігаю на сервері…» видно на / 1683→6485 мс і 1474→5550 мс, на /finyk 1576→6076 мс і 1617→4295 мс, тобто ~2.7–4.8 с. Початкові 17.6 с це навантаження сандбокса. На теплих перезавантаженнях у тому ж контексті (v11b) панель блимає на ~0.2–0.4 с або не з'являється зовсім. Тож «на кожному холодному старті» правда лише частково. Код: AnonymousDataMigrationProvider.tsx показує панель за умови `transferring || state==='failed' || probeGraceElapsed` (PROBE_GRACE_MS=500), а в стані running текст завжди anonymousMigrationProgress. Коментар біля PROBE_GRACE_MS прямо визнає проблему «тривожний текст про перенесення без жодного перенесення» і закриває її лише для розвідки коротшої за 500 мс. На новому пристрої розвідка триває секунди, тому неправдивий текст лишається. GATE_EXEMPT_PATHS містить лише legal і status, тож /reset-password і /verify-email для залогіненого теж блокуються.
```

**Додаткові докази верифікатора:**

```text
v11-gate.mjs: `/ run1: gate first@1683ms, gone@6485ms`; `/finyk run2: gate first@1617ms, gone@4295ms`. v11b-gate-reload.mjs: reload run2 1266→1491 мс, run3 1439→1795 мс, run4 панелі немає. Пов'язане, але інше: SR-5 у docs/work/specs/planning/product-knowledge-backlog.md:1753 (гейт падає з рейт-лімітом після Google-входу).
```

#### [low] Вхід на новому пристрої: блокуючий екран «Переношу дані в профіль і зберігаю на сервері…», хоча переносити нічого; перший pull приходить лише через 15-25 с

- **ID:** `browser-crosscut/resilience-offline-perf#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:75 (PROBE_GRACE_MS = 500), :383-413; apps/web/src/core/durability/anonymousDataMigration.ts:813-828 (відкриває анонімну партицію, проганяє migrateModuleSchemas і snapshot навіть на чистому пристрої, потім switchSqliteUser)
- **Вплив:** Перший вхід на новому пристрої показує неправдиве повідомлення про перенос даних і кілька секунд блокує інтерфейс. Після цього модуль ще кілька секунд порожній до першого pull. Абсолютні значення роздуті конкуренцією CPU в пісочниці, але сама структура (дві послідовні ініціалізації партицій до pull) не залежить від середовища.
- **Рекомендація:** Пропускати probe анонімної партиції, коли немає ознак анонімних даних (LS-маркер або відсутній OPFS-файл). До onTransferStart показувати нейтральне копі («Готую дані…»). Стартувати reader pull паралельно з гейтом.

**Докази:**

```text
run-fresh-boot.log (новий пристрій, лише cookies, без LS і OPFS): run0 '2440 SCREEN Переношу дані в профіль і зберігаю на сервері…' -> '9345 SCREEN … Фінік' -> '15352 REQ POST push' / '15435 REQ GET pull since=0'; run1: 2673 -> 15908 -> 24524/24753. sqliteWorker вантажиться двічі (2179 і 8679 мс). Анонімних даних не було (snapshot порожній). Скрін: fresh-boot-_finyk_transactions-0.png
```

**Відтворення:**

```text
RUNS=2 node 19-fresh-bootstrap.mjs /finyk/transactions: контекст лише з cookie сесії, лог SCREEN-переходів і sync-запитів.
```

**Верифікатор:**

```text
anonymousDataMigration.ts runMigration() always switches to the anonymous partition (switchSqliteUser(null)), opens the DB, runs migrateModuleSchemas for four modules and snapshots every table, and only then switches to the target user, even on a device with no anonymous data. AnonymousDataMigrationProvider shows the progress panel with messages.sync.anonymousMigrationProgress ('Переношу дані в профіль і зберігаю на сервері…') once the probe exceeds PROBE_GRACE_MS=500, even when transferring=false. The AI-CONTEXT comment above PROBE_GRACE_MS admits that showing this text with no actual transfer is wrong. The 500 ms grace only helps when the probe is fast, and on a fresh device (worker plus OPFS init plus four schema migrations, twice) it is not. Sync boot starts only in .finally() after the gate, so the first pull waits for both partition inits. The absolute numbers depend on the environment, but the sequence does not.
```

**Додаткові докази верифікатора:**

```text
Re-ran the fresh-device scenario (cookies only, no LS or OPFS) with my user at load average about 5 on 4 CPUs, 2 runs. The panel 'Переношу дані в профіль і зберігаю на сервері…' was visible from 1169 to 4491 ms and from 1522 to 4625 ms, about 3 s each, with nothing to migrate. sqliteWorker chunk was fetched twice (554/4006 ms, 863/4119 ms). The first GET /api/v2/sync/pull?since=0 came at 7708 and 7345 ms. That is less than the 15-25 s in the finding, which was inflated by higher load, but the structure is the same. SR-5 in product-knowledge-backlog.md covers a different issue on the same screen (rate-limit failures), not this one.
```

<a id="rel-45"></a>

### `rel-45` [low] Закриття HubChat з відкритим деструктивним підтвердженням підвішує send() і лишає прапор стріму true

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: HubChat
- **Де:** apps/web/src/core/hub/chat/useDestructiveConfirm.ts:80-110; apps/web/src/core/hub/chat/useChatSend.ts:379-383,475,808-813,850-854; apps/web/src/core/app/useSWUpdate.ts:139-147
- **Першопричина:** useDestructiveConfirm не має unmount-cleanup, тож promise з request() ніколи не завершується і finally з setHubStreaming(false) не виконується. 90-секундний таймаут ходу стартує ще до діалогу.
- **Вплив:** Глобальний _streaming лишається true, і тост оновлення PWA відкладається до 10 хв. Якщо підтвердити пізніше ніж за 90 с, деструктивні інструменти все одно виконуються, а бульбашка показує помилку, хоча дані вже змінено.
- **Що зробити:** У useDestructiveConfirm на unmount робити settle(false). Таймаут ставити лише на мережеві виклики, а не на час очікування підтвердження.
- **Примітка:** Перевірено статично, бо LLM-ключів локально немає.

Знахідок у кластері: 1.

#### [low] HubChat: закриття чату з відкритим діалогом деструктивного підтвердження «підвішує» send() і лишає прапор стріму true

- **ID:** `client-static/react-correctness#7` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `reliability`
- **Де:** apps/web/src/core/hub/chat/useDestructiveConfirm.ts:80-110; apps/web/src/core/hub/chat/useChatSend.ts:379-383,475,808-813; apps/web/src/core/app/useSWUpdate.ts:139-147
- **Вплив:** Підвисла асинхронна послідовність і застряглий глобальний прапор (затримка оновлення застосунку до 10 хв); після довгого роздуму над підтвердженням користувач бачить «помилку» при фактично виконаній деструктивній дії.
- **Рекомендація:** У `useDestructiveConfirm` додати unmount-cleanup, що робить `settle(false)`; таймаут 90 с ставити/знімати навколо мережевих викликів, а не на весь хід (не рахувати час очікування підтвердження).

**Докази:**

```text
`request()` повертає Promise, який резолвиться лише через `accept`/`reject`; при розмонтуванні HubChat (закриття оверлею) ніхто його не відхиляє. `send` чекає `await requestDestructiveConfirm(...)` (475), тож `finally` з `setHubStreaming(false)` (812) не виконується ніколи — глобальний `_streaming` лишається `true`, і `useSWUpdate` відкладає тост оновлення PWA до жорсткого таймауту 10 хв. Окремо: 90-секундний таймаут (379) запускається ДО діалогу; якщо людина підтвердить пізніше 90 с, `executeActions` все одно виконає деструктивні інструменти, а другий тур упаде з abort і бульбашка покаже помилку, хоча дані вже змінені.
```

**Відтворення:**

```text
Статично (LLM-ключі локально відсутні, тож tool_calls живцем не отримати): попросити видалити транзакцію → коли зʼявиться модалка підтвердження, закрити чат хрестиком.
```

**Верифікатор:**

```text
Code confirmed. `useDestructiveConfirm` has no unmount cleanup: the Promise from `request` settles only through accept/reject. `send` awaits it (useChatSend.ts:475). The unmount cleanup (:850-854) only aborts the AbortController, which the confirm promise ignores. So `finally` (:808-812) never runs, and `setHubStreaming(false)`, called only there, is skipped. `_streaming` stays true until the next completed chat turn or a reload, and useSWUpdate defers the update toast up to HARD_SHOW_TIMEOUT_MS = 10 min. The finder's exact repro path does not work: «закрити чат хрестиком» is impossible because DestructiveConfirmModal → ConfirmDialog uses `useDialogFocusTrap(..., {inertBackground:true})`, which makes the header X inert. The bug is still reachable: ConfirmDialog does not use `useHistoryDismiss`, so Back/Android back gesture navigates away from /chat, or closes the overlay host HubChatSheet (Sheet → useHistoryDismiss), unmounting HubChat with the promise pending. The 90 s sub-claim is also confirmed: the timer starts before the confirm wait (:379), and after a late approval `executeActions` runs with no check of `signal.aborted`. The synthesis call then fails with an abort. The outco …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Not reproduced live: needs LLM tool_calls; verified by code. grep: `setHubStreaming` is called only in useChatSend.ts:346 (true) and :812 (false, in finally). ConfirmDialog.tsx:63 `useDialogFocusTrap(open, ref, { onEscape: onCancel, inertBackground: true })`, with no useHistoryDismiss. HubChatSheet.tsx wraps HubChat in `<Sheet>` (useHistoryDismiss → Back closes the sheet). useSWUpdate.ts:19 HARD_SHOW_TIMEOUT_MS = 10 min.
```

<a id="rel-46"></a>

### `rel-46` [low] POST /api/coach/insight падає з 500 на некоректних weeklyDigests і не повертає списану квоту

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: coach
- **Де:** packages/shared/src/schemas/api.ts:1112-1117; apps/server/src/modules/chat/coach.ts:228-291,554-571,584
- **Першопричина:** CoachMemoryEchoSchema приймає weeklyDigests як z.array(z.unknown()), а buildMemorySummary розіменовує елементи без перевірки (null, correlations, що не є масивом). Виняток виникає до invokeLLM, а refund обгортає лише сам виклик LLM.
- **Вплив:** Пошкоджена в localStorage чи підроблена пам'ять коуча дає 500 замість 400 і забирає одну з 20 тижневих AI-дій Free-користувача.
- **Що зробити:** Описати форму елемента weeklyDigests у схемі з лімітами або відфільтровувати не-об'єкти. Повертати квоту на будь-якій помилці до upstream.
- **Примітка:** Падає лише з увімкненим healthDataConsent: без нього stripHealthFromCoachInput нормалізує дайджести.

Знахідок у кластері: 1.

#### [low] POST /api/coach/insight падає 500 на memory.weeklyDigests з null/некоректними елементами, і списана квота не повертається

- **ID:** `server-static/ai-layer#11` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `crash`
- **Де:** packages/shared/src/schemas/api.ts:1112-1117; apps/server/src/modules/chat/coach.ts:228-291, 554-571
- **Вплив:** Некоректна (або пошкоджена в localStorage) памʼять коуча дає 500 замість 400 і забирає одну з 20 тижневих AI-дій Free-користувача.
- **Рекомендація:** Описати форму елемента weeklyDigests у схемі (обʼєкт з опційними рядковими полями й масивами рядків з лімітами) або фільтрувати не-обʼєкти перед buildMemorySummary; повертати квоту на будь-якій помилці до upstream.

**Докази:**

```text
CoachMemoryEchoSchema: `weeklyDigests: z.array(z.unknown()).max(24)`; buildMemorySummary робить `d.finyk?.summary` і `for (const c of d.correlations || [])`. Запуск (<scratch>/agents/server-static-ai-layer/coachprompt.mts): `[null]` -> schema ok: true -> THROWS: Cannot read properties of null (reading 'finyk'); `[{correlations: 5}]` -> THROWS: number 5 is not iterable. Виняток виникає до invokeLLM, тож refundQuotaOnUpstreamFailure не викликається, а квиток квоти вже списано в requireAiQuota.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-ai-layer/coachprompt.mts. Через API: POST /api/coach/insight {memory:{weeklyDigests:[null]}} з healthDataConsent=true -> 500 (локально маршрут віддає 503 раніше через відсутній LLM-ключ).
```

**Верифікатор:**

```text
Reproduced in the prompt builder. CoachMemoryEchoSchema accepts z.array(z.unknown()). With health consent, buildMemorySummary throws on [null] ('Cannot read properties of null (reading finyk')) and on correlations:5 ('number 5 is not iterable'). Without consent, stripHealthFromCoachInput spreads each digest into an object and sets correlations:[], so no throw. The quota ticket is consumed in requireAiQuota before the handler, and refund only wraps invokeLLM (coach.ts:584+), so the ticket is not returned. The thrown TypeError becomes a non-operational 500 and is captured to Sentry. Correction to the impact: the real client sends `memory` from GET /api/coach/memory. That data is built only from CoachMemoryPostSchema-validated digests (objects, correlations: string[]) and not from localStorage, so the normal or corrupted flow cannot trigger this. Only a hand-crafted request does, and it harms the requester's own quota, plus Sentry noise within the 20/h coach rate limit.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-server-static-ai-layer/coach-v3.mts: '[null] consent true schema ok: true -> THROWS: Cannot read properties of null (reading 'finyk')'; '[null] consent false -> prompt ok'; '[{correlations:5}] consent true -> THROWS: number 5 is not iterable'. useCoachInsight.ts:322-330 memory comes from coachApi.getMemory(); CoachMemoryPostSchema api.ts:1131-1145.
```

<a id="rel-47"></a>

### `rel-47` [low] Рекурсивний depth-guard профілю сам падає зі stack overflow на глибоко вкладених масивах

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** packages/shared schemas (PUT /api/me/profile)
- **Де:** packages/shared/src/schemas/api.ts:346-358,390-392
- **Першопричина:** jsonNestingDepth рекурсує через Array.map і spread Math.max без обмеження глибини, а другий .refine в UserProfilePayloadSchema не має try/catch. Масиви не враховуються в ліміті вкладеності 3, тож тіло ~10 КБ з 3000-5000 рівнями проходить byte-cap.
- **Вплив:** Неперехоплений RangeError дає 500 і Sentry-подію на кожен такий запит. Атака дешева за розміром тіла, але потребує автентифікації.
- **Що зробити:** Переписати jsonNestingDepth ітеративно з явним стеком або зупиняти обхід одразу після перевищення ліміту.
- **Примітка:** Верифікатор на прогрітому сервері не відтворив: глибини 3000-4000 дають 200, а від 4100 спрацьовує інший guard з 400. Код і лог фіндера (RangeError at jsonNestingDepth) дефект підтверджують, поріг залежить від стеку процесу. Фіндер ставив medium.

Знахідок у кластері: 1.

#### [low] Рекурсивний depth-guard профілю сам падає зі stack overflow на глибоко вкладених масивах (PUT /api/me/profile -&gt; 500)

- **ID:** `api-live/input-fuzz#4` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `crash`
- **Серйозність від шукача:** medium
- **Де:** packages/shared/src/schemas/api.ts:346-358 (jsonNestingDepth, рекурсія через Array.map) + :390-392 (refine у UserProfilePayloadSchema)
- **Вплив:** Гард, що мав обмежити вкладеність профілю трьома рівнями, сам crash-абельний вкладеністю: ~10KB тіло (під cap) дає неперехоплений RangeError -&gt; 500 + Sentry на кожен запит. Автентифіковано, дешево по тілу. Стабільний 500 у спільній схемі, яку імпортують і інші поверхні.
- **Рекомендація:** Переписати jsonNestingDepth ітеративно (явний стек) або додати ранній guard на глибину обходу, що повертає 'перевищено' замість рекурсії без дна.

**Докази:**

```text
PUT /api/me/profile (fuzz2), тіло {profile:{x:[[[...]]]}}: глибина 1000 -> 200; 3000 -> 500; 5000 -> 500. server.log requestId 0bab0113: 'RangeError: Maximum call stack size exceeded at jsonNestingDepth (api.ts:349)'. Масиви прозорі для depth-ліміту 3, тож 5000-рівневий масив (~10KB, < 16KB cap) проходить byte-cap, а потім краш у самому чекері.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_profile.mjs fuzz2 (PUT profile x=nested arrays 1000/3000/5000).
```

**Верифікатор:**

```text
У коді: jsonNestingDepth (packages/shared/src/schemas/api.ts:346-358) рекурсивний через Array.map і spread Math.max, без обмеження глибини. Виклик стоїть у другому .refine без try/catch, на відміну від першого refine з JSON.stringify. RangeError вилітає з safeParse повз parseBody, отже маємо 500 і Sentry. На поточному, вже прогрітому сервері відтворити не вдалося: глибини 3000-4000 дають 200, а з ≥4100 перехоплений overflow у JSON.stringify дає 400 'must be at most 16384 bytes'. Причина в тому, що після JIT-оптимізації кадри стеку менші. Але в холодному процесі (node --import tsx, сама схема) safeParse кидає 'RangeError: Maximum call stack size exceeded at jsonNestingDepth (api.ts:349)' вже з глибини 2500 (на 2000 ще OK). Лог фіндера з попереднього інстансу сервера (requestId 0bab0113, tasks/bb6ksy0e6.output) показує ту саму помилку з PUT /api/me/profile → 500. Після кожного рестарту чи деплою баг досяжний тілом ~5-6KB. Severity знижено до low: це лише 500 на власний запит автентифікованого юзера. Процес не падає (Express ловить помилку per-request), даних не зачіпає. «Інші поверхні» схему не використовують: UserProfilePayloadSchema споживає лише routes/me.ts.
```

**Додаткові докази верифікатора:**

```text
Холодний процес (v5_depth_cold.mts): '2000 OK; 2500/3000/3500/4000 THROW RangeError … jsonNestingDepth'. Прогрітий сервер (r2/v4b_depth.mjs): 3000..4000 дають 200, 4100..5000 дають 400.
```

<a id="rel-48"></a>

### `rel-48` [low] DELETE /api/me валідує тіло сирим .parse(): криве тіло дає 500 замість 400

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: me
- **Де:** apps/server/src/routes/me.ts:282
- **Першопричина:** routes/me.ts викликає MeDeleteBodySchema.parse(req.body ?? {}) замість parseBody, тож ZodError не перетворюється на операційну 400.
- **Вплив:** Масив, число чи порожній пароль у формі видалення акаунта дають 500 INTERNAL і подію в Sentry. Акаунт не видаляється, бо пароль усе одно звіряється.
- **Що зробити:** Замінити виклик на parseBody(MeDeleteBodySchema, req).

Знахідок у кластері: 1.

#### [low] DELETE /api/me валідує тіло сирим .parse() замість parseBody -&gt; 500 (а не 400) на масиві/числі/порожньому паролі

- **ID:** `api-live/input-fuzz#7` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `crash`
- **Де:** apps/server/src/routes/me.ts:~292 (MeDeleteBodySchema.parse(req.body ?? {}) — прямий .parse, не http/validate.ts parseBody)
- **Вплив:** ZodError від сирого .parse не конвертується в операційну 400, а бульбашить в errorHandler як programmer-error -&gt; 500 INTERNAL + Sentry. Криве тіло форми видалення дає 500 замість 400 VALIDATION. Без ризику видалення (пароль усе одно звіряється), але зайвий шум 500/Sentry і непослідовна форма помилки на чутливому роуті.
- **Рекомендація:** Замінити MeDeleteBodySchema.parse(req.body ?? {}) на parseBody(MeDeleteBodySchema, req).

**Докази:**

```text
DELETE /api/me (fuzz2): тіло [] -> 500 INTERNAL; {password:123} -> 500; {password:''} -> 500; {password:'x'x129} -> 500. Контроль: {password:'wrong-password'} -> 400 INVALID_PASSWORD; {} -> 400 INVALID_PASSWORD. Акаунт не видаляється.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_semantic.mjs (секція DELETE /api/me body []/password:123/''/x*129).
```

**Верифікатор:**

```text
У коді: routes/me.ts:282 викликає `MeDeleteBodySchema.parse(req.body ?? {})`, тобто сирий Zod .parse, а не parseBody. ZodError не є AppError, тож errorHandler віддає 500 INTERNAL і шле подію в Sentry. Схема (packages/shared/src/schemas/api.ts:264-266) вимагає password як рядок 1..128 або відсутнє поле. Живцем на власному користувачі: [], {password:123}, {password:''} і {password:'x'×129} дають 500 INTERNAL. Контролі {} і хибний пароль дають 400 INVALID_PASSWORD. deletion-status лишається {pending:false}, акаунт не зачеплено. Severity low підтверджую: ризику видалення немає, лише неправильний статус (500 замість 400) і шум у Sentry.
```

**Додаткові докази верифікатора:**

```text
r2/v1_nul.mjs, секція #7: 4×500 INTERNAL і 2×400 INVALID_PASSWORD; GET /api/me/deletion-status повертає {pending:false}.
```

<a id="rel-49"></a>

### `rel-49` [low] Ключ з URL у Record-мапі: ?reason=**proto** чи ?error=**proto** кладе застосунок у фейкову «500»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: налаштування Сільпо / verify-email
- **Де:** apps/web/src/core/hub/HubSettingsPage.tsx:555-558; apps/web/src/core/auth/VerifyEmailPage.tsx:204
- **Першопричина:** SILPO_ERROR_REASON_MESSAGES[reason] і ERROR_COPY[errorCode] шукаються звичайною індексацією, тож **proto** повертає Object.prototype, і React кидає error #31, коли намагається відрендерити об'єкт.
- **Вплив:** Сторонній лінк показує повноекранне «500 Щось пішло не так. Сервер тимчасово не зміг обробити запит». На /verify-email людина не дізнається, чому підтвердження не вдалося, а ?error=constructor дає порожній alert.
- **Що зробити:** Шукати через Object.hasOwn(MAP, key) або тримати мапи як Map чи Object.create(null). Перед рендером перевіряти typeof === 'string'.
- **Примітка:** Верифікатор уточнив, що для /verify-email reload не допомагає.

Знахідок у кластері: 1.

#### [low] Lookup у Record-мапі за ключем з URL: `?reason=__proto__` / `?error=__proto__` валять увесь застосунок у сторінку «500 Щось пішло не так»

- **ID:** `client-static/web-xss-injection#3` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `crash`
- **Де:** apps/web/src/core/hub/HubSettingsPage.tsx:555-558 (SILPO_ERROR_REASON_MESSAGES[reason]); apps/web/src/core/auth/VerifyEmailPage.tsx:204 (ERROR_COPY[errorCode])
- **Вплив:** Сторонній лінк кладе весь застосунок у фейкову «серверну помилку 500». Ефект одноразовий: reload лікує, бо параметри вже прибрано з URL. UX вводить в оману, а для verify-email людина не бачить, чому не вдалось підтвердити email. Патерн `CONST_MAP[userInput]` може повторюватись і деінде.
- **Рекомендація:** Шукати через `Object.hasOwn(MAP, key) ? MAP[key] : fallback` або тримати мапи як `Map`/`Object.create(null)`. Додати перевірку типу `typeof v === "string"` перед рендером. Можна додати лінт-правило на індексацію `Record&lt;string,string&gt;` даними з URL.

**Докази:**

```text
`(reason && SILPO_ERROR_REASON_MESSAGES[reason]) ?? "Не вдалося звʼязати Сільпо."`: для `__proto__` повертається Object.prototype (об'єкт), він потрапляє в toast або JSX, і React кидає `Minified React error #31 … object with keys {}`. Спостерігалось: `/settings?silpo=error&reason=__proto__` показує повноекранне «500 Щось пішло не так. Сервер тимчасово не зміг обробити запит» (shots/client-static-web-xss-injection/silpo-reason-proto.png). `/verify-email?error=__proto__` (анонімно) дає те саме. `?error=constructor` віддає функцію, і alert про помилку рендериться порожнім.
```

**Відтворення:**

```text
<scratch>/agents/client-static-web-xss-injection/silpo-proto.mjs і verify-proto.mjs, або вручну відкрити `http://127.0.0.1:4173/verify-email?error=__proto__`.
```

**Верифікатор:**

```text
Відтворено в браузері. /verify-email?error=__proto__ (анонімно) і /settings?silpo=error&reason=__proto__ (залогінений) показують повноекранне «500 Щось пішло не так. Сервер тимчасово не зміг обробити запит» з `Minified React error #31 ... object with keys {}`. Причина: ERR_COPY[errorCode] і SILPO_ERROR_REASON_MESSAGES[reason] повертають Object.prototype. ?error=constructor не валить сторінку, але рендерить порожній alert без пояснення. Одна поправка до знахідки: для /verify-email reload НЕ лікує, бо параметр error лишається в URL, тож сторінка падає знову. Для silpo reload лікує, бо параметри прибрано з URL. Severity low коректна: це UX-краш через сторонній лінк без доступу до даних.
```

**Додаткові докази верифікатора:**

```text
Скрипт: <scratch>/agents/verify-client-static-web-xss-injection/v3-proto.mjs. Вивід: `[verify-proto] ... 500 Щось пішло не так ... errs=["Error: Minified React error #31 ...object%20with%20keys%20%7B%7D"]` і `after reload url=/verify-email?error=__proto__ text=Помилка сервера...`. `[silpo-proto] url=/?tab=settings&group=modules#settings-finyk text=... 500 ...`, після reload нормальна сторінка. Скріни: shots/verify-client-static-web-xss-injection/v3-verify-proto.png, v3-silpo-proto.png. Код: HubSettingsPage.tsx:558, VerifyEmailPage.tsx:204 (`(errorCode && ERROR_COPY[errorCode]) || FALLBACK_ERROR_COPY`).
```

<a id="rel-50"></a>

### `rel-50` [low] BullMQ Worker-и без обробника 'error': збої Redis і зупинка run-loop ідуть у console.error повз pino

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: черги (authMail, ftuxDrip, ai-memory ingest)
- **Де:** apps/server/src/lib/jobs/authMail.ts:271-283; apps/server/src/lib/jobs/ftuxDrip.ts:319-332; apps/server/src/modules/ai-memory/ingestQueue.ts:589-599
- **Першопричина:** На Worker підписано лише подію 'failed'. Без слухача 'error' bullmq пише помилку в console.error, а відхилений run() мовчки зупиняє воркер.
- **Вплив:** Інциденти з чергою auth-листів (верифікація, скидання пароля) не видно ні в структурованих логах, ні в Loki-алертах, ні в Sentry. Зупинений run-loop не дає жодного сигналу, крім того, що листи не приходять.
- **Що зробити:** Додати worker.on('error') з logger.error і лічильником і показувати isRunning() воркерів у /health/workers.
- **Примітка:** Проявляється лише з REDIS_URL. Локально Redis не запущений, тож це перевірено runtime-репро з тими самими опціями.

Знахідок у кластері: 1.

#### [low] BullMQ Worker-и без обробника 'error': помилки Redis і падіння run-loop ідуть у console.error повз pino, редакцію й метрики

- **ID:** `server-static/reliability-ops#10` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/lib/jobs/authMail.ts:271-283; apps/server/src/lib/jobs/ftuxDrip.ts:319-332; apps/server/src/modules/ai-memory/ingestQueue.ts:589-599
- **Вплив:** Інциденти з чергою auth-листів (верифікація, скидання пароля) не видно в структурованих логах, Loki-алертах і Sentry. Зупинений run-loop не дає жодного сигналу, крім відсутності листів.
- **Рекомендація:** Додати `worker.on("error", err =&gt; logger.error({ msg: "&lt;queue&gt;_worker_error", err: serializeError(err) }))` і лічильник. У /health/workers показувати `isRunning()` для authMail і ftuxDrip.

**Докази:**

```text
На Worker підписано лише `.on("failed", ...)`; `.on("error")` є тільки на Queue. bullmq 5.80.2 queue-base.js:89-99: `emit(event,...){ try { return super.emit(event,...) } catch (err) { try { return super.emit('error', err) } catch (err) { console.error(err) } } }`. worker.js:116 `this.run().catch(error => this.emit('error', error))`, worker.js:129 `this.blockingConnection.on('error', error => this.emit('error', error))`.
```

**Відтворення:**

```text
При REDIS_URL, що вказує на недоступний Redis, або при обриві Redis у проді: стек-трейси пишуться в stdout неструктурованим console.error, а в pino JSON рядків немає. Якщо run() відхилився, воркер мовчки перестає брати задачі (auth-листи й drip лежать у черзі).
```

**Верифікатор:**

```text
I verified this in code and with a runtime repro. authMail.ts:271-283, ftuxDrip.ts:319-332 and ingestQueue.ts:589-599 attach only `.on('failed')` to the Worker. bullmq 5.80.2 (node_modules/bullmq) behaves as quoted: QueueBase.emit falls back to console.error when there is no 'error' listener (queue-base.js:89-99), the blocking connection's errors are re-emitted (worker.js:129), and so is a rejection from run() (worker.js:116). Repro: a Worker built with the same options as createBullConnection, pointed at a dead Redis, produced 28 unstructured console.error stack traces in 5 s. One part of the impact is overstated. The base ioredis client does have a pino listener (connection.ts:32, msg bullmq_connection_error), and over the same 5 s it fired 14 times, so a full Redis outage is visible in structured logs. What reaches only stderr is errors from the duplicated blocking connection, run-loop and stalled-checker failures, and non-connection worker errors. During an outage these also double the noise as unredacted stderr lines. A silently stopped run-loop is real but rare. Low is fair.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-server-static-reliability-ops/r2-bull-worker.mjs. Output: {pinoLikeBaseConnErrors:14, workerErrorsToConsoleError:28, sample:'Error: connect ECONNREFUSED 127.0.0.1:6491 | at TCPConnectWrap.afterConnect', isRunning:true}. worker.js:123 duplicates the connection, so the blocking client does not inherit the app's pino 'error' listener. /health/workers reports only aiMemoryIngest and nothing for the authMail or ftuxDrip workers.
```

<a id="rel-51"></a>

### `rel-51` [low] Gauge http_in_flight зростає на кожному перерваному запиті, а такі запити випадають з access-log і RED-метрик

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: observability
- **Де:** apps/server/src/http/requestLog.ts:51-103; apps/server/src/http/timeout.ts:76-85
- **Першопричина:** requestLog робить httpInFlight.inc на початку запиту, а dec і рядок access-log пише лише в res.on('finish'). Для обірваних клієнтом запитів, SSE і 408 з req.destroy() подія 'finish' не настає.
- **Вплив:** Панель in-flight показує фантомне навантаження, яке скидається лише рестартом. Саме проблемні запити зникають з метрик латентності й помилок, хоча частина з них лишається в логах як request_failed.
- **Що зробити:** Робити dec і логування в одноразовому обробнику, підписаному і на 'finish', і на 'close', з прапорцем aborted.

Знахідок у кластері: 1.

#### [low] Gauge http_in_flight зростає назавжди на кожному перерваному запиті, а такі запити взагалі не потрапляють в access-log

- **ID:** `server-static/reliability-ops#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/http/requestLog.ts (httpInFlight.inc на старті, dec лише в res.on("finish")); також 408-гілка apps/server/src/http/timeout.ts:76-85 (req.destroy())
- **Вплив:** Панель `sum by (method) (http_in_flight)` (docs/operations/observability/dashboards/http-red.json:158) з часом показує фантомне навантаження, яке скидається лише рестартом. Перервані клієнтом запити, обірвані SSE та таймаути з req.destroy() не мають жодного рядка `http` у логах і не потрапляють у лічильники латентності й помилок, тобто зникають саме проблемні запити.
- **Рекомендація:** Робити dec і логування в одноразовому обробнику, підписаному і на 'finish', і на 'close' (з прапорцем `aborted: !res.writableFinished`).

**Докази:**

```text
`httpInFlight.inc({ method: req.method }); res.on("finish", () => { httpInFlight.dec(...); logger[level]({ msg: "http", ...}) ... })`: обробника 'close' немає. Живий тест (scratch inflight.mjs: 3 POST з Content-Length 1000, обірвані через 300 мс): до `http_in_flight{method="POST"} 19`, після `22`, і через хвилину досі `22`. Базове значення 19/8 на майже простоюючому сервері само по собі показує накопичений дрейф.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-reliability-ops/inflight.mjs, потім inflight2.mjs: значення не повертається.
```

**Верифікатор:**

```text
Перевірено в коді: requestLog.ts:51 робить httpInFlight.inc, а dec і рядок access-log `http` стоять лише в res.on('finish') (53-103), обробника 'close' немає. Для обірваного клієнтом запиту 'finish' не настає, тож gauge росте назавжди. Відтворено наживо. Одне уточнення до знахідки: обрив під час читання тіла body-parser перетворює на помилку ECONNABORTED, і errorHandler пише рядок `request_failed`. Тож такі запити «зникають» лише з access-log `http` і метрик RED, а з логів повністю не пропадають. Low залишаю: це лише точність спостережуваності.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-reliability-ops/inflight-verify.mjs: before POST=15; after 3 truncated POSTs (Content-Length 1000, socket destroy через 300 мс) POST=18; контрольні 3 повні GET не змінили значення; через 20 с POST досі 18. У server.log для цих запитів є лише `request_failed` ... code ECONNABORTED (status 400), рядка `msg:"http"` немає.
```

<a id="rel-52"></a>

### `rel-52` [low] Анонімні /api/feedback і /api/waitlist обмежені лише per-IP, без агрегації IPv6 /64

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: feedback / waitlist
- **Де:** apps/server/src/routes/feedback.ts:74-83; apps/server/src/routes/waitlist.ts:94-114; apps/server/src/http/rateLimit.ts:92-98,277-281
- **Першопричина:** Лімітер ключує ip:${req.ip} повною адресою; нормалізація до /64 є лише в sessionFingerprint. Сесії, капчі, дедупу й retention немає, а /api/v1/waitlist — мертва реєстрація.
- **Вплив:** Кожна нова адреса в межах одного /64 отримує свіжий бакет, тож таблиці feedback_entries і waitlist_entries можна необмежено засмічувати сміттям і чужими email.
- **Що зробити:** Ключувати анонімні ліміти за /64 для IPv6, додати глобальну добову стелю вставок і легку капчу. Прибрати мертвий маршрут /api/v1/waitlist.

Знахідок у кластері: 1.

#### [low] Анонімні /api/feedback і /api/waitlist обмежені лише per-IP без нормалізації IPv6 — спам/роздування таблиць

- **ID:** `server-static/webhooks-billing-quota#19` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/routes/feedback.ts:74-83; apps/server/src/routes/waitlist.ts:94-114; apps/server/src/http/rateLimit.ts:92-98,277-281
- **Вплив:** Необмежене роздування feedback_entries/waitlist_entries сміттям і забруднення списку waitlist чужими адресами (ризик, якщо згодом по ньому робитимуть розсилку).
- **Рекомендація:** Ключувати анонімні ліміти по /64 для IPv6, додати глобальну добову стелю на вставки, легку капчу/turnstile або proof-of-work; прибрати мертву реєстрацію /api/v1/waitlist.

**Докази:**

```text
Ліміти 20/год і 10/год на `ip:${req.ip}` (повна адреса, без /64-агрегації — сам код у chat.ts визнає «IPv6-клієнт має під підпискою цілу /64»). Сесія/капча не потрібні; feedback — до 2000 символів message + 2048 page на рядок, без дедупу і retention; waitlist приймає будь-які email. Роут `/api/v1/waitlist` недосяжний (apiVersionRewrite переписує /api/v1 до роутингу) — мертвий код.
```

**Відтворення:**

```text
Ротуючи адреси в межах одного IPv6 /64, слати POST /api/feedback {category, message: 2000 символів} з X-Requested-With → кожна адреса має власний бакет 20/год.
```

**Верифікатор:**

```text
Відтворено. Обидва роути ставлять rateLimitExpress перед будь-яким резолвом сесії, тому rateLimitSubject завжди повертає `ip:${req.ip}` з повною адресою, без агрегації по /64 (http/rateLimit.ts:92-98, 277-281). Нормалізація /64 є лише в sessionFingerprint, лімітер її не використовує. Живий прогін з X-Forwarded-For (TRUST_PROXY=1): адреса 2001:db8:abcd:12::1 отримала 10×200, потім 429. Одразу після цього ::2, ::3 і ::ffff з того самого /64 отримали 200. Підтвердження про мертвий код теж правильне: apiVersionRewrite (app.ts:45-56, змонтований до роутерів) переписує /api/v1/* у /api/*, тому реєстрації `/api/v1/waitlist` і `/api/v1/feedback` ніколи не матчаться. Проте orphaned-code-audit записує ці пари як навмисні alias-и, і шкоди від них немає. Що знижує вагу: waitlist не шле листів, тож вектора email-спаму немає, лише сміття в таблиці. Поле feedback обмежене 2000 символами. Обхід per-IP лімітів через багато IPv4 (проксі, ботнет) однаково можливий. Чи віддає продовий API трафік по IPv6 (AAAA-запис, Traefik), не перевірено. Severity low коректна.
```

**Додаткові докази верифікатора:**

```text
scratchpad/agents/verify-server-static-webhooks-billing-quota/v19_ipv6.mjs: ::1 #1-#10 → 200, #11 → 429 «Спробуй через 3600 секунд»; ::2/::3/::ffff (той самий /64) → 200; /api/v1/waitlist з ::4 → 200 (через rewrite, той самий handler). Збережено один рядок waitlist: та сама email, ON CONFLICT DO NOTHING. Корінь проблеми (IP-ключ лімітера без /64) вже описаний у docs/work/specs/audits/ai-abuse-2026-08-05.md:58 і 2026-09-13-product-full-review.md:2588, але для AI-роутів. Там лікували через requireSession, що для анонімних feedback і waitlist не застосовне. Конкретно ці роути ніде не трекаються.
```

<a id="rel-53"></a>

### `rel-53` [low] Клієнтський X-Request-Id довільного формату приймається як requestId у логах, Sentry і відповідях

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: observability
- **Де:** apps/server/src/http/requestId.ts:10-11; apps/server/src/obs/logger.ts:316; apps/server/src/sentry.ts:331-336
- **Першопричина:** requestId.ts перевіряє лише довжину до 128 символів і не перевіряє формат.
- **Вплив:** Можна підробити кореляцію запитів (видати свої за чужі в тікетах і Loki) або засмітити логи довільним текстом чи PII. Веб-клієнт цей заголовок не надсилає, тож приймати зовнішнє значення нема потреби.
- **Що зробити:** Приймати вхідний id лише за суворим патерном (UUID або hex до 64 символів) або писати його в окреме поле clientRequestId, а серверний requestId генерувати завжди.

Знахідок у кластері: 1.

#### [low] Клієнтський X-Request-Id (до 128 довільних символів) приймається як requestId у логах, Sentry-тегах і відповідях

- **ID:** `server-static/privacy-logging#12` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Де:** apps/server/src/http/requestId.ts:10-11; apps/server/src/obs/logger.ts:316; apps/server/src/sentry.ts:331-336
- **Вплив:** Можна підробити кореляцію (видати свої запити за чужі requestId у тікетах/Loki), засмітити логи довільним текстом або PII, що ускладнює розслідування інцидентів.
- **Рекомендація:** Приймати вхідний id лише за суворим патерном (UUID/hex ≤64) або зберігати його окремим полем clientRequestId, генеруючи серверний requestId завжди.

**Докази:**

```text
`const incoming = req.get("x-request-id")?.trim(); const id = incoming && incoming.length <= 128 ? incoming : randomUUID();` — без перевірки формату. Значення потрапляє в кожен лог-рядок (mixin requestId), у Sentry tags.requestId і в тіло помилок.
```

**Відтворення:**

```text
Надіслати будь-який запит з заголовком X-Request-Id: <чужий requestId або довільний текст> і переглянути server log.
```

**Верифікатор:**

```text
Відтворено наживо. GET /api/me і GET на неіснуючий шлях з `X-Request-Id: V3-REQID-<ts> victim@example.com <b>x</b>` повертаються з цим самим значенням у заголовку X-Request-Id. Server log містить `"requestId":"V3-REQID-... victim@example.com <b>x</b>"` у рядках http access-логу. Код requestId.ts:10-11 перевіряє лише довжину ≤128. sentry.ts:331-336 кладе значення в tags.requestId. Клієнт (packages/api-client/httpClient.ts:446) X-Request-Id лише читає і не надсилає, тож прийом довільного значення нічому не служить. Пом'якшення, що тримають severity на low і роблять це скоріше defense-in-depth: pino пише JSON з екрануванням, Node відкидає CR/LF у заголовках, тож ін'єкції рядків логу немає. Відповіді JSON, а 404 віддає express-сторінку без рефлексії id у тілі, тож XSS немає. Атакувальник може промаркувати лише власні запити. Реальний ефект: плутанина кореляції під час розслідувань і довільний текст у логах і Sentry-тегах.
```

**Додаткові докази верифікатора:**

```text
Probe <scratch>/agents/verify-server-static-privacy-logging/v3/probe.mjs → `REQID 401 "V3-REQID-1790907290663 victim@example.com <b>x</b>"`. server.log: {"level":"warn",...,"requestId":"V3-REQID-1790907290663 victim@example.com <b>x</b>",...,"path":"/api/me","status":401}. У docs/work/specs/audits/ і docs/open-work.md згадок x-request-id немає.
```

<a id="rel-54"></a>

### `rel-54` [low] Немає індексів на шляхах Better Auth verification і кількох FK, а частина індексів дублює PK

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** server: db-schema
- **Де:** apps/server/src/migrations/003_baseline_schema.sql:41-48; apps/server/src/migrations/009_waitlist.sql:12; apps/server/src/migrations/028_openclaw.sql; apps/server/src/modules/logRetention/archivePoller.ts:74,294
- **Першопричина:** Таблиця verification має лише PK(id), хоча Better Auth на кожен lookup робить findMany за identifier з сортуванням за createdAt і deleteMany за expiresAt. FK waitlist_entries.user_id і openclaw__.invocation_id не мають індексу. Таблиці finyk__ мають індекси, що є префіксами PK.
- **Вплив:** Поки таблиці малі, вплив мізерний. З їх ростом сповільнюються reset-password, verify-email і видалення акаунта, а зайві індекси збільшують вартість запису.
- **Що зробити:** Створити індекси verification(identifier, createdAt DESC), verification(expiresAt) і waitlist_entries(user_id). Прибрати дублікати в finyk_*. Індекси openclaw — разом із фазою 2 видалення цих таблиць.

Знахідок у кластері: 1.

#### [low] Відсутні індекси на шляхах Better Auth і FK; дубльовані індекси

- **ID:** `server-static/db-migrations#8` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `perf`
- **Де:** apps/server/src/migrations/003_baseline_schema.sql:41-48 (verification); 009_waitlist.sql:12; 028_openclaw.sql (invocation FK); apps/server/src/modules/logRetention/archivePoller.ts:74, 294; node_modules/better-auth/dist/db/internal-adapter.mjs:590-627
- **Вплив:** Поки таблиці малі — копійки; з ростом verification/waitlist сповільнюються reset-password/verify-email і видалення акаунта; зайві індекси додають write amplification на гарячі sync-таблиці.
- **Рекомендація:** CREATE INDEX на verification(identifier, "createdAt" DESC) і verification("expiresAt"); індекс на waitlist_entries(user_id); прибрати дублікати індексів (finyk_*), openclaw FK-індекси — разом із фазою 2 видалення цих таблиць (152).

**Докази:**

```text
verification має лише PK(id). Better Auth на кожен lookup робить `findMany where identifier=? sortBy createdAt desc limit 1` і `deleteMany where expiresAt < now()` — обидва seq scan. FK без придатного індексу (запит до pg_index): waitlist_entries.user_id (ON DELETE SET NULL -> скан на кожне видалення user), openclaw_decisions/openclaw_write_audit/openclaw_reminders.invocation_id (archivePoller видаляє openclaw_invocations батчами -> скан 3 таблиць на кожен рядок). Надлишкові: finyk_networth_history_user_month_idx = PK, finyk_tx_categories_user_idx/finyk_tx_splits_user_idx/finyk_mono_debt_links_user_idx/email_unsubscribes_user_idx — префікси PK/unique.
```

**Відтворення:**

```text
psql: запит FK-vs-index (fk_idx.sql у scratch-каталозі агента) дав has_full_idx=false для 4 FK; запит дублікатів індексів — 15 збігів.
```

**Верифікатор:**

```text
Факти підтверджено. pg_indexes показує, що в `verification` є лише `verification_pkey(id)`. `auth.ts` не налаштовує `secondaryStorage`, тож Better Auth `findVerificationValue` (node_modules/better-auth/dist/db/internal-adapter.mjs:590-627) робить `findMany where identifier ... sortBy createdAt desc limit 1` і на кожен lookup `deleteMany expiresAt < now`, обидва запити без придатного індексу. Повторний запуск fk_idx.sql дає has_full_idx=f рівно для 4 FK: waitlist_entries.user_id (ON DELETE SET NULL), openclaw_decisions/openclaw_write_audit/openclaw_reminders.invocation_id. Надлишкові індекси підтверджено: finyk_networth_history_user_month_idx(user_id, month DESC) дублює PK(user_id, month), бо btree сканується і в зворотному напрямку; *_user_idx(user_id) на finyk_tx_categories/finyk_tx_splits/finyk_mono_debt_links і email_unsubscribes_user_idx є префіксами PK або unique. Вплив у звіті перебільшено. `verification` очищається на кожному lookup, тож тримає лише живі токени (локально 1 рядок): seq scan тут копійчаний. `openclaw_invocations` більше ніхто не пише (status.ts:154, ADR-0075), а три openclaw-таблиці позначені DEPRECATED у 152, тож сканувати при архівації нічого. Waitlist крихі …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Розміри локально (pg_stat_user_tables): verification=1, waitlist_entries=3, openclaw_invocations=0, finyk_tx_categories=4002. У migration 152: 'openclaw_invocations (жива)' виключено з депрекації, але в коді писарів немає (grep: лише archivePoller/metrics/коментарі). Правило 4 дозволяє DROP INDEX без TWO-PHASE-DROP заголовка, тож прибрати дублі можна однією міграцією.
```

<a id="rel-55"></a>

### `rel-55` [low] Курсор pull однопристроєвого користувача назавжди лишається since=0: кожен pull сканує всю історію

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web sync reader + server sync v2
- **Де:** apps/web/src/core/syncEngine/syncEngineReader.ts:228-236; apps/server/src/modules/sync/syncV2.ts:653-663
- **Першопричина:** Сервер відкидає власні оп-и пристрою (origin_device_id IS DISTINCT FROM), тож для єдиного пристрою сторінка завжди порожня. Клієнт просуває курсор лише при page.ops.length &gt; 0, а high-water mark сервер не повертає.
- **Вплив:** Вартість кожного pull росте з усією історією sync_op_log користувача: 22 з 26 користувачів у лозі завжди на since=0. При цьому pull іде після кожного push.
- **Що зробити:** Повертати з сервера high-water mark (максимальний переглянутий id) навіть для порожньої сторінки і зберігати його як курсор. Це зміна контракту: оновити сервер, api-client і тест разом (Hard Rule #3).

Знахідок у кластері: 1.

#### [low] Курсор pull для однопристроєвого користувача назавжди лишається since=0: кожен pull сканує всю історію операцій

- **ID:** `browser-surfaces/nutrition-flows#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Де:** apps/web/src/core/syncEngine/syncEngineReader.ts:228-236 (курсор оновлюється лише коли page.ops.length &gt; 0); apps/server/src/modules/sync/syncV2.ts:653-663 (фільтр origin_device_id IS DISTINCT FROM $3)
- **Вплив:** Вартість кожного pull росте з усією історією sync_op_log користувача (разом із квадратичним ростом операцій комори), навантажуючи БД без потреби.
- **Рекомендація:** Повертати з сервера high-water mark (max id, переглянутий запитом) навіть коли ops порожні, і зберігати його як курсор; або фільтрувати власні операції на клієнті після просування курсора.

**Докази:**

```text
Сервер відкидає власні операції пристрою, тож для одного пристрою відповідь завжди порожня і клієнт не просуває курсор. Лог сервера (262 v2_pull): ('since0','empty') 177, ('since0','ok') 33; 'users always since0: 22 of 26'. Кожна мутація комори викликає pull?since=0&limit=500 (див. мережевий лог 11-sync-429.mjs).
```

**Відтворення:**

```text
grep '"op":"v2_pull"' server.log і порахувати since; або в будь-якому скрипті з мутаціями дивитись запити /api/v2/sync/pull?since=0.
```

**Верифікатор:**

```text
Підтверджено кодом. syncV2Pull фільтрує `origin_device_id IS DISTINCT FROM $3`, тож для єдиного пристрою відповідь порожня. syncEngineReader пише курсор лише при `page.ops.length > 0` (writePullSinceCursor викликається тільки там), а сервер не повертає high-water mark. Курсор назавжди лишається 0, і кожен pull сканує всю історію користувача. Наслідок суто продуктивнісний, коректності не ламає.
```

**Додаткові докази верифікатора:**

```text
Живий server log: з 1132 подій v2_pull 559 мають since:0. EXPLAIN для однопристроєвого користувача з 2450 ops: Index Scan sync_op_log_pkey, Rows Removed by Filter 20767, 6061 buffers, 12 мс, rows=0. Тобто порожня відповідь коштує повного проходу, і вартість росте з історією, а разом з нею і з квадратичним ростом ops комори з #3.
```

<a id="rel-56"></a>

### `rel-56` [low] Фонові запити синку не зупиняються в прихованій вкладці, а get-session смикається на кожному push-тіку навіть з порожньою чергою

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: sync engine
- **Де:** apps/web/src/core/syncEngine/singleton.ts:490-493,603-605; apps/web/src/core/syncEngine/syncEngineReader.ts:288-293; packages/api-client/src/endpoints/syncV2.pushScheduler.ts:259-266
- **Першопричина:** Планувальник push (setInterval ~30 с) і reader pull (~60 с) не мають гейта за visibility. Drain-обгортка викликає resolveUserId → GET /api/auth/get-session ще до перевірки, чи є що відправляти.
- **Вплив:** Кожна відкрита, навіть фонова, вкладка робить ~4 запити на хвилину без кінця, і ~3 з них — непотрібний DB-lookup сесії. На масштабі це зайве навантаження на auth і на батарею.
- **Що зробити:** Брати userId з AuthContext замість get-session на кожен тік і перевіряти локальний COUNT outbox до мережевого запиту. Ставити інтервали на паузу при visibilityState='hidden' і робити один тік на поверненні.

Знахідок у кластері: 1.

#### [low] Фонові запити не зупиняються в прихованій вкладці; get-session дергається на кожному push-тіку навіть з порожньою чергою

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Де:** apps/web/src/core/syncEngine/singleton.ts:490-493 і 603-605 (drain → resolveUserId → GET /api/auth/get-session на кожен тік ~30 с); apps/web/src/core/syncEngine/syncEngineReader.ts:288-293 (setInterval pull ~60 с без перевірки visibility); packages/api-client/src/endpoints/syncV2.pushScheduler.ts:262-266
- **Вплив:** Кожна відкрита (навіть фонова) вкладка робить ~4 запити/хв назавжди, з них ~3 це DB-lookup сесії без потреби. У Chrome після 5 хв прихованості таймери тротляться до 1/хв, але запити не зникають. На масштабі це зайве навантаження на auth і на батарею мобільних.
- **Рекомендація:** Кешувати userId з AuthContext (/api/v1/me) і не питати get-session на кожен тік. Нічого не дренувати при порожньому outbox (дешевий локальний COUNT перед resolveUserId). Ставити pull/push-інтервали на паузу при visibilityState='hidden' і робити один тік на поверненні: onVisibility уже є.

**Докази:**

```text
02-idle.mjs, 6 сторінок по 5 хв видимими і 3 хв прихованими (document.visibilityState='hidden' + visibilitychange). Видимо: '/' 21 запит (get-session 15, pull 6), /finyk 19, /routine 19, /nutrition 17, /fizruk 22, /chat 18, тобто 3.4–4.4 запити/хв. Приховано: '/' 12 запитів за 3 хв (get-session 8, pull 3), /routine 15, /fizruk 15, /chat 14, тобто темп не впав. Після 30 циклів навігації (01-leak.mjs) за 3 хв простою: get-session 10, pull 4, як і на свіжій сторінці, тобто дублів інтервалів немає (активних setInterval 5 до і після).
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/02-idle.mjs gap-longsess-1 5 3. Результат у 02-idle-5m.json.
```

**Верифікатор:**

```text
I confirmed it in the code and reproduced it live. The writer's push scheduler arms a plain setInterval(periodicTick, ~30 s ±20%) in start() (syncV2.pushScheduler.ts:259-263). syncEngineWriter.start() calls it with no visibility gate. Every tick goes through the drain wrapper (singleton.ts:603-605), and that wrapper calls shared.resolveUserId() → getSession() (singleton.ts:490-493) BEFORE it looks at the SQLite outbox. So a network round-trip happens on every tick, even when the outbox is empty. The reader works the same way: setInterval(scheduleTick, ~60 s) (syncEngineReader.ts:288-293), and pullOnce calls resolveUserId() → get-session and then /api/v2/sync/pull. Its onVisibility handler only adds an extra tick when the tab becomes visible. It never pauses anything when the tab is hidden. I found no ADR or code comment saying hidden tabs should keep polling. The only related comment is about follower tabs (claimDbOwnership), which is a different problem. deduplicatedGetSession only merges calls that overlap in time, so it does not cut the per-tick calls. One correction to the impact text: get-session is usually NOT a DB lookup. The server sets session.cookieCache {enabled, maxAge …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v8-idle.mjs (key verify-longsess-8), "/" route, 2.5 min visible then 2.5 min hidden. Real tab switching does not flip visibilityState in headless, so the hidden state used the property override plus a visibilitychange event. Visible: 12 req (get-session 9, pull 3) = 4.8/min. Hidden: 9 req (get-session 7, pull 2) = 3.6/min. All get-session responses were 200 at a ~30 s cadence (dt 1,30,35,59,88,92,117,146,148,...). Results are in <scratch>/agents/verify-browser-crosscut-gap-long-session-storage-pressure/v8-idle.json. In real Chrome, timers in hidden tabs get throttled (to 1 wake-up/min after 5 min), but nothing stops them. Not tracked in any earlier audit or in open-work. The only copy is the current run's staged 2026-10-01-full-app-audit/reliability.md, which lists it as "ще не перевірено" …[обрізано]
```

<a id="rel-57"></a>

### `rel-57` [low] Гість і далі б'є в auth-only ендпоінти (FUN-1 закрито не до кінця): 401 у консолі на кожному модулі

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: auth-гейти запитів
- **Де:** apps/web/src/core/billing/usePlan.ts:53-57; apps/web/src/core/lib/useModuleRouteLoader.ts:39-54,70-80; apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:76-83; apps/web/src/core/hub/chat/useChatSend.ts:174-178; apps/web/src/core/settings/useServerPreference.ts; apps/web/src/core/PricingPage.tsx:105-113
- **Першопричина:** Гейти перевіряють status === 'unauthenticated', тож поки /me у польоті (status 'loading'), запити billing/status і billing/providers з PricingPage і route-prefetch ідуть паралельно. mono/sync-state (prefetch і useMonobankWebhook), silpo/sync-state, chat/usage у useChatSend і PATCH me/preferences з онбордингу не мають гейта взагалі.
- **Вплив:** Кожен анонімний перегляд модуля дає 1-4 приречені запити з 401 у консолі: на 70 маршрутах це 23× billing/status і 20× mono/sync-state. Це шум у моніторингу 401 і зайве навантаження на IP-бакети. Авторизовані без Monobank щоразу отримують 404 на mono/sync-state.
- **Що зробити:** Гейтити на status === 'authenticated' через спільний useAuthedQuery у usePlan, useModuleRouteLoader, PricingPage, useAskAiQuota, useChatSend, useMonobankWebhook, useServerPreference і pushActiveModules. Коли Mono не підключено, віддавати 200 {connected:false}.
- **Примітка:** FUN-1 у docs/work/specs/audits/2026-09-01-product-audit/findings.md позначена «✅ виправлено», але відтворюється в чотирьох лейнах. Частину onboarding-ai-billing-ui#19 про потрійні preferences покриває rel-58.

Знахідок у кластері: 4.

#### [low] FUN-1 закрито не до кінця: анонім і далі б'є в автентифіковані ендпоінти (billing/status, mono/sync-state, chat/usage, me/preferences) з 401 у консоль

- **ID:** `client-static/web-route-guards#5` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `perf`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md (FUN-1, marked fixed but still reproduces)
- **Де:** apps/web/src/core/billing/usePlan.ts:53-57; apps/web/src/core/lib/useModuleRouteLoader.ts:39-54,70-80; apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:76-83; apps/web/src/core/hub/chat/useChatSend.ts:174-178; apps/web/src/core/settings/useServerPreference.ts; apps/web/src/core/PricingPage.tsx:105-113
- **Вплив:** Консольний шум на кожен вхід у модуль, зайве навантаження/рейт-лім-бакети на API, хибні сигнали в моніторингу 401; mono/sync-state у route-loader узагалі без гейта.
- **Рекомендація:** Гейтити на `status === "authenticated"` (не `!== "unauthenticated"`) у usePlan, useModuleRouteLoader (і для mono), PricingPage, useAskAiQuota; додати гейт у useChatSend (`enabled: authed &amp;&amp; !isPro`), useMonobankWebhook і useServerPreference.

**Докази:**

```text
Гейт `signedOut = status === "unauthenticated"` хибний під час `loading`, тож запити летять паралельно з /me. Таймінг (anon, свіжий контекст) /finyk: `2054ms REQ billing/status | REQ mono/sync-state | REQ me` → 401 ×(1+3 mono); /routine: billing/status REQ 2672ms раніше за /me 2747ms → 401; /chat: chat/usage (enabled: !isPro, без гейта) → 401; /?tab=settings → 401 me/preferences ×2. Анонімний свіп 70 маршрутів: 23× 401 billing/status, 20× 401 mono/sync-state, 5× silpo/sync-state, 2× chat/usage. findings.md рядок FUN-1 позначає billing/status і chat/usage як «✅ виправлено».
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/anon-401-timing.mjs; sweep.mjs anon (sweep-anon.json)
```

**Верифікатор:**

```text
AuthContext.tsx:356 sets status to 'loading' while /me is pending. usePlan (enabled: !signedOut), useModuleRouteLoader and PricingPage gate only on `status === 'unauthenticated'`, so the requests fire during 'loading'. useModuleRouteLoader's mono/sync-state prefetch has no auth gate at all, and useChatSend's chat/usage query uses only `enabled: !isPro`. Reproduced in a fresh anon context. /finyk: billing/status and mono/sync-state are requested at 1184 ms, before /me at 1293 ms, and both get 401; mono/sync-state is retried twice more for 3× 401. /routine: billing/status at 1552 ms, before /me at 1559 ms → 401. /chat: chat/usage is requested at 2039 ms, after /me had already returned 401 at 1476 ms, so it is plainly ungated → 401. FUN-1 in the 2026-09-01 audit marks billing/status and chat/usage as «✅ виправлено», so this is an incomplete fix or regression of a tracked item, not a duplicate. Impact is console noise and wasted requests only.
```

**Додаткові докази верифікатора:**

```text
r2/anon-401-timing.mjs output, e.g. `/finyk 1184ms REQ billing/status | 1184ms REQ mono/sync-state | 1293ms REQ me | 401 ×(billing/status, mono ×3, me)`; `/chat 1476ms RES 401 me … 2039ms REQ chat/usage → 401`.
```

#### [low] Анонімні сторінки викликають auth-only API і сиплять 401 у консоль на кожному екрані

- **ID:** `browser-surfaces/public-auth-pages#17` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md
- **Де:** /finyk, /nutrition, /fizruk, /routine, /?tab=settings, /chat (анонімно): GET /api/v1/billing/status, /api/v1/mono/sync-state ×3, /api/v1/silpo/sync-state ×3, /api/v1/me/preferences ×2, /api/v1/chat/usage, /api/v1/push/vapid-public ×2
- **Вплив:** Зайві запити й ретраї на кожному екрані local-first режиму, шум у консолі й моніторингу (у проді 401 на кожен анонімний перегляд), лишнє навантаження на rate-limit бакети.
- **Рекомендація:** Гейтити ці useQuery через `enabled: status === 'authenticated'` (так уже зроблено для billing/providers, FUN-1), а vapid-public запитувати лише при спробі підписатись на пуші.

**Докази:**

```text
04-anon-protected.mjs [fresh] /finyk: `401 GET /api/v1/billing/status`, `401 GET /api/v1/mono/sync-state` (×3), `503 GET /api/v1/push/vapid-public` (×2, локально VAPID нема). /nutrition: `401 GET /api/v1/silpo/sync-state` ×3. [skipped] /?tab=settings: `401 GET /api/v1/me/preferences` ×2. /chat: `401 GET /api/v1/chat/usage`. Кожен дає console error «Failed to load resource: 401».
```

**Відтворення:**

```text
Відкрий анонімно /finyk чи /nutrition з відкритою вкладкою Network або Console.
```

**Верифікатор:**

```text
Відтворено, і причина в коді — неповний фікс FUN-1. (a) billing/status: гейт `signedOut = auth?.status === "unauthenticated"` (useModuleRouteLoader.ts:40, usePlan.ts:53) дає false, поки auth у стані "loading". Prefetch і useQuery стріляють раніше, ніж `/api/v1/me` поверне 401: 507 мс проти 641 мс. (b) mono/sync-state не має гейту ні в prefetch (useModuleRouteLoader.ts:73-79), ні в `useMonobankWebhook` (enabled=true за замовчуванням, FinykApp.tsx:102 викликає `useMonobank()` без аргументів). Результат — 3×401. (c) `useSilpoSyncState` ретраїть будь-яку помилку, крім SILPO_DISABLED, до 2 разів, зокрема 401: 3 запити за ~4 с. (d) chat/usage в `useChatSend.ts:174-180` загейтовано лише `enabled: !isPro`, без перевірки сесії. Дві частини знахідки неточні. vapid-public — публічний ендпоінт без requireSession (apps/server/src/routes/push.ts:52, «свідомо поза rate-limiter-ом»). 503 там лише тому, що локально немає VAPID; у проді буде 200, тож до проблеми це не належить (envOnly). me/preferences на налаштуваннях PrivacySection/useServerPreference викликають свідомо: 401 класифікується як "auth" і показує копі «Увійди в акаунт…». Це дизайн, хоча й теж можна гейтити. Вплив: шум у консолі (4-7 c …[обрізано]
```

**Додаткові докази верифікатора:**

```text
w17-anon-api.mjs fresh: /finyk: `507ms 401 billing/status`, `511ms 401 mono/sync-state`, `641ms 401 /me`, `674ms 401 mono/sync-state`, `883ms 401 mono/sync-state`, 7 console errors. /nutrition: `549ms 401 billing/status`, `592ms 401 /me`, silpo/sync-state 401 на 908/1920/3931 мс. /fizruk і /routine: billing/status 401 одночасно з /me. /chat: `1336ms 401 /me`, `1774ms 401 chat/usage` (після того, як /me вже відповів 401, тобто гейту на сесію немає). Режим skipped, /?tab=settings: `784ms 401 /me`, потім `1803ms 401 me/preferences ×2`. FUN-1 у findings.md позначено «✅ виправлено для billing/status, billing/providers, chat/usage», але через гонку зі станом "loading" і негейтований useChatSend 401 лишаються.
```

#### [low] Анонімні сторінки викликають auth-only API: 401 у консолі на кожному модулі, /pricing і /chat

- **ID:** `browser-surfaces/route-matrix#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `reliability`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md
- **Де:** web-клієнт: виклики /api/v1/billing/status, /api/v1/billing/providers, /api/v1/mono/sync-state, /api/v1/silpo/sync-state, /api/v1/chat/usage без сесії (анонімний прохід direct-anon)
- **Вплив:** Зайві запити й шум у консолі та Sentry/моніторингу для кожного анонімного візитера (local-first режим за замовчуванням). Також це навантаження на rate-limit бакети IP.
- **Рекомендація:** Гейтити ці query через `enabled: status === "authenticated"` (RQ) або спільний хук useAuthedQuery. Для mono/silpo sync-state не робити запит, поки немає підключеної інтеграції.

**Докази:**

```text
Анонімний контекст, 1280x800: /finyk/* → `401 billing/status`, `401 mono/sync-state` ×2-3. /nutrition/* → `401 billing/status`, `401 silpo/sync-state` ×2. /routine/*, /fizruk/* → `401 billing/status`. /pricing → `401 billing/status`, `401 billing/providers`. /chat → `401 chat/usage`. Плюс очікуваний `401 /api/v1/me`. Кожен із них дає console.error «Failed to load resource: … 401». Для авторизованого додатково на кожному вході у Фінік `404 /api/v1/mono/sync-state` (локально інтеграція вимкнена, envOnly) і `503 /api/v1/push/vapid-public` на кожній сторінці (VAPID не сконфігуровано).
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/direct.mjs anon (див. direct-anon.log)
```

**Верифікатор:**

```text
Відтворено, і це неповний фікс уже відомої знахідки FUN-1 (у product-audit 2026-09-01 позначена «✅ виправлено»). Гейти в usePlan.ts, useModuleRouteLoader.ts, PricingPage.tsx і useAskAiQuota.ts перевіряють лише `auth.status === "unauthenticated"`. Поки `/me` у польоті, AuthContext віддає `status === "loading"`, `signedOut` дорівнює false, і запити йдуть паралельно з `/me`. Крім того, mono/sync-state має два виклики без auth-гейта: prefetch у useModuleRouteLoader (finyk) і `useMonobankWebhook`. silpo/sync-state (`useSilpoSyncState()` у PantrySourceTabs без `enabled`) теж ніяк не гейтується. Другий mono/sync-state пішов уже ПІСЛЯ того, як `/me` повернув 401. Ефект: зайві запити й console.error «Failed to load resource» для кожного анонімного відвідувача. Падінь і впливу на UI немає, тож low. Твердження про шум у Sentry перебільшене: браузерні «Failed to load resource» Sentry зазвичай не ловить. 503 на vapid-public і 404 на mono/sync-state у авторизованого локально є env-only.
```

**Додаткові докази верифікатора:**

```text
rm2.mjs, anon. Таймінг на /finyk: «req billing/status@1015, req mono/sync-state@1015, req /me@1015, res401 billing/status@1096, res401 /me@1360, req mono/sync-state@1489 → 401». Отже, перший запит пішов у фазі loading, а другий після того, як стало відомо, що сесії немає. /nutrition: 401 billing/status і 401 silpo/sync-state ×2. /routine, /fizruk: 401 billing/status. /pricing: 401 billing/status і billing/providers. /chat: 401 chat/usage.
```

#### [low] Зайві й гарантовано невдалі запити на кожному завантаженні: 3× GET /me/preferences, 401 на me/preferences/chat/usage/billing для гостя, 404 mono/sync-state

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#19` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md (FUN-1: guest 401 на billing/status, billing/providers, chat/usage позначено виправленим; шлях useChatSend → chat/usage на /chat фікс не покрив)
- **Де:** глобально (хаб, /chat, /pricing, /finyk)
- **Вплив:** Додаткові запити на холодному старті, шум у консолі й моніторингу, гірше відрізняються справжні помилки. Для гостя запити заздалегідь приречені.
- **Рекомендація:** Дедуплікувати preferences через React Query (один queryKey), не робити серверних запитів до status==='authenticated' (а не лише !=='unauthenticated'), для «нема підключення Mono» віддавати 200 {connected:false} замість 404.

**Докази:**

```text
s31: кожен reload хабу залогіненого → 3 однакові `GET /api/v1/me/preferences`. Гість: `401 PATCH /api/v1/me/preferences` після «Почати» в онбордингу (s2/s3), `401 GET /api/v1/chat/usage` на /chat і хабі (s44), `401 GET /api/v1/billing/status` і `/billing/providers` на /pricing (s14), хоча providersQuery має enabled:!signedOut (спрацьовує поки status='loading'). Без Monobank: `404 GET /api/v1/mono/sync-state` на кожному відкритті хабу чи /finyk (s32, s35), усе з console error «Failed to load resource».
```

**Відтворення:**

```text
Будь-який скрипт зі збором A.collect(page) (наприклад s32, s44, s14).
```

**Верифікатор:**

```text
Підтверджено частково, основне відтворено. (1) Reload хабу залогіненим користувачем дає рівно 3× `200 GET /api/v1/me/preferences`. Їх роблять незалежні boot-хуки useAnalyticsConsentBoot, useActiveModulesSync і useHubPrefsSync, кожен свідомо через власний useEffect-fetch без RQ (коментар у useActiveModulesSync.ts). Дедуплікації немає. (2) Гість після «Почати» в онбордингу: WelcomeScreen.completeOnboarding → pushActiveModules шле PATCH /me/preferences без перевірки сесії, отримує 401 (є в логах finder-а s2/s3). (3) Гість на /chat: 401 GET /chat/usage відтворено. useChatSend.ts:174 має `enabled: !isPro` без гейту на signedOut, тож фікс FUN-1 (аудит 2026-09-01) цей шлях не покрив. Що не підтвердилось. (4) 401 на billing/status і billing/providers для гостя на /pricing при звичайному завантаженні я не відтворив, бо usePlan і providersQuery мають `enabled: !signedOut`. У finder-а це видно лише в s15, з кліками checkout, тобто це race або інший шлях. (5) 404 на mono/sync-state має місце лише локально: assertWebhookEnabled кидає NotFound, коли MONO_WEBHOOK_ENABLED=false. З увімкненим прапорцем сервер для користувача без підключення вже віддає 200 {status:"disconnected"}, тож рекомендація « …[обрізано]
```

**Додаткові докази верифікатора:**

```text
x17-19.mjs: `#19 authed hub reload: GET me/preferences count = 3`; `#19 guest /chat non-2xx: ["401 GET /api/v1/me","401 GET /api/v1/chat/usage"]`; `#19 guest /pricing non-2xx: ["401 GET /api/v1/me"]` (billing 401 не відтворено); x16-api.mjs: `mono/sync-state: 404 {"error":"Monobank webhook integration is disabled"}`; connection.ts:458-466 дає 200 disconnected для користувача без рядка.
```

<a id="rel-58"></a>

### `rel-58` [low] Кожен авторизований бут робить 3-6 однакових GET /api/v1/me/preferences і дублює інші запити

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: boot-хуки
- **Де:** apps/web/src/core/observability/useAnalyticsConsentBoot.ts:86-87; apps/web/src/core/hub/activeModulesSync.ts:87; apps/web/src/core/settings/hubPrefsSync.ts:210; apps/web/src/core/settings/useServerPreference.ts:86-87
- **Першопричина:** useAnalyticsConsentBoot, hydrateActiveModules і hydrateHubPrefs (а на налаштуваннях ще useServerPreference і PrivacySection) кожен викликає meApi.getPreferences() напряму, без спільного RQ-кешу чи single-flight. Ремаунт піддерева після migration-gate дублює ще mono/sync-state, vapid-public і get-session.
- **Вплив:** 3-6 зайвих запитів на кожне завантаження навантажують per-user бакети і на повільних мобільних мережах конкурують із критичними запитами.
- **Що зробити:** Читати preferences одним React Query запитом з ключем із фабрики (Hard Rule #2) і staleTime та роздавати результат усім гідраторам. Не ремаунтити піддерево із запитами після migration-gate.
- **Примітка:** Окремі хуки — свідомий компроміс ізоляції, як пише коментар у коді, але дедуплікований fetchQuery цій ізоляції не заважає.

Знахідок у кластері: 2.

#### [low] Дубльовані API-запити на кожному бутi: GET /api/v1/me/preferences 3 рази (до 6 на /status і налаштуваннях), mono/sync-state, vapid-public і get-session по 2 рази

- **ID:** `browser-crosscut/resilience-offline-perf#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Де:** apps/web/src/core/observability/useAnalyticsConsentBoot.ts:86-87, apps/web/src/core/hub/activeModulesSync.ts:87, apps/web/src/core/settings/hubPrefsSync.ts:210, apps/web/src/core/settings/useServerPreference.ts:86-87 (кожен викликає meApi.getPreferences() напряму, без спільного RQ-кешу)
- **Вплив:** 3-6 зайвих запитів на кожне завантаження, зайве навантаження на сервер і на per-user rate-limit бакети. На повільних мобільних мережах ці запити конкурують із критичними.
- **Рекомендація:** Читати preferences через один React Query запит із ключем із фабрики (або module-level single-flight promise) і роздавати результат усім трьом гідраторам. Не ремаунтити піддерево з запитами після migration-gate або покластися на RQ-кеш зі staleTime.

**Докази:**

```text
perf-desk.json (31 маршрут): на кожному маршруті 'GET /api/v1/me/preferences' 3 рази, у deep-run '@4622,4624,4625' мс з одного й того самого l@lib-BldZcT9V.js; '/?tab=settings' 5 разів; '/status' 6 разів preferences і 2 рази '/api/v1/me/profile'; '/finyk*': 'GET /api/v1/mono/sync-state' 2 рази і '/push/vapid-public' 2 рази (run-fresh-boot.log: 1356 мс до migration-gate і 7686 мс після ремаунту); /nutrition: 'GET /api/auth/get-session' 2 рази.
```

**Відтворення:**

```text
node 01-perf.mjs (OUT=perf-desk.json) і 15-perf-deep.mjs: CDP Network.requestWillBeSent, групування за method+url.
```

**Верифікатор:**

```text
Three hooks mounted at boot each call meApi.getPreferences() directly: useAnalyticsConsentBoot.ts:87, activeModulesSync.ts:87 (hydrateActiveModules) and hubPrefsSync.ts:210 (hydrateHubPrefs). useServerPreference.ts:87 and PrivacySection.tsx:82 add more calls on the settings screens. packages/api-client/src/endpoints/me.ts:124 is a plain http.get with no single-flight, httpClient has no GET dedup, and no shared React Query entry is involved. This is a perf/efficiency issue only: every response is used correctly, and the hooks guard against races (generation counters). Low is right.
```

**Додаткові докази верифікатора:**

```text
v9-dups.mjs on a warm reload (my user) reproduced it. '/' gave 3x GET /api/v1/me/preferences at the same ms (1344,1344,1344). /finyk/transactions gave 3x preferences, 2x mono/sync-state @957,2443 and 2x push/vapid-public @957,2443. /status gave 6x preferences (735x3, 1487x3), 2x me/profile and 3x /api/status. The /nutrition run also showed 9x get-session, 5x sync/pull and 8x sync/push in its first seconds, which falls outside this finding.
```

#### [info] Кожен авторизований бут робить три однакові GET /api/v1/me/preferences паралельно

- **ID:** `browser-surfaces/route-matrix#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `perf`
- **Де:** apps/web/src/core/observability/useAnalyticsConsentBoot.ts; apps/web/src/core/hub/useActiveModulesSync.ts; apps/web/src/core/settings/useHubPrefsSync.ts
- **Вплив:** Потроєне навантаження на endpoint і на per-user rate-limit при кожному відкритті застосунку. Ризик гонок, якщо відповіді відрізняються.
- **Рекомендація:** Звести три boot-хуки до одного спільного RQ-запиту (фабрика ключів, Hard Rule #2) з `staleTime`, щоб дедуплікувати фетч.

**Докази:**

```text
Мережевий лог на кожному завантаженні (/finyk, /): `GET /api/v1/me/deletion-status`, `GET /api/v1/me/profile`, `GET /api/v1/me/preferences` ×3 в одну мілісекунду (наприклад 88101ms ×3 → 200 за 88208/88217/88249). Повторюється на кожному reload.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/probe2.mjs або timeline.mjs /finyk (друкує API-запити)
```

**Верифікатор:**

```text
Відтворено: на кожному авторизованому завантаженні йдуть три GET /api/v1/me/preferences в одну мілісекунду. Їх роблять useAnalyticsConsentBoot (через `meApi.getPreferences()`), hydrateActiveModules (activeModulesSync.ts:87) і hydrateHubPrefs (hubPrefsSync.ts:210). Це свідомий компроміс, описаний у коді: окремі хуки, щоб регрес одного не ламав інший, і звичайний useEffect-fetch («one-shot boot-read, а не кешований спільний ресурс»). Ізоляції при цьому не заважав би спільний дедуплікований `fetchQuery`. Шкода мізерна: на GET /api/me/preferences немає окремого per-route лімітера (routes/me.ts:150-160), це один дешевий read. Гонок теж немає, бо подальші записи йдуть частковим PATCH, і хуки не перетирають поля один одного. Залишаю як info-спостереження.
```

**Додаткові докази верифікатора:**

```text
rm2.mjs, userA: /finyk показує prefs=[GET@2506, GET@2506, GET@2506], / показує [GET@1457, GET@1458, GET@1458]. Те саме на /fizruk/*, /FINYK і /Finyk/Budgets.
```

<a id="rel-59"></a>

### `rel-59` [low] Немає ліміту розміру файлу перед читанням і синхронним парсингом бекапу Hub, банку пам'яті і Strong CSV

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: імпорт файлів
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:102-147; apps/web/src/core/profile/MemoryBankSection.tsx:134-179; apps/web/src/modules/fizruk/components/StrongImportReview.tsx:46-71,101-108
- **Першопричина:** Жоден із трьох file picker-ів не перевіряє file.size. Strong CSV парситься в useMemo на головному потоці і заново при кожному перемиканні kg/lb.
- **Вплив:** Випадково обраний великий файл (відео, архів, багаторічний експорт) підвішує або валить вкладку без пояснення. CSV на 10,7 МБ парситься ~1 с на десктопі, на телефоні в рази довше.
- **Що зробити:** Перевіряти file.size до читання (до 20 МБ для бекапу, до 10 МБ для CSV) і показувати зрозуміле повідомлення. Важкий парсинг винести у Worker або хоча б не повторювати при зміні одиниці.

Знахідок у кластері: 1.

#### [low] Немає ліміту розміру файлу перед readAsText/JSON.parse (бекап Hub, банк памʼяті) і перед синхронним парсингом Strong CSV на головному потоці

- **ID:** `client-static/gap-backup-restore-file-imports#15` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `perf`
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:102-147; apps/web/src/core/profile/MemoryBankSection.tsx:134-179; apps/web/src/modules/fizruk/components/StrongImportReview.tsx:46-71,101-108
- **Вплив:** Випадково обраний великий файл (відео, архів, багаторічний експорт) підвішує або валить вкладку без пояснення.
- **Рекомендація:** Перевіряти file.size до читання (наприклад ≤ 20 МБ для бекапу, ≤ 10 МБ для CSV) із дружнім повідомленням. Важкий парсинг винести у Worker або хоча б не перепарсювати при перемиканні одиниці.

**Докази:**

```text
None of the three file pickers checks file.size. Strong does `setter(await file.text())`, and the parse sits in a useMemo that re-runs on every kg/lb toggle. Measured on the dev box: `200000 rows 10.7 MB parse 1009 ms match 154 ms`, `20000 rows 1.1 MB parse 323 ms`. On a phone this is several times slower and freezes the UI.
```

**Відтворення:**

```text
<scratch>/agents/client-static-gap-backup-restore-file-imports/strongperf.ts
```

**Верифікатор:**

```text
I checked this in the code. None of the three pickers looks at file.size before reading. HubBackupPanel.tsx:102-147 goes straight from FileReader.readAsText to JSON.parse. MemoryBankSection.tsx:134-179 checks only the extension or MIME type, then calls readAsText and JSON.parse. StrongImportReview.tsx:101-108 calls `setter(await file.text())`. In StrongImportReview the parse and match run inside a useMemo (lines 46-71) whose deps include weightUnit, weightText, exercises and idNamespace, so the kg/lb toggle and loading the weight CSV both re-parse the whole workout CSV on the main thread. The repo already guards size elsewhere: finyk/lib/importStatementFile.ts:64-66 rejects empty files and files over IMPORT_STATEMENT_MAX_CSV_BYTES with «Файл завеликий». So these three pickers are inconsistent with that pattern. The impact is overstated, though. All three inputs carry `accept` (`application/json,.json` / `.csv,text/csv`), and MemoryBank also rejects non-.json files by name and type before reading. A video or archive therefore only gets in if the user deliberately switches the picker to «All files». A realistic Strong export is roughly 20k rows (~1 MB), which is sub-second jank rathe …[обрізано]
```

**Додаткові докази верифікатора:**

```text
I re-ran the original agent's benchmark from verify-client-static-gap-backup-restore-file-imports/strongperf.ts with tsx. Output: `20000 rows 1.1 MB parse 136 ms match 158 ms`, `200000 rows 10.7 MB parse 1056 ms match 158 ms`. The 200k-row number matches the claim. On a warm JIT the 20k-row parse was faster than the claimed 323 ms. Inputs: HubBackupPanel.tsx:216 has accept="application/json,.json". MemoryBankSection.tsx:306/427 have accept=".json,application/json", and lines 142-148 have an isJsonFile check. StrongImportReview.tsx:160/168 have accept=".csv,text/csv". strongImport.ts has no row cap (line 345 tokenizes the whole text).
```

<a id="rel-60"></a>

### `rel-60` [low] OPFS-wipe guard перезавантажує вкладку навіть офлайн, і людина опиняється на сторінці помилки браузера

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: SQLite / OPFS
- **Де:** apps/web/src/core/db/opfsWipeGuard.ts:36-50; apps/web/src/core/db/sqlite.ts:379
- **Першопричина:** watchOpfsWipe на focus і visibilitychange викликає window.location.reload() без перевірки navigator.onLine, а SW прибрано разом зі сховищем.
- **Вплив:** У рідкісному сценарії (дані сайту очищено офлайн при відкритій вкладці) замість застосунку видно офлайн-сторінку Chrome, доки не з'явиться мережа.
- **Що зробити:** Якщо navigator.onLine === false, показувати внутрішній екран «дані сайту очищено, онови, коли з'явиться мережа» і чекати події online.

Знахідок у кластері: 1.

#### [low] OPFS-wipe guard перезавантажує вкладку навіть офлайн: після очищення даних сайту людина опиняється на сторінці помилки браузера

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `reliability`
- **Де:** apps/web/src/core/db/opfsWipeGuard.ts:36-50 (watchOpfsWipe → window.location.reload() без перевірки navigator.onLine)
- **Вплив:** Замість застосунку людина бачить офлайн-сторінку Chrome, доки не з'явиться мережа. Рідкісний сценарій: очищення даних сайту офлайн при відкритій вкладці.
- **Рекомендація:** Якщо navigator.onLine === false, не перезавантажувати, а показати внутрішній екран «дані сайту очищено, онови, коли з'явиться мережа» і чекати події online.

**Докази:**

```text
04-evict.mjs. Вкладка офлайн, Storage.clearDataForOrigin(...,service_workers). Після події focus/visibilitychange page.url() = 'chrome-error://chromewebdata/'. SW прибрано разом зі сховищем, тож reload іде в мережу, якої немає.
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/04-evict.mjs. Кроки: setOffline(true) → clearDataForOrigin з service_workers → dispatch focus → перевірити page.url().
```

**Верифікатор:**

```text
I reproduced it, and a control run isolates the cause. watchOpfsWipe (opfsWipeGuard.ts:36-50) runs on focus/visibilitychange. When the /sergeant/sqlite OPFS directory is gone, it calls window.location.reload() without checking navigator.onLine. It is installed whenever the VFS is opfs-sahpool (sqlite.ts:379). Variant A (offline + clearDataForOrigin with service_workers + focus event): the controller is gone (swRegs 0) and the page goes to chrome-error://chromewebdata/ ('No internet ... ERR_INTERNET_DISCONNECTED'). Control D (same clear, no focus/visibility event, 15 s wait): no navigation, the app stays on /, so the guard's reload is the trigger. Variant B (offline, only file_systems cleared, SW kept): the guard reloads and the SW serves the shell offline, so the problem only appears when the SW is cleared too. Mitigations: in A, once the network came back, Chrome auto-reloaded its error page back into the app within ≤8 s. The trigger is rare and started by the user (clearing site data while offline with the tab open). The reload is a documented deliberate choice (AI-CONTEXT: writes would otherwise silently go into deleted files). A real 'Clear site data' also clears cookies, so th …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v9-opfs-offline.mjs and v9b-nodispatch.mjs (key verify-longsess-9). Log: '05:27:09 A after clear {swController:false,swRegs:0}' → 'A url chrome-error://chromewebdata/ body No internet ... ERR_INTERNET_DISCONNECTED' → 'A urlAfterOnline http://127.0.0.1:4173/'. 'B url http://127.0.0.1:4173/ body ... Офлайн Sergeant Доброго ранку'. 'D url http://127.0.0.1:4173/' with no navigation after the clear. Screenshots are v9-A.png, v9-B.png, v9-C.png, and the JSON files are in <scratch>/agents/verify-browser-crosscut-gap-long-session-storage-pressure/. Not in any earlier audit. Only the current run's staged reliability.md has it, as "ще не перевірено".
```

<a id="rel-61"></a>

### `rel-61` [low] Фолбек :memory: відкривається з прапорцем трасування 't': тисячі рядків «SQL TRACE» у консолі продакшн-збірки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: SQLite
- **Де:** apps/web/src/core/db/sqlite.ts:885
- **Першопричина:** sqlite.ts відкриває new sqlite3.oo1.DB(':memory:', 'ct'), а прапорець 't' вмикає console.log на кожен SQL-оператор. Інші VFS відкриваються без нього.
- **Вплив:** У вже деградованому режимі (диск повний) це ~700-1150 синхронних console.log на кожне завантаження, зайве навантаження на CPU і батарею. Траси витісняють корисні Sentry-breadcrumbs саме в тих сесіях, які найбільше треба діагностувати.
- **Що зробити:** Відкривати memory-базу з прапорцем 'c', а трасування вмикати лише в dev.

Знахідок у кластері: 1.

#### [low] Фолбек :memory: відкривається з прапорцем трасування 't': тисячі рядків 'SQL TRACE' у консолі продакшн-збірки

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Де:** apps/web/src/core/db/sqlite.ts:885 — new sqlite3.oo1.DB(":memory:", "ct")
- **Вплив:** Синхронний console.log на кожен SQL у вже деградованому стані додає навантаження на CPU і батарею. Якщо Sentry збирає console-breadcrumbs, траси витісняють корисні breadcrumbs (ліміт 100) саме в тих сесіях, які треба діагностувати.
- **Рекомендація:** Відкривати memory-базу з прапорцем 'c' (без 't'), як і інші VFS. Трасування вмикати лише в dev.

**Докази:**

```text
05-quota-pantry.mjs у memory-режимі: 4154 рядки console.log виду 'SQL TRACE #6 via sqlite3@786896[] INSERT INTO "__kv_store_migrations" (name) VALUES (?)' за ~3 хв, ≈700–1150 на кожне завантаження сторінки (04:29:22 → 718, 04:30:54 → 1154). Значення bind у трасу не потрапляють, лише SQL-текст.
```

**Відтворення:**

```text
Будь-який сценарій із вичерпаною квотою: <scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/05-quota-pantry.mjs. Порахувати консольні повідомлення 'SQL TRACE'.
```

**Верифікатор:**

```text
Підтверджено в коді і наживо. sqlite.ts:885 відкриває new sqlite3.oo1.DB(':memory:', 'ct'). У вбудованому vendor-sqlite прапорець 't' ставить __dbTraceToConsole, і той робить console.log('SQL TRACE #…') на кожен оператор. Інші VFS (OpfsSAHPoolDb, JsStorageDb) відкриваються без 't'. Vite-конфіг console не вирізає. Sentry ініціалізується з дефолтними інтеграціями, а Breadcrumbs(console) там увімкнено, тож траси витісняють breadcrumbs у сесіях, які найбільше треба діагностувати. Вплив обмежений рідкісним memory-режимом, значення bind у трасу не потрапляють. Low.
```

**Додаткові докази верифікатора:**

```text
v2-pantry-memory.mjs: 5170 рядків 'SQL TRACE' за 4 memory-завантаження (893 → 1904 → 2971 → 4103 → 5170, ≈1000-1100 на завантаження). Рядок у apps/server/dist/assets/vendor-sqlite-*.js.map: 'sqlite3_trace_v2() callback which gets installed by the DB ctor if its open-flags contain "t"' → console.log("SQL TRACE #" …).
```

<a id="rel-62"></a>

### `rel-62` [low] Раннер міграцій не підтримує онлайн-міграцій: усе в одній транзакції, без CONCURRENTLY і NOT VALID, а таймаути конфліктують із healthcheck

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** L · **Область:** server: міграції / деплой
- **Де:** apps/server/src/db.ts:73,399-402,463-475; apps/server/migrate.mjs:85-87; Dockerfile.api:321; apps/server/src/migrations/117_fizruk_workout_sets_user_idx.sql:32-35; apps/server/src/migrations/142_cascade_user_id_indexes.sql; apps/server/src/migrations/149_ai_usage_daily_week_buckets.sql:1-20; apps/server/src/migrations/150_ai_usage_daily_preset_buckets.sql; apps/server/src/migrations/144_ai_memories_prune_dead_sources.sql:6-12
- **Першопричина:** runPendingSqlMigrations обгортає кожен файл у BEGIN/COMMIT без opt-out, тож CREATE INDEX CONCURRENTLY неможливий. CHECK на ai_usage_daily і ai_memories розширюють через DROP+ADD без NOT VALID, під ACCESS EXCLUSIVE. migrate.mjs ставить statement_timeout=0 і lock_timeout=10 с, який діє і на pg_advisory_lock, а самі міграції виконуються в ENTRYPOINT до старту сервера.
- **Вплив:** Поки таблиці малі, ризик латентний. З ростом sync_op_log і ai_usage_daily (обидві без retention) важка міграція блокуватиме записи і через вотермарк (rel-40) заморожуватиме pull усім. Вона також може не вкластися у вікно healthcheck Coolify: тоді деплой зациклюється на відкатах, а частина міграцій лишається застосованою під старим кодом.
- **Що зробити:** Додати маркер -- migrate:no-transaction для файлів із CONCURRENTLY і лінт на CREATE INDEX без CONCURRENTLY для великих таблиць. Розширювати CHECK через NOT VALID + VALIDATE. Для advisory lock задати lock_timeout=0 або брати pg_try_advisory_lock з власним дедлайном. Задокументувати health_check_start_period і виносити важкі backfill з ENTRYPOINT.
- **Примітка:** Усі три члени фіндери оцінили як info/low; разом піднято до low. Міграції 117 і 142 свідомо задокументували відмову від CONCURRENTLY. Сценарій двох реплік з reliability-ops#9 у проді малоймовірний: репліка одна, а deploy-api має concurrency group.

Знахідок у кластері: 3.

#### [info] Раннер міграцій: кожен файл в одній транзакції без опції CONCURRENTLY; довга міграція блокує записи і заморожує sync pull для всіх

- **ID:** `server-static/db-migrations#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/db.ts:463-470; apps/server/migrate.mjs (PG_STATEMENT_TIMEOUT_MS=0); apps/server/src/modules/sync/syncV2-core.ts:40-41; apps/server/src/modules/sync/syncV2.ts:660; apps/server/src/migrations/117_fizruk_workout_sets_user_idx.sql:32-35, 142_cascade_user_id_indexes.sql (заголовок)
- **Вплив:** Ризик простою записів синку та «завислої» синхронізації на час будь-якої важкої міграції; lock_timeout обмежує лише очікування блокування, не тривалість.
- **Рекомендація:** Додати маркер (напр. `-- migrate:no-transaction`) для файлів із CONCURRENTLY і виконувати їх поза BEGIN; лінт на CREATE INDEX без CONCURRENTLY для великих таблиць (sync_op_log, mono_transaction, routine_entries, ai_usage_daily). Задокументувати вплив watermark на pull під час міграцій.

**Докази:**

```text
`await client.query("BEGIN"); await client.query(sql); ... INSERT INTO schema_migrations ...; COMMIT` — опції no-transaction немає, тож `CREATE INDEX CONCURRENTLY` неможливий (117/142 це прямо визнають: «коли таблиці виростуть, ці індекси вже будуть на місці»). Міграції йдуть з ENTRYPOINT нового контейнера, поки старий обслуговує трафік; statement_timeout=0. Pull фільтрує `tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot())` — будь-яка довга транзакція з xid (міграція, бекфіл, імпорт) ховає нові оп-и ВСІХ користувачів до свого COMMIT.
```

**Відтворення:**

```text
Статично. Майбутній `CREATE INDEX` на sync_op_log (найбільша таблиця, без ретенції за ADR-0065) у проді: SHARE-lock на час побудови (інсерти push висять), а pull повертає порожньо всім до кінця міграції.
```

**Верифікатор:**

```text
The mechanism is real. runPendingSqlMigrations (db.ts) wraps every file in BEGIN/COMMIT with no opt-out, so CREATE INDEX CONCURRENTLY is impossible. migrate.mjs sets PG_STATEMENT_TIMEOUT_MS=0 and lock_timeout 10s. The pull filter `tx_id < pg_snapshot_xmin(pg_current_snapshot())` hides every op newer than the oldest open xid, so a long migration transaction delays pull for all users until it commits. Delivery is delayed, not lost. However, migrations 117 and 142 document the no-CONCURRENTLY choice as conscious ('свідомо') and safe at current volumes, and no existing migration is long-running, so the outage scenario is a future risk. Hence info, not low. One concrete, verifiable side effect: the single-transaction runner also voids the lock-reduction claimed in migration 141. Its 'NOT VALID + VALIDATE ... другий бере лише SHARE UPDATE EXCLUSIVE' runs in the same transaction as the ADD CONSTRAINT, so ACCESS EXCLUSIVE is held through VALIDATE anyway.
```

**Додаткові докази верифікатора:**

```text
142 header: 'CREATE INDEX без CONCURRENTLY — свідомо: раннер ... виконує кожен файл в одній транзакції'. 141: NOT VALID at lines 92/97 and VALIDATE at 93/99/105 in the same file, therefore the same transaction. syncV2.ts:660 pull predicate confirmed. No doc tracks a no-transaction migration mode.
```

#### [info] Розширення CHECK через DROP+ADD CONSTRAINT без NOT VALID на гарячих таблицях, що ростуть безмежно

- **ID:** `server-static/db-migrations#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `perf`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/migrations/149_ai_usage_daily_week_buckets.sql:1-20, 150_ai_usage_daily_preset_buckets.sql (те саме в 049, 059, 077, 078); 144_ai_memories_prune_dead_sources.sql:6-12 (і 028, 068, 118)
- **Вплив:** Із ростом таблиці кожна така міграція блокує квоти/AI-запити на час скану; при lock_timeout 10 с деплой може падати через конкуренцію за блокування.
- **Рекомендація:** Розширювати CHECK як `ADD CONSTRAINT ... NOT VALID` + `VALIDATE CONSTRAINT` (або взагалі прибрати перелік префіксів у CHECK); додати ретенцію ai_usage_daily (старші за N місяців).

**Докази:**

```text
`ALTER TABLE ai_usage_daily DROP CONSTRAINT ai_usage_daily_bucket_format; ALTER TABLE ai_usage_daily ADD CONSTRAINT ai_usage_daily_bucket_format CHECK (bucket = 'default' OR ... OR bucket LIKE 'preset:_%');` — без NOT VALID, тобто повна валідація під ACCESS EXCLUSIVE. ai_usage_daily пишеться на кожен AI-запит і ніколи не чиститься (DELETE лише в purgeUserData). Те саме для ai_memories_source_check на 32 партиціях. Патерн NOT VALID + VALIDATE уже є в репо (141).
```

**Відтворення:**

```text
Статично: кожне додавання нового bucket-префікса (6 разів за історію) = full scan ai_usage_daily під ексклюзивним блокуванням.
```

**Верифікатор:**

```text
Verified: 149/150 (and 049/077/078) widen ai_usage_daily_bucket_format via DROP CONSTRAINT + ADD CONSTRAINT CHECK without NOT VALID. That takes ACCESS EXCLUSIVE and validates every row in a scan. ai_usage_daily is never pruned except per-user in purgeUserData. The impact is negligible at current scale: one row per subject per day per bucket, and the local table holds 0 rows. Hence info. The recommendation is also partly wrong as written: the migration runner executes each file in one transaction, so ADD ... NOT VALID followed by VALIDATE in the same file keeps ACCESS EXCLUSIVE until COMMIT (see migration 141). The real fix needs VALIDATE in a separate migration file, or dropping the prefix enumeration from the CHECK. For 144 (ai_memories) the migration also DELETEs the legacy rows, so a full scan is unavoidable there anyway.
```

**Додаткові докази верифікатора:**

```text
150_ai_usage_daily_preset_buckets.sql: `ALTER TABLE ai_usage_daily ADD CONSTRAINT ai_usage_daily_bucket_format CHECK (...)` inside a DO block, header 'Однофазно й ідемпотентно'. `select count(*) from ai_usage_daily` returns 0 locally.
```

#### [info] Міграції в ENTRYPOINT: lock_timeout=10s діє і на pg_advisory_lock, а довга міграція (statement_timeout=0) не вкладається у вікно healthcheck Coolify

- **ID:** `server-static/reliability-ops#9` · **Вердикт:** сумнівно · **Лейн:** Статика сервера · **Категорія:** `reliability`
- **Серйозність від шукача:** low
- **Де:** Dockerfile.api:321; apps/server/migrate.mjs:85-87; apps/server/src/db.ts:399-402, 463-475
- **Вплив:** Advisory lock серіалізує міграції, тож гонки за schema_migrations немає. Але друга репліка не чекає, а падає. Головне: міграцію, довшу за вікно healthcheck, через цей шлях задеплоїти неможливо. Деплой зациклюється на відкатах, а частина вже закомічених файлів міграцій лишається застосованою під старим кодом.
- **Рекомендація:** Для release-кроку використовувати `pg_advisory_lock` з окремим `SET lock_timeout = 0` (або `pg_try_advisory_lock` у циклі з власним дедлайном). Задокументувати й виставити в Coolify health_check_start_period із запасом під найдовшу міграцію, а важкі backfill-и та CREATE INDEX CONCURRENTLY виносити з ENTRYPOINT у ручний або онлайн-крок.

**Докази:**

```text
migrate.mjs: `process.env.PG_STATEMENT_TIMEOUT_MS = "0"; process.env.PG_LOCK_TIMEOUT_MS = ... ?? "10000"`. Пул створюється з `lock_timeout`, тож `SELECT pg_advisory_lock($1)` (db.ts:400) теж обмежений 10 с. Веб-процес стартує лише після `migrate.js &&`, тобто до кінця міграції /health недоступний, і healthcheck Coolify (вікно задається полями health_check_* поза репо) рахує цей час.
```

**Відтворення:**

```text
Статично: (1) два контейнери стартують одночасно, а перша міграція триває понад 10 с: другий падає з «canceling statement due to lock timeout» і exit 1. (2) Міграція, довша за вікно healthcheck (CREATE INDEX або backfill на великій таблиці): Coolify відкочує й зупиняє новий контейнер посеред міграції, транзакцію файлу відкочено, і кожна наступна спроба деплою повторює те саме.
```

**Верифікатор:**

```text
The technical claim is correct. migrate.mjs:85-86 sets PG_LOCK_TIMEOUT_MS=10000, the pool applies lock_timeout to every connection (db.ts:73), and lock_timeout does cover SELECT pg_advisory_lock (db.ts:400). I confirmed this on local PG16 with a harmless key: a second session with lock_timeout=1500ms got 'canceling statement due to lock timeout'. Scenario 1 (two containers migrating at once) is unlikely in prod. There is a single replica, deploy-api.yml runs under `concurrency: group: deploy-api, cancel-in-progress: false`, and Coolify queues deploys. Failing fast is also the documented intent: migrate.mjs says 'Краще швидко впасти й повторити деплой', and Dockerfile.api:311-314 says the '&& ... fail-closed ... Це бажана поведінка'. When it fails, the old container keeps serving and nothing is left half-applied. Scenario 2 (a migration longer than the Coolify healthcheck window gets killed and redeploys loop) is plausible in mechanism, since the web process only starts after migrate.js, but it depends entirely on the Coolify health_check_* values, which are outside the repo. I could not verify them, and no current migration is known to be that long. The runner already forbids CREAT …[обрізано]
```

**Додаткові докази верифікатора:**

```text
psql repro: session 1 held pg_advisory_lock(918273645001) for 4 s; session 2 ran SET lock_timeout='1500ms'; SELECT pg_advisory_lock(918273645001) and got ERROR: canceling statement due to lock timeout after ~1.5 s. deploy-api.yml:40-43 sets the concurrency group deploy-api with no cancel. I found no health_check_start_period or retries values anywhere in the repo or docs.
```

## info

<a id="rel-63"></a>

### `rel-63` [info] Мертвий dedup-стан у SW: notificationclose пише кожен tag в IndexedDB, але ніхто його не читає й не чистить

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: service worker
- **Де:** apps/web/src/sw.ts:14,72,113-116,145; apps/web/src/sw/notifiedKeys.ts:113-153; apps/web/src/sw/debug.ts:57-63
- **Першопричина:** recordNotified у notificationclose пише ключі; для серверних пушів без tag це унікальні push_${Date.now()}. Читає їх лише debug-снапшот, а prune спрацьовує тільки для ключів із денним суфіксом. Шапки sw.ts і notifiedKeys.ts посилаються на неіснуючий sw/reminders.
- **Вплив:** IDB sergeant-sw/notified-keys росте з кожним закритим пушем без жодної користі, а документація SW описує шар, якого вже немає.
- **Що зробити:** Прибрати recordNotified з notificationclose або обмежити кількість ключів і оновити шапку sw.ts.

Знахідок у кластері: 1.

#### [info] Мертвий dedup-стан у SW: notificationclose пише кожен tag в IDB, очищення майже ніколи не запускається

- **ID:** `client-static/service-worker-pwa#14` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `perf`
- **Де:** apps/web/src/sw.ts:113-116; apps/web/src/sw/notifiedKeys.ts:113-153; apps/web/src/sw/debug.ts:57-63
- **Вплив:** IDB `sergeant-sw/notified-keys` росте з кожним закритим пушем без користі; документація SW описує шар, якого немає.
- **Рекомендація:** Прибрати notifiedKeys/recordNotified з notificationclose (або обмежити кількість), оновити шапку sw.ts.

**Докази:**

```text
notificationclose → recordNotified(tag). Серверні пуші без tag отримують fallback `push_${Date.now()}` (sw.ts:145), тож ключі унікальні й без суфікса YYYY-MM-DD; pruneOldNotifiedKeys викликається лише для ключів із day-суфіксом (ROUTINE_NOTIFICATION_SENT). notifiedKeys ніде не читається для дедупу (локальний цикл нагадувань видалено, messages.ts:109-114) — лише лічильник у debug-снапшоті. Шапка sw.ts і notifiedKeys.ts досі посилаються на неіснуючий ./sw/reminders.
```

**Відтворення:**

```text
Статично.
```

**Верифікатор:**

```text
Dead state confirmed. notifiedKeys is written by recordNotified, from sw.ts:113-116 notificationclose and the messages.ts:115-119 ROUTINE_NOTIFICATION_SENT handler. It is never read for dedup; its only reader is the debug snapshot count (debug.ts:57-63). The header of sw.ts:14 still lists `./sw/reminders`, the comment at sw.ts:72 mentions `sw/reminders.ts`, and notifiedKeys.ts refers to reminders.ts and checkReminders(). None of these exist: apps/web/src/sw/ has no reminders.ts. On the mechanism: pruning does run on close of most reminder notifications, because the server dedupKeys (routine_notify_…_YYYY-MM-DD, fizruk_notify_YYYY-MM-DD, nutrition_notify_YYYY-MM-DD, sergeant-nudge-YYYY-MM-DD) carry the day suffix. But pruneOldNotifiedKeys only iterates the in-memory Set of the current short-lived SW, and recordNotified never calls loadNotifiedKeys. So IDB keys from earlier SW lifetimes are never deleted, and the IDB store still grows, by a few bytes per dismissed notification. The effect is negligible, so info is correct.
```

**Додаткові докази верифікатора:**

```text
`grep notifiedKeys apps/web/src` shows reads only at debug.ts:60. `ls apps/web/src/sw/` returns cache, cachePolicy, debug, messages, notifiedKeys, offlineFallback, pushPayload, version, with no reminders.ts. Server dedupKey formats are in apps/server/src/lib/reminders/due.ts:139,190,229. The push fallback tag push_${Date.now()} is at sw.ts:145.
```

<a id="rel-64"></a>

### `rel-64` [info] Евалюація entry-чанка index-*.js — найдовша задача головного потоку на старті (300-440 мс на 1x CPU)

- **Стан:** відкрито
- **Перевірка:** спірне · **Зусилля:** M · **Область:** web: bundle / perf
- **Де:** apps/server/dist/assets/index-*.js (entry chunk); apps/web/index.html
- **Першопричина:** Top-level side effects entry-модуля (ініціалізація каталогів, схем, observability boot) виконуються синхронно до першого малювання, а index.html має порожній #root без статичного сплешу.
- **Вплив:** На телефонах середнього класу це відкладає FCP і LCP. Цифри «TBT 1,2-3,2 с» у звіті насправді є сумою long tasks від навігації в навантаженій пісочниці, а не справжнім TBT, тож масштаб перебільшено.
- **Що зробити:** Профілювати top-level side effects entry-чанка і відкласти некритичне в idle. Перевірити мобільним LHCI з реальним throttling.
- **Примітка:** Уже є в docs/work/specs/audits/2026-09-01-product-audit/findings.md. Верифікатор підтвердив сирий замір, але не висновок про невідгукливий UI.

Знахідок у кластері: 1.

#### [info] Довгі задачі головного потоку: евалюація entry-модуля index-*.js займає 300-440 мс на 1x CPU; TBT 1.2-3.2 с на 4x CPU (/finyk, /?tab=profile, /)

- **ID:** `browser-crosscut/resilience-offline-perf#11` · **Вердикт:** сумнівно · **Лейн:** Браузер · наскрізне · **Категорія:** `perf`
- **Серйозність від шукача:** low
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md
- **Де:** apps/server/dist/assets/index-BLG6OGlS.js (entry chunk); маршрути /, /finyk, /?tab=profile, /status, /nutrition
- **Вплив:** На телефонах середнього класу інтерфейс не реагує 1-3 с після завантаження, що значно більше за бюджет TBT 200 мс. Пісочниця мала load average 13-14 на 4 CPU, тож цифри завищені, але найдовша задача стабільно припадає на евалюацію entry-модуля.
- **Рекомендація:** Профілювати top-level side effects entry-чанка (ініціалізація i18n-каталогу, zod-схеми, observability boot) і відкласти некритичне в idle. Перевірити мобільним LHCI на реальному throttling.

**Докази:**

```text
run-loaf.log (теплий пристрій, 1x CPU): '/ LoAF dur=439 blocking=387: 410ms module-script … index-BLG6OGlS.js'; '/?tab=profile … 440ms module-script'; '/finyk … 345ms module-script + кадр 523ms'. perf-deep.json (mobile 390x844, 4x CPU): '/' tbt 1808 (max task 932), '/finyk' tbt 3216 (max 1007), '/?tab=profile' tbt 2846 (max 1433), '/status' 1236, '/nutrition' 1398.
```

**Відтворення:**

```text
CPU=1 node 29-loaf.mjs; MOBILE=1 CPU=4 node 15-perf-deep.mjs (PerformanceObserver longtask і long-animation-frame).
```

**Верифікатор:**

```text
The raw observation reproduces: the largest long task is the module-script evaluation of the entry chunk index-BLG6OGlS.js. The framing is wrong, though. (1) The 'TBT' in 15-perf-deep.mjs:43 is the sum of (duration-50) over all long tasks from navigation start, not real TBT bounded by FCP. apps/web/index.html has an empty <div id="root"></div> and no static splash, so the entry-eval task runs before first paint. It delays FCP/LCP rather than making a painted UI unresponsive, so the impact claim ('інтерфейс не реагує 1-3 с після завантаження') is wrong for the dominant task. (2) The numbers come from a contended sandbox and swing with load. (3) The project budget is LHCI with the desktop preset (lighthouserc.json), and a prior local LHCI run recorded TBT ≤103 ms, within the 200 ms warn threshold (2026-09-01-product-audit progress.md). The eager bundle is already ratcheted and gated (≤268 kB), and boot-driven LCP is tracked as CI-8. What remains is a generic 'eager graph is heavy' observation with no specific defect, so severity drops to info.
```

**Додаткові докази верифікатора:**

```text
v11-loaf.mjs at load average about 5: CPU=1 gives an entry module-script LoAF of 187-250 ms per route ('/' 199/213 ms, '/?tab=profile' 187 ms, '/status' 250 ms, '/finyk' 171 ms), lower than the 300-440 ms reported. CPU=4 gives '/' 1470 ms, '/finyk' 498 ms and '/?tab=profile' 888 ms for the entry eval, plus post-paint React scheduler tasks (MessagePort.onmessage) of 300-410 ms. Run-to-run variance is large.
```

## Відхилені синтезом

- `browser-crosscut/gap-sw-update-new-deploy#10`: Що в update-циклі працює коректно (перевірено наживо). Причина: Довідкове позитивне спостереження: перелік того, що в update-циклі SW працює коректно. Дефекту немає, а зламані гілки покриває rel-14.
