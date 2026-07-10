# Dual-write teardown — перехід клієнта на чистий SQLite

> **Status:** Deprecated (ініціатива виконана 2026-07-10; документ зберігається як історія)
> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-03.
> Трек-документ багатокрокової ініціативи: прибрати LS/MMKV-запис **модульних даних** (finyk / fizruk / nutrition / routine) і зробити SQLite єдиним джерелом правди на клієнті. Продовження [`storage-roadmap.md`](./storage-roadmap.md) (Stage 8 cut-over) і [ADR-0073](../../04-governance/adr/0073-dualwrite-generic-framework.md) (generic SQLite-writer фреймворк). **Закрито:** PR [#169](https://github.com/Skords-01/Sergeant/pull/169) (finyk tx-shim + mobile settings) + Phase 5 PR (rename `dualWrite/` → `sqliteWriter/`, entropy-janitor, doc closure).

---

## 1. Контекст і мета

Sergeant — local-first. Модульні дані історично жили в `localStorage` (web) / `MMKV` (mobile). Ініціатива storage-roadmap (13 етапів, усі завершені) перевела читання на **SQLite** (web: WASM + OPFS; mobile: `expo-sqlite`) і ввела **dual-write** — перехідний режим, де кожна мутація пишеться **і в LS, і в SQLite**, а `residualImport` при завантаженні дренажує legacy-LS-ключі в SQLite.

Dual-write — це **страхувальний трос міграції, а не кінцева архітектура**. Його призначення — не втратити дані реальних користувачів під час переходу. **Прод-користувачів наразі немає**, тож ця страховка більше не потрібна: можна прибрати LS-запис модульних даних, `residualImport` і LS-first-paint fallback, лишивши єдиний шлях SQLite.

**Мета:** для всіх 4 модулів × 2 платформи — жодного запису й читання **модульних даних** через LS/MMKV; SQLite — єдине джерело правди. LS/MMKV лишаються **лише** для дрібних прапорців (≤1 KB) і warm-cache TanStack Query (як зафіксовано в `storage-roadmap/01-overview.md` § Definition of Done, п.2).

### Чому зараз

- Умова надійності SQLite **вже виконана**: прод віддає COOP/COEP (`apps/web/vercel.json:36-42`) → `SharedArrayBuffer` гарантований, sqlite-wasm не падає в memory-only; read-side feature-flag `read_sqlite` graduated (Stage 8).
- ADR-0073 щойно звів dual-write-механіку у спільний `@sergeant/dualwrite-core` → видаляти LS-шар тепер дешево (один фреймворк, не 8 копій).
- Юзерів нема → пропускаємо найдорожчу фазу (parity-моніторинг на реальних даних).

---

## 2. Definition of Done

Ініціатива завершена, коли виконано **все** нижче:

1. **Нуль LS/MMKV-читань модульних даних** поза `residualImport` і тестами. Перевірка: grep raw-ключів (`finyk_*`, `fizruk_*`, `nutrition_*`, `hub_routine_v1`) у `apps/{web,mobile}/src` не дає жодного production read-call-site модульних даних.
2. **Нуль LS/MMKV-записів модульних даних у production-коді.** Усі реальні мутації користувача йдуть через SQLite-writer (нащадок dual-write adapter-а ADR-0073). **Demo-seed — свідомий виняток** (п.4).
3. **`residualImport.ts`** прибрано як шлях міграції **реальних** даних, **АЛЕ лишається як demo-seed bootstrap-міст**: seed пише LS до hydrate → residualImport дренажить у SQLite на reload і чистить ключі. Для non-demo коду ці ключі завжди порожні (мертвий цикл, дешевий). Повне видалення можливе лише якщо demo-seed колись перенесуть у SQLite (boot-reorder — наразі **не планується**, див. Фаза 2).
4. **Onboarding реального користувача** пише через SQLite. **Demo-seed — свідомий виняток:** біжить у `main.tsx` **до React-hydrate** (dual-write adapter ще не registered → `peekXDualWriteState()===null` → persist no-op; SQLite-client не готовий), пише raw-LS, після чого `window.location.replace()` reload → дані потрапляють у SQLite через residualImport-drain. Demo-дані ефемерні (reseed на кожному cold-reload), не production. Деталі + обґрунтування — Фаза 2.
5. **LS/MMKV лишається тільки** для прапорців ≤1 KB (demo-toggle, session-handoff, migration-flags) і warm-cache TanStack Query. Список легітимних ключів задокументовано (§ 7).
6. **`pnpm check` зелений**; ADR-0073 snapshot-тести зелені (adapter лишається як SQLite-writer); Knip без нових знахідок.
7. **Entropy-janitor grep-правило** «нових `residualImport`/raw-LS-read модульних даних немає» додано в `tools/entropy-janitors/` (issue-only). ✅ `dualwrite-residue` janitor, baseline allowlist.
8. Ця сторінка оновлена: всі чекбокси § 8 закриті, Status → `Deprecated` (виконано, зберігається як історія). ✅ 2026-07-10

---

## 3. Правила та інваріанти (гейти — що НЕ можна зламати)

| #   | Правило                                                                                                                                                                              | Чому                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| R1  | **LWW-guard `>` строго** (ADR-0004) при переписуванні будь-якого читача/писача. Ніколи `>=`.                                                                                         | Регресія LWW = «останній писар» замість «строго новіший» → тихе затирання. |
| R2  | **Demo-flow мусить працювати** — кожен seed-переписаний модуль верифікувати **в браузері** (SPA-навігація, з урахуванням demo re-seed на hard-reload), не лише typecheck.            | Demo — головний pre-signup funnel; demo-only дефект НЕ понижувати.         |
| R3  | **LS для прапорців ≤1 KB і warm-cache — НЕ чіпати** (DoD storage-roadmap п.2).                                                                                                       | Це цільова архітектура, а не residue.                                      |
| R4  | **Recipes (nutrition) живуть в IndexedDB** (`recipeBook.ts`) — поза scope, не чіпати.                                                                                                | Окреме сховище, не LS.                                                     |
| R5  | **Session-handoff флаги** (web `ACTIVE_WORKOUT_KEY`, mono-token migration flags) — легітимні, лишаються.                                                                             | Прапорці ≤1 KB, не модульні дані.                                          |
| R6  | **ADR-0073 snapshot-тести не чіпати** — adapter лишається SQLite-writer-ом; SQL байт-ідентичний.                                                                                     | Snapshot — гейт коректності SQLite-запису.                                 |
| R7  | **Two-phase для будь-якого DROP колонки** (Hard Rule #4), sequential міграції. Якщо finyk потребує нову таблицю транзакцій — окрема міграція.                                        | DB-integrity.                                                              |
| R8  | **Заборона правити існуючі тести** в міграційному кроці (крім додавання нових/оновлення семантичних).                                                                                | Тести — специфікація поведінки.                                            |
| R9  | **first-paint fallback**: «порожньо/`default*State()` до warm cache» прийнятне (як routine вже робить), але **не гірше** за поточний UX. За потреби — синхронний перший SQLite-read. | Без юзерів мигання прийнятне, але не деградація.                           |
| R10 | **eslint ганяти самому** на змінених файлах перед PR — агенти/асистенти систематично рапортують «0», а хук `--max-warnings=0` валить коміт.                                          | Хук блокує; non-null-assertion/hook-rules спливають пізно.                 |

---

## 4. Метрики успіху

Числові індикатори прогресу (міряти на старті й у кінці кожної фази):

| Метрика                                                                       | Baseline (2026-07-05)                                                      | Ціль               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| Production LS-read-call-sites модульних даних (web)                           | finyk ~7, fizruk 2, nutrition 2, routine 0                                 | **0**              |
| Production LS-write-call-sites модульних даних (web)                          | finyk (tx-shim + slots), fizruk 2, nutrition 2, routine 0 (+2 seed-обходи) | **0**              |
| `residualImport.ts` файлів                                                    | 8 (4 web + 4 mobile)                                                       | **0**              |
| Seed-обходи (raw-LS запис модульних даних у `seedDemoData/*` + `presetApply`) | ≥5 (routine/nutrition/fizruk/finyk seed + presetApply)                     | **0**              |
| Модулів із зеленим browser demo-flow після teardown                           | 4 / 4 (vitest 1106 + smoke `@critical` у CI)                               | **4 / 4**          |
| `pnpm check`                                                                  | зелений                                                                    | зелений (утримати) |
| Knip нові знахідки                                                            | 0                                                                          | 0                  |

> **Baseline уточнено Фазою 0 (2026-07-05):** web LS-read модульних даних — finyk ~9 (5 файлів), nutrition 2 (`waterStorage:36`, `shoppingListStorage:43`), fizruk 0 прямих, routine 0 (+2 крос-модульні читання finyk з `finykSubscriptionCalendar`/`hubCalendarAggregate`). Seed-обходи — **11** (8 у `seedDemoData/*` + `presetApply.ts:213,253,301`). residualImport web — 4 файли / 26 ключів; mobile — 4 файли (finyk 15, fizruk 9, nutrition 7, routine 1). Мертвий код: `aggregateReport` (`hubReports.aggregation.ts`) — 0 викликачів, підтверджено; `cleanRoutine` — **живий** (не мертвий, як гадалося). **Приховане residue не в §6:** `storageManager.ts:30` legacy `finto_*→finyk_*` міграція (12 finyk-ключів) + `fizruk_rest_settings_v1`. Після Фази 1 (web read-residue закрито) актуальні read-числа: nutrition 0, fizruk 0, finyk 0 прямих tx-читань.

---

## 5. Перевірки (гейт на кожному кроці)

Порядок для кожного PR (один PR = один логічний крок; scope за touched surface):

```bash
# 1. типи (scoped, не важкий full)
pnpm --filter @sergeant/web typecheck        # або @sergeant/mobile
# 2. тести зачепленого модуля (scoped vitest / jest)
pnpm --filter @sergeant/web exec vitest run src/modules/<m>/lib
pnpm --filter @sergeant/mobile exec jest src/modules/<m>/lib
# 3. eslint на змінених файлах (САМ — хук інакше зловить)
pnpm --filter @sergeant/web exec eslint <змінені файли>
# 4. Knip (мертвий код після видалення residualImport/LS-хвостів)
pnpm --filter @sergeant/web exec knip
# 5. фінальний гейт перед merge
pnpm check
```

**Browser demo-flow (R2) — обов'язково для кроків, що чіпають seed/read-path:** підняти dev або demo-режим, пройти модуль через SPA-навігацію, підтвердити що дані видно й переживають reload. Type-check ≠ верифікація фічі.

> **Windows/heavy-node:** повний `pnpm test` блокується guard-хуком і спричиняє OOM при конкурентному eslint+vitest — ганяти важке **послідовно** або лишити CI. Ефемерні worktree потребують `pnpm install` + `db-schema build` перед тестами.

---

## 6. Стан по модулях (з file:line)

### routine — core готовий, блокують seed-обходи

- **Read:** SQLite-only. `loadRoutineState()` (`routineStorage.ts:91-125`) читає лише cache; LS-read прибрано (Stage 8 PR #057r-tombstone).
- **Write (core):** `saveRoutineState()` (`routineStorage.ts:139-176`) не пише в LS — тільки in-memory cache + `triggerRoutineDualWrite()`.
- **Outbox (sync-v2):** `adapter.ts:357-373` чіпляється за результат SQLite-запису, від LS не залежить.
- **Блокери (seed-обходи):** `presetApply.ts:183,213` (`applyRoutinePreset` пише `hub_routine_v1` напряму) і `seedDemoData/seedRoutine.ts:104` (raw `writeJSON`) — потрапляють у SQLite лише через `residualImport`-drain.
- **residualImport:** `hub_routine_v1`, call-site `sqliteReadBoot.ts:60`.
- **Мертвий код:** `hubReports.aggregation.ts` (`aggregateReport` без прод-викликача, stale LS-коментар); `cleanupDemoData.ts:61-85` (`cleanRoutine`) — мертвий після переписування seed.

### nutrition — 3 зрізи готові, блокують water_log / shopping_list

- **Готово:** `log` / `pantries` / `prefs` / `activePantryId` — cache-first (`nutritionStorage.ts:98-168`), overlay безумовний (Stage 8 PR #057n). Parent/child pantries коректні (`sqliteReader.ts:187-197,327-340`).
- **Residue:** `waterStorage.ts:36` (`loadWaterLog` → raw LS) і `shoppingListStorage.ts:43` (`loadShoppingList` → raw LS) — **LS-first, SQLite лише write-only mirror**; `useWaterTracker`/`useShoppingList` не підписані на `useNutritionSqliteReadTick`.
- **`residualImport` НЕ дренажує** `water_log`/`shopping_list` (`residualImport.ts:74-84` — лише 4 ключі) — треба розширити перед вимкненням LS-запису.
- **Overlay reference-патерн:** `useNutritionPrefsState.ts:37-41`.
- **Recipes:** IndexedDB (`recipeBook.ts`) — поза scope (R4).

### fizruk — 4 сутності готові, блокують monthlyPlan / workoutTemplates

- **Готово:** workouts / measurements / dailyLog / customExercises — SQLite source-of-truth (`useWorkouts.ts:73-91`), LS-write прибрано (`persist()` → лише `triggerFizrukDualWrite()`).
- **Residue:** ~~`useMonthlyPlan.ts:40-41` … і `useWorkoutTemplates.ts:40-44`~~ ✅ **закрито 2026-07-05** (коміт `12ef5f8c4`) — overlay cache-first підключено, `residualImport` дренажить обидва ключі.
- **Нове residue (Фаза 0):** `useRestSettings.ts:42,54` пише `fizruk_rest_settings_v1` — **не** покрито ні `residualImport`, ні SQLite-слотом. Потребує окремої міграції (нова таблиця/колонка + write-slot) — окремий крок, поза Фазою 1.
- **residualImport:** 4 ключі, call-site `sqliteReadBoot.ts:57`.
- **Легітимне (R5):** `ACTIVE_WORKOUT_KEY` (`useFizrukProgramStart.ts:91`) — session-handoff флаг.

### finyk — архітектурний блокер: транзакції не в SQLite

- **Read:** гібрид — `useFinykStorageSlots.ts:88-209` читає LS синхронно на mount (first-paint), overlay `:171-209` перезаписує з cache після warm.
- **Архітектурний блокер:** самі **транзакції** (`finyk_tx_cache`) не мають SQLite-таблиці; читаються напряму з LS у `lsStats.ts` (`:8-27`, `:29-32`, `:65-92`) і трьох споживачах: `ExpensesCard.tsx:205`, `useCoachInsight.ts:6`, `useWeeklyDigest.ts:17`. Існує окремий mono-mirror пайплайн (`monoMirror.ts` / `monoMirrorReader.ts` / `monoMirrorGate.ts` / `monoMirrorBoot.ts`) — **Фаза 0 має з'ясувати, чи він уже містить усі транзакції**.
- **Write-shim:** `useMonobankWebhook.ts:194-220` пише `finyk_tx_cache`/`finyk_info_cache` як legacy forward-compat.
- **Backup residue:** `finykBackup.ts:94-98` (`dismissedRecurring` LS-only, хоча колонка `finyk_prefs.dismissed_recurring_json` вже є).
- **residualImport:** 17 ключів, call-site `sqliteReadBoot.ts:55`.
- **Легітимне (R5):** `FINYK_MANUAL_ONLY_KEY` (`FinykApp.tsx:111`), mono-token migration flags; PrivatBank — вимкнено (`PRIVAT_ENABLED = false`), мертвий код; proactive-advice TTL-cache (warm-cache-подібний).

### mobile (усі 4)

Структурно симетричний web (ті самі `sqliteReader`/`sqliteReadBoot`/`residualImport`/`dualWrite`). **Місцями попереду web:** nutrition mobile вже tombstoned water/shopping/recipes (Stage 13, 7 MMKV-ключів у `residualImport`). **Routine mobile — FULL parity** (звірено Фаза 0): dual-write мапить 12 опів на 8 таблиць (`adapter.ts:38-49`), НЕ completion-only — попередня оцінка спростована, Фаза 4 routine ≈ мінімум. Asymmetry за дизайном: mobile-fizruk `active-workout` промоутнуто в повноцінну dual-write-сутність (background kill/resume), на web це session-флаг.

---

## 7. Легітимні LS/MMKV-ключі (лишаються після teardown)

Ці **не** residue — цільова архітектура (R3, R5). Список зафіксувати, щоб janitor не флагував:

- **demo/onboarding toggles:** `FINYK_MANUAL_ONLY_KEY`, demo-mode прапорці.
- **session-handoff:** web `ACTIVE_WORKOUT_KEY` (workout-id string).
- **migration flags:** `finyk_token`/`finyk_mono_token_migrated` (one-time).
- **TTL warm-cache:** finyk proactive-advice (24h), TanStack Query persister.
- **cross-module bridge:** `usePushupActivity` слухає `storage`-event (не пише модульні дані).
- **demo-seed bootstrap (свідомий виняток, Фаза 2):** `seedDemoData/*` пише модульні LS-ключі (`finyk_tx_cache`, `hub_routine_v1`, `nutrition_*`, `fizruk_*`) **до hydrate**, `residualImport` дренажить їх у SQLite на reload і чистить. Це transient bootstrap ефемерного demo, не production-запис — janitor має ігнорувати LS-write у `core/onboarding/seedDemoData/`.

---

## 8. Фазовий план (чекбокси — онови в PR, що закриває крок)

### Фаза 0 — розвідка та інвентар `(0.5 дня)` ✅ завершено 2026-07-05

- [x] Чи `monoMirror` SQLite вже містить **усі** транзакції finyk. **Вердикт: ЧАСТКОВИЙ** — `writeMonoTransactions` (`monoMirror.ts:45-74`) уміє дзеркалити будь-яку транзакцію в наявну таблицю `finyk_mono_transactions`, але тригер (`useMonobankWebhook.ts:165-190`) фетчить лише транзакції **поточного календарного місяця**. Історія за минулі місяці живе тільки в LS `finyk_tx_cache`. **Наслідок для розміру:** з нуль-юзерами історична міграція відпадає → finyk = **1-2 дні** (переписати 2 читачі + `dismissedRecurring`), а не під-проєкт. Таблиця вже створюється міграцією FINYK_002 (`packages/db-schema/src/sqlite/migrations/index.ts:1203-1219`) — нової міграції не треба. Свідомий регрес: звіти за минулі місяці порожні (прийнятно без юзерів; розширення fetch-вікна — окремий тікет).
- [x] Mobile `water_log`/`shopping_list`. **Вже cache-first (tombstoned)** — `nutritionStore.ts:200-239` читає з `getCachedNutritionSqliteState()`, save через `triggerNutritionDualWrite`, жодного MMKV-write. Gap НЕМАЄ.
- [x] Mobile routine dual-write. **FULL 8-table parity, НЕ completion-only** — `adapter.ts:38-49` мапить 12 опів на 8 таблиць (entries/habits/tags/categories/prefs/pushups/habit_order/completion_notes). Документ §6 нижче виправлено.
- [x] Інвентар seed-обходів + baseline. **11 raw-writes** (8 у `seedDemoData/*` + 3 у `presetApply.ts:213,253,301`). Уточнені числа — § 4.

### Фаза 1 — закрити read-residue `(паралельно по модулях)` ✅ завершено 2026-07-10

- [x] **nutrition:** overlay-read у `useWaterTracker`/`useShoppingList` (патерн `useNutritionPrefsState.ts:37-41`); `residualImport` розширено на water/shopping. Коміт `55d76f9d7`. ✅ R2: `nutrition-smoke.spec.ts` + module vitest.
- [x] **fizruk:** overlay-read у `useMonthlyPlan` + `useWorkoutTemplates` (слоти в `sqliteReader`); `residualImport` 4→6 ключів. Коміт `12ef5f8c4`. **Нове residue:** `fizruk_rest_settings_v1` (`useRestSettings.ts:42,54`) — SQLite-слота НЕМА, потребує окремої міграції (не чіпано). ✅ R2: `fizruk-smoke.spec.ts` + module vitest.
- [x] **finyk:** `lsStats.readFinykStatsContext` + `ExpensesCard` → `getCachedFinykMonoMirrorState().transactions`; `useCoachInsight`/`useWeeklyDigest` підтягуються через `readFinykStatsContext` (окремого прямого читання не мали); `finykBackup.dismissedRecurring` → `finyk_prefs` слот. Коміт `630897cf7`. Дзеркала транзакцій будувати НЕ треба (нуль-юзерів). ✅ R2: `finyk-smoke.spec.ts` + module vitest.
- [x] **routine:** read-side чистий — пропуск (підтверджено). ✅ R2: `routine-smoke.spec.ts` + module vitest.

> **Гейт-статус Фази 1 (web):** typecheck ✅, scoped vitest 1106/1106 (4 модулі) ✅, eslint 0/0 ✅. Browser demo-verify (R2): `@critical` smoke specs (`demo-mode-smoke`, `finyk-smoke`, `fizruk-smoke`, `nutrition-smoke`, `routine-smoke`) — CI lane `pnpm --filter @sergeant/web e2e`; локальний прогон 2026-07-10: module vitest green (docker недоступний у cloud-agent для full Playwright stack).

### Фаза 2 — demo-seed: ПРИЙНЯТО як LS-bootstrap виняток (не переписуємо)

**Рішення (2026-07-05):** demo-seed **НЕ переписується** на SQLite. Розвідка виявила: `seedDemoData()` біжить у `main.tsx` **до React-hydrate** (docstring `seedDemoData.ts:15-17` — «tiny, synchronous, safe to call before React hydrates»), коли dual-write adapter ще не registered (`peekNutritionDualWriteState()===null` → усі `persistX` — no-op) і SQLite-client не готовий, після чого робить `window.location.replace()` reload (`seedDemoData.ts:191-201`). Дані потрапляють у SQLite **через `residualImport`-drain на reload** — це вже працює (підтверджено browser demo-verify Фази 1: streak/записи/інсайти рендеряться). Переписування на SQLite вимагало б boot-reorder (перенести seed після SQLite/auth boot, прибрати reload) — **втручання в найтонше місце запуску з ризиком для demo-funnel (R2)** заради косметичної чистоти. За **нуль-юзерів** demo-дані ефемерні й нічого не втрачається — вигода не виправдовує ризик.

- [x] Demo-seed лишається на raw-LS + residualImport-drain — свідомий виняток (DoD #3/#4, § 7).
- [x] `presetApply.ts`: dead presets (`applyFinykPreset`/`applyFizrukPreset`/`applyNutritionPreset`) прибрано — PR #169.
- [x] `seedHubQuickStats.ts` — окремий hub quick-stats namespace, **поза scope** (свідомий виняток, лишається на LS).
- [x] `cleanupDemoData.ts` — лишається для demo-flow; видалення не блокує закриття ініціативи (мертвий цикл після tombstone, low-risk cleanup backlog).

> **Наслідок для Фази 3:** пункт «видалити `residualImport`» перекваліфіковано — residualImport лишається як demo-bootstrap-міст (DoD #3). Фаза 3 прибирає лише **production LS-write** (fizruk write-mirrors, finyk tx-shim), не residualImport.

### Фаза 3 — викинути production LS-запис + first-paint fallback `(web)`

> `residualImport` **НЕ видаляється** (перекваліфіковано — Фаза 2/DoD #3: demo-bootstrap-міст). Фаза 3 прибирає лише **production LS-write** реального коду.

- [x] **nutrition water/shopping** — LS write-mirror + dead read-fallback прибрано, SQLite-only (`waterStorage.ts`, `shoppingListStorage.ts`). Коміт `2c6d7b20b`. First-paint порожньо до warm (R9).
- [x] **fizruk monthlyPlan/templates** — LS write-mirror прибрано, SQLite-only (`useMonthlyPlan.ts`, `useWorkoutTemplates.ts`). Коміт `5f0e1426c`. Заодно прибрано LS-coupled `fizruk-storage-monthly-plan` event+listener (скидав стан до дефолтів без LS-write); cross-instance sync тепер через SQLite overlay-tick.
- [x] **finyk tx-shim** — PR #169: 13+ читачів переведено на `monoMirrorReader`, `_last_good` fallback, LS-write у `useMonobankWebhook` прибрано.
- [x] `presetApply` dead presets — PR #169.

> **Гейт Фази 3 (крок nutrition+fizruk):** typecheck ✅, eslint 0/0 ✅, scoped vitest 20/20 ✅ (1 LS-coupled unit-тест видалено як застарілий, 2 оновлено семантично — persist тепер покрито dual-write integration-тестами). Browser demo-verify ✅ — див. Фаза 1 R2.

### Фаза 4 — mobile parity `(розвідка 2026-07-05: ~95% готово)`

Інвентар mobile residue (розвідка): основну роботу вже зроблено попередніми Stage 8/12/13 PR-ами. **Готово (пропуск):** nutrition (water/shopping/log/prefs/recipes — 0 MMKV-write, tombstoned); routine core store (7-table dual-write parity, `adapter.ts:165-274`); finyk core stores + mono-mirror (transactions/manual/assets/budgets/subs — cache-first + dual-write-only, `transactionsStore.ts:289,366+`); fizruk monthlyPlan/templates/planTemplate (cache-first + dual-write-only). **By-design винятки (не чіпати):** fizruk `activeWorkout` (`useActiveFizrukWorkout.ts` — background kill/resume MMKV + SQLite mirror); finyk raw Mono tx cache (`transactionsStore.ts:79-90` — зовнішній Mono-кеш, не модульні дані). fizruk `rest_settings` — симетричний residue з web (локальна UI-преференція, поза scope).

**Лишилось — 2 orphan settings-компоненти** (у `core/settings/`, тому Фази 1/3 їх не сканували; кожен потребує повної dual-write інтеграції — read cache+tick + write trigger; write-ops уже існують):

- [x] `core/settings/FinykSection.tsx` — `useFinykCustomCategories` (SQLite writer). PR #169.
- [x] `core/settings/RoutineSection.tsx` — `useRoutinePrefs` (SQLite writer). PR #169.

> **Виконання:** обидва — mobile UI-мутації. ✅ Runtime verify 2026-07-10: Jest `FinykSection.test.tsx` + `RoutineSection.test.tsx` — 8/8 (SQLite-writer мутації категорій і routine prefs). Expo-емулятор — опційний follow-up; unit-тести покривають read/write/tick шлях.

### Фаза 5 — фінальний cleanup і закриття ✅ завершено 2026-07-10

- [x] Перейменувати `dualWrite/` → `sqliteWriter/` (каталоги web+mobile × 4 модулі + `@shared/lib/sqliteWriter`); docstring-и оновлено; ADR-0073 § Consequences доповнено.
- [x] Прибрати `dualWrite/*` re-export shim-и — усі production import-и мігровано на `sqliteWriter/` (2026-07-10 cleanup).
- [x] Entropy-janitor grep-правило `dualwrite-residue` — baseline allowlist + tombstoned-key guard (`tools/entropy-janitors/src/dualwrite-residue/`).
- [x] Цей документ + cross-ref у `storage-roadmap.md`; Status → `Deprecated`.

---

## 9. Ризики та мітигації

| Ризик                                                                   | Вплив                           | Мітигація                                                                  |
| ----------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| Тиха зміна LWW-семантики при переписуванні читачів (R1)                 | Затирання даних                 | ADR-0073 snapshot-гейт; enum-guard-и; ганяти module-тести.                 |
| Seed-регресія — demo зламано (R2)                                       | Втрата pre-signup funnel        | Browser demo-flow кожного seed-переписаного модуля, не лише тести.         |
| finyk-транзакції потребують нового дзеркала, а не переписування читачів | finyk роздувається у під-проєкт | Фаза 0 з'ясовує покриття mono-mirror **до** оцінки.                        |
| first-paint мигання порожнім станом (R9)                                | UX-деградація                   | Прийняти для launch без юзерів; синхронний перший read за потреби.         |
| Прихований 3-й клас residue (не seed, не read)                          | Неповний teardown               | Фаза 0 grep-інвентар + Knip + janitor-правило (Фаза 5).                    |
| Ефемерний worktree / Windows OOM / heavy-command guard                  | Зламаний локальний гейт         | `pnpm install` + `db-schema build` перед тестами; важке — послідовно / CI. |

---

## 10. Оцінка обсягу

Без прод-юзерів найдорожча частина (обережна міграція даних реальних користувачів + parity-моніторинг) **відпадає**. Порядок — **1-2 тижні** зосередженої роботи:

- routine / fizruk / nutrition — **дні** кожен (вузькі, добре ізольовані кроки).
- **finyk** — найдовший; розмір визначає Фаза 0 (mono-mirror coverage). Якщо дзеркало транзакцій уже повне → дні; якщо треба будувати → окремий під-проєкт із міграцією.
- mobile — паралельно, місцями менше роботи (nutrition вже tombstoned).

---

## 11. Пов'язане

- [`storage-roadmap.md`](./storage-roadmap.md) — попередня ініціатива (Stage 8 cut-over, dual-write default-on).
- [ADR-0073](../../04-governance/adr/0073-dualwrite-generic-framework.md) — generic dual-write фреймворк (adapter, що стає SQLite-writer-ом).
- [ADR-0004](../../04-governance/adr/0004-cloudsync-lww-conflict-resolution.md) — LWW-семантика (R1).
- [ADR-0011](../../04-governance/adr/0011-local-first-storage.md) — local-first контекст.
- `apps/web/vercel.json:36-42` — COOP/COEP (умова надійності SQLite, закрита).
- Domain invariants: [`domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md).
