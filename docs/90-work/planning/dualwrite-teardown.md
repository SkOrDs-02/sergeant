# Dual-write teardown — перехід клієнта на чистий SQLite

> **Status:** Active
> **Last touched:** 2026-07-05 by @dimastahov16012003. **Next review:** 2026-10-03.
> Трек-документ багатокрокової ініціативи: прибрати LS/MMKV-запис **модульних даних** (finyk / fizruk / nutrition / routine) і зробити SQLite єдиним джерелом правди на клієнті. Продовження [`storage-roadmap.md`](./storage-roadmap.md) (Stage 8 cut-over) і [ADR-0073](../../04-governance/adr/0073-dualwrite-generic-framework.md) (generic dual-write фреймворк). Прогрес живе **тут** — онови чекбокс у тому ж PR, що закриває крок (Hard Rule #15).

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
2. **Нуль LS/MMKV-записів модульних даних.** Усі мутації йдуть через SQLite-writer (нащадок dual-write adapter-а ADR-0073).
3. **`residualImport.ts` видалено** в усіх 8 модулях (4 web + 4 mobile) разом із boot-call-site і тестами.
4. **Seed / onboarding / demo** пишуть модульні дані через SQLite-шлях, не raw-LS; demo-flow кожного модуля зелений у браузері.
5. **LS/MMKV лишається тільки** для прапорців ≤1 KB (demo-toggle, session-handoff, migration-flags) і warm-cache TanStack Query. Список легітимних ключів задокументовано (§ 7).
6. **`pnpm check` зелений**; ADR-0073 snapshot-тести зелені (adapter лишається як SQLite-writer); Knip без нових знахідок.
7. **Entropy-janitor grep-правило** «нових `residualImport`/raw-LS-read модульних даних немає» додано в `tools/entropy-janitors/` (issue-only).
8. Ця сторінка оновлена: всі чекбокси § 8 закриті, Status → `Deprecated` (виконано, зберігається як історія).

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
| Модулів із зеленим browser demo-flow після teardown                           | 0 / 4                                                                      | **4 / 4**          |
| `pnpm check`                                                                  | зелений                                                                    | зелений (утримати) |
| Knip нові знахідки                                                            | 0                                                                          | 0                  |

> Точні числа baseline уточнюються у **Фазі 0** (інвентарний grep) — таблиця вище — оцінка з аудиту 2026-07-05.

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
- **Residue:** `useMonthlyPlan.ts:40-41` (`safeReadLS` — LS джерело правди, SQLite-слот `sqliteReader.ts:293-316` write-only) і `useWorkoutTemplates.ts:40-44` (те саме, слот `sqliteReader.ts:386-393`). Overlay не дотягнули.
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

Структурно симетричний web (ті самі `sqliteReader`/`sqliteReadBoot`/`residualImport`/`dualWrite`). **Місцями попереду web:** nutrition mobile вже tombstoned water/shopping/recipes (Stage 13, 7 MMKV-ключів у `residualImport`). **Місцями позаду:** routine mobile dual-write — completion-only (не повний 7-table parity) — звірити. Asymmetry за дизайном: mobile-fizruk `active-workout` промоутнуто в повноцінну dual-write-сутність (background kill/resume), на web це session-флаг.

---

## 7. Легітимні LS/MMKV-ключі (лишаються після teardown)

Ці **не** residue — цільова архітектура (R3, R5). Список зафіксувати, щоб janitor не флагував:

- **demo/onboarding toggles:** `FINYK_MANUAL_ONLY_KEY`, demo-mode прапорці.
- **session-handoff:** web `ACTIVE_WORKOUT_KEY` (workout-id string).
- **migration flags:** `finyk_token`/`finyk_mono_token_migrated` (one-time).
- **TTL warm-cache:** finyk proactive-advice (24h), TanStack Query persister.
- **cross-module bridge:** `usePushupActivity` слухає `storage`-event (не пише модульні дані).

---

## 8. Фазовий план (чекбокси — онови в PR, що закриває крок)

### Фаза 0 — розвідка та інвентар `(0.5 дня)`

- [ ] Чи `monoMirror` SQLite вже містить **усі** транзакції finyk (визначає розмір finyk: «переписати 3 читачі» vs «побудувати дзеркало транзакцій»). Файли: `monoMirror*.ts`, споживачі `ExpensesCard`/`useCoachInsight`/`useWeeklyDigest`.
- [ ] Mobile: чи `water_log`/`shopping_list` у `nutritionStore.ts` мають LS-first gap (як web) чи вже cache-first.
- [ ] Mobile routine: підтвердити, чи dual-write справді completion-only, чи вже повний.
- [ ] Інвентар seed-обходів: grep `writeJSON`/`safeWriteLS`/`setItem` у `core/onboarding/seedDemoData/*` + `presetApply.ts`; зафіксувати baseline-числа § 4.

### Фаза 1 — закрити read-residue `(паралельно по модулях)`

- [ ] **nutrition:** overlay-read у `useWaterTracker`/`useShoppingList` (патерн `useNutritionPrefsState.ts:37-41`); розширити `residualImport` на water/shopping ключі. Гейт: browser demo-flow water + shopping переживають reload.
- [ ] **fizruk:** overlay-read у `useMonthlyPlan` + `useWorkoutTemplates` (слоти вже є в `sqliteReader`). Гейт: monthly-plan + templates переживають reload.
- [ ] **finyk:** перевести `ExpensesCard`/`useCoachInsight`/`useWeeklyDigest`/`lsStats.ts` на `getCachedFinykSqliteState()`/`monoMirrorReader`; полагодити `finykBackup.dismissedRecurring`. Якщо Фаза 0 показала брак дзеркала транзакцій — окремий під-крок «транзакції → SQLite» (міграція, R7).
- [ ] **routine:** read-side чистий — пропуск.

### Фаза 2 — переписати seed / onboarding на SQLite

- [ ] `seedDemoData/{seedRoutine,seedNutrition,seedFizruk,seedFinyk}.ts` + `presetApply.ts` → писати через dual-write adapter (`triggerXDualWrite`/`saveXState`), не raw-LS. Гейт (R2): demo-flow кожного модуля зелений у браузері після hard-reload.
- [ ] Прибрати мертвий `cleanupDemoData::cleanRoutine` (+ аналоги) після переписування.

### Фаза 3 — викинути LS-запис + residualImport + first-paint fallback `(web)`

- [ ] Видалити `residualImport.ts` × 4 web + boot-call-sites (`sqliteReadBoot.ts:55/57/58/60`) + тести.
- [ ] Прибрати LS-write-хвости: fizruk monthlyPlan/templates, nutrition water/shopping, finyk tx-shim (`useMonobankWebhook`), finyk slots.
- [ ] First-paint (R9): прийняти «default до warm cache»; за потреби — синхронний перший SQLite-read.
- [ ] Прибрати мертві LS-ключі/константи; Knip.

### Фаза 4 — mobile parity

- [ ] Ті самі кроки Фаз 1-3 для `apps/mobile/**`, з урахуванням: nutrition mobile вже tombstoned (менше роботи); routine mobile — довести до повного parity, якщо Фаза 0 підтвердила completion-only; fizruk active-workout лишається dual-write (by design).

### Фаза 5 — фінальний cleanup і закриття

- [ ] Перейменувати `dualWrite/` → SQLite-writer (вже не «dual»); оновити docstring-и, ADR-0073 § наслідки.
- [ ] Entropy-janitor grep-правило «нових raw-LS-read модульних даних / residualImport немає» (issue-only).
- [ ] Оновити цей документ (усі чекбокси) + `storage-roadmap` cross-ref; Status → `Deprecated` (виконано).

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
