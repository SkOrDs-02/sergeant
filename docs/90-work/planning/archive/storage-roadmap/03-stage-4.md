# Storage & Sync — PR-плани: Stage 4 (Per-module migration)

> **Last touched:** 2026-07-18 by @dimastahov16012003. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/planning/storage-roadmap/03-stage-4.md`.

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 0–3](./02-stages-0-3.md) · [→ Stage 5](./04-stage-5.md)

### Stage 4 — Per-module migration

> **Шаблон 4 PR-ів на модуль:** schema → dual-write → cut-over → cleanup.
> Кожен модуль за feature flag. Нижче розписано для `routine`; для інших
> ідентично з заміною назв.

#### **Routine** (3 тижні)

##### **PR #023 — `feat(routine): Drizzle schema + SQLite migration files`** ✅ MERGED

> **Статус (2026-05-02):** залендили (merge `47bade84`). Скоп — pure schema
> promotion: SQLite Drizzle-схеми (`routineEntries`, `routineStreaks`,
> `syncOpOutbox`, `syncOpCursor`) і inline міграцію вже залендили в
> Stage 2 (PR #018) і живили SPIKE з PR #022. Цей PR промоутить їх з
> SPIKE-only naming у production source-of-truth: додає neutral
> `ROUTINE_CLIENT_MIGRATIONS` / `ROUTINE_MIGRATIONS_TABLE` exports
> (попередні `ROUTINE_SPIKE_*` лишаються як `@deprecated` aliases для
> back-compat зі SPIKE library), додає SQLite snapshot test парний до
> існуючого `pg-routine-snapshot.test.ts` і прибирає stale «Stage 3
> SPIKE» формулювання з коментарів. **Без SPIKE-pass dependency** —
> production routine module на цей шар ще не сів (це PR #024
> dual-write); за feature flag нічого не активується.

- Додати таблиці у `packages/db-schema/sqlite/routine.ts`. Postgres-таблиці
  вже існують (PR #020). Migration scripts.
- **Артефакти.**
  - `packages/db-schema/src/sqlite/migrations/index.ts` — нові
    `ROUTINE_CLIENT_MIGRATIONS` + `ROUTINE_MIGRATIONS_TABLE`; стара пара
    `ROUTINE_SPIKE_*` тримається як `@deprecated` alias на ту саму
    `MigrationFile[]` й ту саму ledger-table (Hard Rule: SPIKE library
    не змінюється).
  - `packages/db-schema/src/sqlite/index.ts` — re-export нових констант
    поряд із Drizzle-схемами; SPIKE-named aliases теж re-export-ються
    щоб ніщо в споживачах не зламалось.
  - `packages/db-schema/src/__tests__/sqlite-routine-snapshot.test.ts`
    — snapshot тест на column types, defaults, indexes (включно з
    partial-index `WHERE` clauses) і enum-кортежі для `op` / `status`.
    Парний до `pg-routine-snapshot.test.ts`.
- **AC.** `pnpm --filter @sergeant/db-schema test` — passes; новий тест
  виявить будь-яку drift між Drizzle-схемою і inline-DDL. SPIKE library
  тести (`apps/{web,mobile}/.../sqliteSpike/__tests__/`) проходять без
  змін бо `_SPIKE_*` aliases вказують на ті ж масиви/рядки.
- **Out-of-scope (відкладено).** Жодних змін у production routine
  module (`apps/{web,mobile}/src/modules/routine/{hooks,components}/`),
  жодного видалення SPIKE library, жодних feature-flag-ів — це PR #024.
- **Dep.** PR #022 (SPIKE pass) — _м'яка_ залежність: schema-promotion
  не блокується hardware-gate замірами, бо за відсутністю dual-write
  prod routine module ще читає з LS і ці схеми залишаються off-path до
  PR #024.

##### **PR #024 — `feat(routine-domain): dual-write LS↔SQLite behind feature flag`** ✅ MERGED

> **Статус (2026-05-03):** залендили (merge `3f41e7f6`). Скоп — додає
> новий feature flag `feature.routine.sqlite_v2.dual_write` (web +
> mobile, default: off, experimental: true) і дзеркальний шар
> `apps/{web,mobile}/src/modules/routine/lib/dualWrite/` з трьох
> файлів: `diff.ts` (pure-function diff `prev → next` →
> `RoutineDualWriteOp[]` — completion-add / completion-remove /
> habit-rename), `adapter.ts` (best-effort SQL поверх
> `SqliteMigrationClient` із LWW-guard на `updated_at`, ідемпотентний
> `${habitId}:${dateKey}` row id) і `index.ts` (orchestrator з
> registration-pattern контекстом — `isEnabled()`, `getUserId()`,
> `getMigrationClient()`, `getNow()`, `logger?` — щоб LS-write шар
> залишався без cycle-dep на auth/sqlite singleton-и). Інтегровано у
> `apps/web/src/modules/routine/lib/routineStorage.ts ::saveRoutineState`
> та `apps/mobile/src/modules/routine/lib/routineStore.ts ::saveRoutineState`
> через `triggerRoutineDualWrite(prev, next)` fire-and-forget;
> `peekRoutineDualWritePrev()` повертає `null` коли контекст не
> зареєстровано — нульовий overhead на off-flag шляху. Boot wiring
> (web `main.tsx` + mobile entry, виклик
> `registerRoutineDualWriteContext(...)` з реальними auth/sqlite
> singleton-ами) **відкладено окремим follow-up PR-ом** і станом на
> 2026-05-03 ще не зроблено — тому за умови ввімкнених flag-ів
> dual-write шар у проді поки не активний (`isRoutineDualWriteRegistered()`
> повертає `false`), і будь-який real-world rollout вимагає спочатку
> приземлити цей boot-wiring PR.

- **Артефакти.**
  - `apps/{web,mobile}/src/core/lib/featureFlags.ts` — нова
    `feature.routine.sqlite_v2.dual_write` (default off, experimental).
  - `apps/web/src/modules/routine/lib/dualWrite/{diff,adapter,index}.ts`
    - парні `__tests__/{diff,adapter,integration}.test.ts` (vitest +
      `better-sqlite3` через існуючий
      `sqliteSpike/__tests__/testSqlite.ts` хелпер).
  - `apps/mobile/src/modules/routine/lib/dualWrite/{diff,adapter,index}.ts`
    - jest-парні `__tests__/{diff,adapter,integration}.test.ts`
      (`better-sqlite3` напряму, як SPIKE-тести роблять).
  - `apps/mobile/src/core/db/sqlite.ts` — додано
    `getSqliteMigrationClient()` + збереження native handle поряд з
    Drizzle wrapper, щоб дзеркальний шар отримував той самий expo-sqlite
    handle без re-open (під WAL на iOS це deadlock).
  - `apps/web/src/modules/routine/lib/routineStorage.ts` +
    `apps/mobile/src/modules/routine/lib/routineStore.ts` — wiring у
    `saveRoutineState`.

- **AC.**
  - `pnpm --filter @sergeant/web test -- --run modules/routine/lib/dualWrite`
    (vitest) — diff, adapter, integration спеки pass.
  - `pnpm --filter @sergeant/mobile test -- modules/routine/lib/dualWrite`
    (jest) — те саме на mobile.
  - `pnpm lint` — clean (322+ rules).
  - SPIKE library тести лишаються green — adapter дзеркально пише в
    ту саму `routine_entries` таблицю, що SPIKE піднімає через ту ж
    `migrateRoutineSpike` міграцію.

- **Out-of-scope (відкладено).**
  - Boot wiring (`registerRoutineDualWriteContext` з реальними
    auth/sqlite singleton-ами) — окремий follow-up.
  - Cut-over reads на SQLite — це PR #025.
  - Drop `module_data.routine` blob — PR #026.
  - `routine_streaks` mirror — defer до PR #025/#040 (derived data,
    пишеться з reads cut-over-у).
  - Persistent op-log + retry — PR #040.
  - Зміни SPIKE library — не торкаємо.

- **Dep.** PR #023 (schema promotion) ✅ landed; PR #022 (SPIKE pass)
  — _м'яка_ залежність (за flag default off нічого в проді не
  активується).

##### **PR #025 — `feat(routine): cut-over reads to SQLite, deprecate LS`** ✅ MERGED (#1407)

- Read йде з SQLite. LS-write залишається на 2 тижні як safety net.
- Sync `module_data.routine` blob більше не оновлюється з клієнта.
- Server-side: backfill повторно для юзерів що не онлайн були під час
  rollout-у.
- **Реалізовано:** `sqliteReader.ts`, `sqliteReadBoot.ts`, `useSqliteReadBoot.ts`,
  feature flag `feature.routine.sqlite_v2.read_sqlite`, module sync exclusion,
  `loadRoutineState()` overlay з SQLite completions.

##### **PR #026 — `chore(routine): remove LS path, drop module_data.routine`** ✅ MERGED (#1412)

- Видалити routine з `SYNC_MODULES`. Server: `DELETE FROM module_data WHERE module='routine'`.
- ESLint guard проти reads з `STORAGE_KEYS.ROUTINE`.
- **Реалізовано:** видалено routine з `SYNC_MODULES` (web + mobile), мігровано
  `insightsEngine.ts` на `loadRoutineState()`, додано `no-restricted-syntax`
  ESLint guard, оновлено `eslint-plugin-sergeant-design` tracked keys.

> **Server-side migration (after client deploy):**
>
> ```sql
> DELETE FROM module_data WHERE module = 'routine';
> ```
>
> Run once after all clients have picked up PR #026. The blob is no
> longer pushed from clients, so orphaned rows just waste storage.

#### **Fizruk** (3 тижні) — PR #027–#030

##### **PR #027 — `feat(fizruk): postgres + sqlite normalized tables`** ✅ MERGED

- **Реалізовано (server).** `apps/server/src/migrations/029_fizruk_tables.sql`
  створює `fizruk_workouts`, `fizruk_workout_items`, `fizruk_workout_sets`,
  `fizruk_custom_exercises`, `fizruk_measurements` з індексами
  `(user_id, started_at DESC)` / `(user_id, deleted_at) WHERE deleted_at IS NULL`
  / `(workout_id, sort_order)` / `(workout_item_id, sort_order)` /
  `(user_id, measured_at DESC)` і soft-delete колонкою `deleted_at`.
  `down.sql` чистить таблиці у зворотньому FK-порядку.
- **Реалізовано (shared schema).** `packages/db-schema/src/pg/fizruk.ts`
  - `packages/db-schema/src/sqlite/fizruk.ts` дають Drizzle ORM-схеми для
    PG і SQLite (паралельні шейпи з суфіксом `_lite` для індексів). Snapshot
    тести у `packages/db-schema/src/__tests__/{pg,sqlite}-fizruk-snapshot.test.ts`
    ловлять drift між драйверами.
- **Реалізовано (client).** `packages/db-schema/src/sqlite/migrations/index.ts`
  експортує `FIZRUK_CLIENT_MIGRATIONS` з власним ledger-ом
  `__fizruk_migrations` (окремий від routine SPIKE-ledger-у). Клієнтський
  раннер `apps/{web,mobile}/src/modules/fizruk/lib/clientMigrate.ts`
  застосовує bundled migrations при першому write-і.
- **Дзеркальний test.** `apps/server/src/migrations/__tests__` snapshot-и
  - `packages/db-schema` PG/SQLite парність — нові колонки/індекси не
    поїдуть на server без оновлення client schema.

##### **PR #028 — `feat(fizruk): dual-write LS/MMKV↔SQLite (best-effort)`** ✅ MERGED

- **Scope.** Кожен write у Fizruk LS-blob-и
  (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`, `fizruk_measurements_v1`)
  додатково мирорить у локальну SQLite. Reads ще беруться з LS — це чистий
  shadow-write для validation.
- **Реалізовано (web).** `apps/web/src/modules/fizruk/lib/dualWrite/`:
  `diff.ts` рахує `FizrukDualWriteOp[]` з `prev → next` snapshot-у,
  `adapter.ts` — async best-effort upsert у `fizruk_workouts` /
  `fizruk_workout_items` / `fizruk_workout_sets` /
  `fizruk_custom_exercises` / `fizruk_measurements` з LWW-guardом
  на `updated_at`, `index.ts` — orchestrator з registration-pattern-ом
  (gating через `feature.fizruk.sqlite_v2.dual_write`, fail-soft на
  no-userId / sqlite-unavailable). Mirror у
  `apps/mobile/src/modules/fizruk/lib/dualWrite/` для expo-sqlite.
- **Feature flag.** `feature.fizruk.sqlite_v2.dual_write` (default off)
  у `apps/web/src/core/lib/featureFlags.ts` + `apps/mobile/src/core/lib/featureFlags.ts`.
  Kill switch — toggle off у flag UI, dual-write припиняється, LS лишається
  єдиним write target.
- **Не входить.** Outbox / `/v2/sync/push` для `fizruk_*` — ще немає.
  `OP_LOG_TABLE_REGISTRY` у `apps/server/src/modules/sync/syncV2.ts` поки
  whitelist-ить тільки `routine_entries` / `routine_streaks`. Server-side
  apply-функції для `fizruk_*` поїдуть разом із PR #029 (split на
  `applyFizrukWorkouts` / `applyFizrukItems` / `applyFizrukSets` /
  `applyFizrukCustomExercises` / `applyFizrukMeasurements`).
- **Dep.** PR #027 (schema + client migration runner).

##### **PR #029 — `feat(fizruk): cut-over reads to SQLite, server apply-fns`** ✅ MERGED

- **Реалізовано (server).** `apps/server/src/modules/sync/syncV2.ts` —
  5 split apply-функцій (`applyFizrukWorkouts`, `applyFizrukItems`,
  `applyFizrukSets`, `applyFizrukCustomExercises`,
  `applyFizrukMeasurements`) додано у `OP_LOG_TABLE_REGISTRY`. Кожна з них
  валідує `id`, перевіряє ownership (`user_id`), застосовує LWW-guard
  (`existing.updated_at < clientTs`), підтримує soft-delete
  (`UPDATE deleted_at = clientTs` замість DELETE) і парсить опціональні
  числові/JSON поля (helper-и `parseRequiredDate` / `parseOptionalNumber`
  / `parseOptionalInt` / `toJsonbParam`). FK-violation на parent
  (`workout_id` / `workout_item_id`) ловиться SAVEPOINT-ом
  `syncV2Push`-у і повертається як `apply_failed`.
- **Реалізовано (web).** `apps/web/src/modules/fizruk/lib/sqliteReader.ts`
  тримає кеш `{ workouts, customExercises, measurements }`. Бутстрап
  через `sqliteReadBoot.ts` + `useFizrukSqliteReadBoot` (idempotent,
  fire-and-forget, fail-soft). `useWorkouts` / `useMeasurements` /
  `useExerciseCatalog` overlay-ять зі SQLite-кешу під фічфлаґом
  `feature.fizruk.sqlite_v2.read_sqlite` (LS читає лишається як перша
  paint synchronous-fallback, ніколи не блокується на SQLite).
  Pub-sub нотифікація між хуками — `sqliteReadGate.ts` (`useSyncExternalStore`
  - tick counter, refresh by `notifyFizrukSqliteCacheRefresh`).
- **Реалізовано (mobile).** `apps/mobile/src/modules/fizruk/lib/sqliteReader.ts`
  — паритет shape-а кешу для майбутнього read cutover; UI overlay у
  mobile хуках додано окремим follow-up PR #029a (див. нижче). FK /
  soft-delete / LWW семантика повністю мирорить web.
- **Тести.**
  `apps/server/src/modules/sync/syncV2.integration.test.ts` — 5 нових
  describe-кейсів: insert→update, LWW reject, soft-delete, parent-then-child
  FK у одному push-батчі, `invalid_measured_at`-валідація.
  `apps/web/src/modules/fizruk/lib/sqliteReader.test.ts` — 7 unit-тестів
  на refresh / filter by user / soft-delete exclude / hydrate
  custom-exercises + measurements / cached state.
- **Feature flag.** `feature.fizruk.sqlite_v2.read_sqlite` (default off)
  — потребує увімкненого `dual_write`. Toggle off → reads повертаються
  на LS path; SQLite дані лишаються (нічого не дропається).
- **Не входить.** Outbox / cloudsync push з `fizruk_*` через `/v2/sync/push`
  (web/mobile pull/push pipeline), backfill `module_data.fizruk` →
  `fizruk_*` per-user. Mobile UI overlay рознесений у PR #029a (вже
  залендили), сам LS cleanup і drop `module_data.fizruk` — у PR #030.
- **Dep.** PR #027 (schema), PR #028 (dual-write).

##### **PR #029a — `feat(mobile): fizruk read overlay from SQLite under feature flag`** ✅ MERGED

> **Статус (2026-05-03):** залендили (merge `8746145d`). Скоп —
> mobile-частина PR #029, яка винесена окремо щоб тримати web cut-over
>
> - server apply-fns одним PR-ом. Додає `feature.fizruk.sqlite_v2.read_sqlite`
>   у `apps/mobile/src/core/lib/featureFlags.ts`, mobile bootstrap
>   `apps/mobile/src/modules/fizruk/lib/sqliteReadBoot.ts` +
>   `useFizrukSqliteReadBoot` хук, та `sqliteReadGate.ts` pub-sub між
>   `useFizrukWorkouts` / `useCustomExercises` / `useMeasurements`. Reads
>   overlay-ять зі SQLite-кешу під фічфлаґом, MMKV-write залишається як
>   синхронний first-paint fallback.

- **Артефакти.**
  - `apps/mobile/src/core/lib/featureFlags.ts` — нова
    `feature.fizruk.sqlite_v2.read_sqlite` (default off, experimental).
  - `apps/mobile/src/modules/fizruk/lib/{sqliteReadBoot,sqliteReadGate}.ts`
    - парні `__tests__/{sqliteReadBoot,sqliteReadGate}.test.ts`.
  - `apps/mobile/src/modules/fizruk/hooks/{useFizrukSqliteReadBoot,useFizrukWorkouts,useCustomExercises,useMeasurements}.ts`
    — overlay reads із SQLite cache.
  - `apps/mobile/src/modules/fizruk/pages/Dashboard.tsx` —
    `useFizrukSqliteReadBoot()` виклик у бутстрапі модуля.
- **Тести.**
  `apps/mobile/src/modules/fizruk/__tests__/Dashboard.test.tsx` +
  `apps/mobile/src/modules/fizruk/hooks/__tests__/useFizrukWorkouts.sqliteOverlay.test.tsx`
  - `apps/mobile/src/modules/fizruk/lib/__tests__/sqliteRead{Boot,Gate}.test.ts`.
- **Не входить.** Outbox / cloudsync push з `fizruk_*` (PR #030+).
  Backfill `module_data.fizruk` → `fizruk_*` per-user (PR #030).
- **Dep.** PR #029 (web cut-over + server apply-fns).

##### **PR #030 — `chore(fizruk): drop module_data.fizruk cloud-sync wiring, ESLint guard`** ✅ MERGED

> На відміну від routine PR #026, fizruk LS read-fallback залишався у
> модульних хуках уже після PR #029 / PR #029a (web/mobile read overlay) —
> вони читають LS першим джерелом і overlay-ять зі SQLite під флагом.
> Цей PR обмежений до cloud-sync wiring і ESLint guard-у, бо власне
> повний LS write cut-over — окрема робота (write cut-over PR після
> 100% rollout dual-write + read_sqlite + server-side backfill).

- **Реалізовано (shared).** `packages/shared/src/sync/modules.ts` —
  знятий блок `fizruk` з `SYNC_MODULES`; від тепер cloud-sync пайплайн
  ігнорує ВСІ 11 LS/MMKV-ключів `fizruk_*_v1` для push/pull (один
  source of truth, реекспортний у web/mobile cloudSync config).
- **Реалізовано (eslint-plugin).**
  `packages/eslint-plugin-sergeant-design/index.js` — знято 11 fizruk-
  ентрі з `TRACKED_STORAGE_KEY_NAMES` / `TRACKED_STORAGE_KEY_VALUES`
  з коментом-надгробком (mirroring routine PR #026 pattern).
- **Реалізовано (eslint config).** `eslint.config.js` додає
  `no-restricted-syntax` guard проти прямих `STORAGE_KEYS.FIZRUK_<key>`
  доступів поза канонічними fizruk-хуками з `ignores`-лістом для
  тестів, fizruk module wrappers, `insightsEngine.ts` (cross-module
  insights), `hubBackup.ts` (mobile backup).
- **Тести.** `packages/shared/src/sync/__tests__/modules.test.ts`
  оновлений (зняв fizruk snapshot, додав explicit "module не існує"
  assertion); `packages/eslint-plugin-sergeant-design/__tests__/no-raw-tracked-storage.test.mjs`
  flipнутий (fizruk LS keys не повинні тригерити правило); web + mobile
  cloudSync test fixtures (`buildPayload.test.ts`,
  `useCloudSync.{behavior,hardening}.test.ts`,
  `state/{moduleData,dirtyModules,versions}.test.ts`,
  `__tests__/{resolver,offlineQueue.replay}.test.ts`,
  `apps/mobile/src/sync/__tests__/{replay,offlineQueue}.test.ts`)
  оновлено: де fizruk був "ще один валідний модуль" — підставлено
  `nutrition` / `profile`; додано explicit "drops the retired fizruk
  module" assertions.
- **Не входить.** Server-side runbook `DELETE FROM module_data WHERE
module='fizruk'` — окремий ops-PR після того, як PR #029 + PR #029a
  - dual-write flag розкочено на 100% юзерів і backfill `module_data.fizruk`
    → `fizruk_*` per-user завершено. LS write cut-over (повне видалення
    MMKV/LS write-path у fizruk-хуках) — окремий follow-up PR (потребує
    100% rollout `feature.fizruk.sqlite_v2.{dual_write,read_sqlite}`).
- **Deploy gate.** Після merge cloud-sync перестає
  пушити/пуллити `module_data.fizruk` для ВСІХ юзерів. Юзери з
  вимкненим `feature.fizruk.sqlite_v2.dual_write` теряють cross-device
  sync fizruk-даних. Розкатувати тільки після 100% rollout
  dual-write + read*sqlite + server-side backfill `module_data.fizruk`
  → `fizruk*\*` per-user.
- **Dep.** PR #029 (web cut-over + server apply-fns), PR #029a (mobile
  read overlay), boot-wiring follow-up #1491 (`register{Routine,Fizruk}DualWriteContext`).

#### **Nutrition** (3 тижні) — PR #031–#034

##### **PR #031 — `feat(nutrition-domain): Drizzle SQLite + Postgres normalized tables + server apply-fns`** ✅ LANDED

> **Status:** ✅ LANDED — schema landed as `17644bef` (Drizzle schema +
> SQLite migration) + `c9eeb01d` (renumber migration 031→035). Server
> apply-fns (`applyNutritionMeals`, `applyNutritionPantries`,
> `applyNutritionPantryItems`, `applyNutritionPrefs`,
> `applyNutritionRecipes`) added to `OP_LOG_TABLE_REGISTRY` in
> `syncV2.ts`. Integration tests covering insert→update, LWW reject,
> soft-delete, FK parent-then-child, singleton upsert.

- **Scope.** Створити нормалізовані таблиці на PG і SQLite під 5 LS/MMKV
  ключів модуля (`NUTRITION_LOG`, `NUTRITION_PANTRIES`,
  `NUTRITION_ACTIVE_PANTRY`, `NUTRITION_PREFS`, `NUTRITION_SAVED_RECIPES`).
  Цільові таблиці (фінальний шейп уточнити у PR — нижче — concept):
  `nutrition_meal_log` (per-row append-only лог їжі з кількістю /
  калоріями / макросами), `nutrition_pantries` (контейнер + sort_order),
  `nutrition_pantry_items` (food_id, quantity, expires_at,
  pantry_id FK), `nutrition_recipes` (рецепти з jsonb-ingredients і
  макросами), `nutrition_prefs` (singleton-row per-user — KV-store
  для smart defaults). Усі — soft-delete через `deleted_at`,
  `(user_id, updated_at DESC)` index, FK + cascades для pantry_items.
- **Артефакти.**
  - `apps/server/src/migrations/030_nutrition_tables.{sql,down.sql}` —
    DDL з індексами і FK; `down.sql` чистить у зворотньому FK-порядку.
  - `packages/db-schema/src/pg/nutrition.ts` +
    `packages/db-schema/src/sqlite/nutrition.ts` — паралельні Drizzle
    ORM-схеми (PG і SQLite) з `_lite` суфіксами для індексів.
  - `packages/db-schema/src/__tests__/{pg,sqlite}-nutrition-snapshot.test.ts`
    - snapshot drift-guard між драйверами.
  - `packages/db-schema/src/sqlite/migrations/index.ts` додає
    `NUTRITION_CLIENT_MIGRATIONS` з власним ledger-ом
    `__nutrition_migrations` (separate від `__routine_migrations` /
    `__fizruk_migrations`).
  - `apps/{web,mobile}/src/modules/nutrition/lib/clientMigrate.ts` —
    клієнтський runner (lazy, idempotent, pre-write).
  - `apps/server/src/modules/sync/syncV2.ts` — split apply-функції
    `applyNutritionMealLog`, `applyNutritionPantries`,
    `applyNutritionPantryItems`, `applyNutritionRecipes`,
    `applyNutritionPrefs` додано у `OP_LOG_TABLE_REGISTRY`. Кожна
    валідує `id` + ownership (`user_id`), застосовує LWW
    (`existing.updated_at < clientTs`), soft-delete
    (`UPDATE deleted_at` замість DELETE), парсить
    `parseRequiredDate` / `parseOptionalNumber` / `toJsonbParam`.
- **AC.**
  - `pnpm --filter @sergeant/db-schema test` — snapshot тести проходять,
    дрифт між PG і SQLite виявляється.
  - `apps/server/src/modules/sync/syncV2.integration.test.ts` — нові
    describe-кейси на 5 nutrition apply-функцій (insert→update,
    LWW reject, soft-delete, parent-then-child FK для pantry_items,
    invalid timestamp validation).
  - `pnpm -w lint` clean (без нових STORAGE_KEYS guards — це PR #034).
- **Не входить.**
  - Dual-write шар (`apps/{web,mobile}/src/modules/nutrition/lib/dualWrite/`)
    — це PR #032.
  - Cut-over reads (UI читає з SQLite під фічфлаґом) — PR #033.
  - Drop `module_data.nutrition` з `SYNC_MODULES` + ESLint guard — PR #034.
- **Dep.** PR #027 (схема pattern), PR #029 (server apply-fns pattern),
  PR #030 (cloud-sync drop pattern).
- **Risk.** Schema-only — нульовий risk на проді (default-off flag і
  наявних писань у нові таблиці нема). Snapshot тести ловлять drift.

##### **PR #032 — `feat(nutrition-domain): dual-write LS/MMKV↔SQLite`** ✅ LANDED — [#1528](https://github.com/Skords-01/Sergeant/pull/1528)

- Mirror PR #028 (fizruk dual-write) для nutrition. Feature flag
  `feature.nutrition.sqlite_v2.dual_write`, default off, experimental.
- Реєстрація через registration-pattern, fail-soft на no-userId /
  sqlite-unavailable. Boot-wiring у follow-up за тим же шаблоном що
  PR #1491 для routine + fizruk.
- **Dep.** PR #031.

##### **PR #033 — `feat(nutrition-domain): cut-over reads to SQLite under feature flag`** ✅ LANDED — [#1574](https://github.com/Skords-01/Sergeant/pull/1574)

- Mirror PR #029 + PR #029a (web + mobile fizruk read overlay) для
  nutrition. Feature flag `feature.nutrition.sqlite_v2.read_sqlite`,
  default off. LS/MMKV-write залишається safety net.
- **Реалізовано (web).** `apps/web/src/modules/nutrition/lib/sqliteReader.ts`
  тримає кеш `SqliteNutritionCache` з `{ log, pantries, activePantryId,
prefs, recipes, refreshedAt }`. `refreshNutritionSqliteState(client,
userId)` запитує 5 SQLite таблиць (`nutrition_meals`,
  `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`,
  `nutrition_recipes`), фільтрує `deleted_at IS NULL`, трансформує
  рядки у domain типи (`Meal`, `Pantry`, `NutritionPrefs`, `Recipe`),
  будує nested maps (items-by-pantry). Helpers: `safeParseJson`,
  `toDateKey`, `toTimeStr`, `rowToMeal`, `rowToPantry`, `rowToRecipe`.
  `sqliteReadBoot.ts` — idempotent boot з перевіркою feature flag
  `feature.nutrition.sqlite_v2.read_sqlite`, запуском міграцій через
  `migrateNutrition(client)`, початковим refresh кешу. Fail-soft
  (catch + console.warn). `sqliteReadGate.ts` — pub-sub notification
  через `useSyncExternalStore` (cacheTick counter + listeners Set);
  `useNutritionSqliteReadTick()`, `useNutritionSqliteReadFlag()`,
  `notifyNutritionSqliteCacheRefresh()`.
- **Реалізовано (mobile).** `apps/mobile/src/modules/nutrition/lib/`
  — паритет shape-а кешу і refresh logic з web. `sqliteReader.ts`
  використовує `@sergeant/nutrition-domain` типи і `@sergeant/shared`
  `NullableMacros`. `sqliteReadBoot.ts` читає flag з MMKV через
  `safeReadLS` + `FLAGS_KEY`, використовує `getSqliteMigrationClient()`
  замість `getSqliteDb()`. `sqliteReadGate.ts` додає combined hook
  `useNutritionSqliteReadGate()` що повертає `{ enabled, tick }`.
- **Доставлено в [#1574](https://github.com/Skords-01/Sergeant/pull/1574)** (повний скоуп закрили одним PR-ом, разом із PR #031 + PR #032 server apply-fns):
  - Web: UI overlay у nutrition хуках (`useMeals`, `usePantries`,
    `useNutritionPrefs`, `useRecipes`) під feature flag — аналог
    fizruk `useFizrukWorkouts` / `useCustomExercises` overlay.
  - Mobile: аналогічний UI overlay + `useNutritionSqliteReadBoot`
    виклик у Dashboard/module entry.
  - Feature flag `feature.nutrition.sqlite_v2.read_sqlite` реєстрація
    у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
- **Dep.** PR #032.

##### **PR #034 — `chore(nutrition-domain): drop module_data.nutrition cloud-sync wiring + ESLint guard`** ✅ LANDED — [#1636](https://github.com/Skords-01/Sergeant/pull/1636)

- Mirror PR #030 (fizruk cloud-sync drop). Знімає `nutrition` з
  `SYNC_MODULES`, прибирає 5 NUTRITION\_\* ентрі з
  `eslint-plugin-sergeant-design` tracked sets, додає
  `no-restricted-syntax` guard у `eslint.config.js`. Server-side
  `DELETE FROM module_data WHERE module='nutrition'` — окремий
  runbook ops PR.
- **Deploy gate.** Як і PR #030: розкатувати тільки після 100% rollout
  `feature.nutrition.sqlite_v2.{dual_write,read_sqlite}` + server
  backfill `module_data.nutrition` → `nutrition_*` per-user.
- **Dep.** PR #033 (read overlay у проді).

#### **Finyk** (4 тижні) — PR #035–#039 (один extra PR на Mono mirror на клієнті)

> **Контекст.** Finyk — найважчий модуль Stage 4: 19 cloud-sync ключів
> (`SYNC_MODULES.finyk` у `packages/shared/src/sync/modules.ts`),
> 13+ доменів (budgets / subscriptions / assets / debts / receivables /
> hidden accounts / hidden TXs / monthly plan / TX categories / TX splits /
> mono-debt links / networth history / custom categories / manual expenses /
> TX filters / show-balance prefs) плюс 3 Mono-кеші (`FINYK_TX_CACHE`,
> `FINYK_INFO_CACHE`, `FINYK_TX_CACHE_LAST_GOOD`). Тому 5 PR-ів замість 4:
> схема (PR #035) + dual-write (PR #036) + read overlay (PR #037) + Mono
> mirror — це окрема PR (PR #038), бо Mono API є source-of-truth і шейп
> per-tx даних відрізняється від user-edited blob-ів — + cloud-sync drop
>
> - ESLint guard (PR #039). Усі дзеркалять відповідні fizruk PR
>   #027–#030 і nutrition PR #031–#034.

##### **PR #035 — `feat(finyk-domain): Drizzle SQLite + Postgres normalized tables + server apply-fns`** ✅ LANDED — [#1667](https://github.com/Skords-01/Sergeant/pull/1667)

- **Scope.** Створити нормалізовані таблиці на PG і SQLite під 16
  user-edited cloud-sync ключів модуля (`FINYK_HIDDEN`, `FINYK_HIDDEN_TXS`,
  `FINYK_BUDGETS`, `FINYK_SUBS`, `FINYK_ASSETS`, `FINYK_DEBTS`, `FINYK_RECV`,
  `FINYK_MONTHLY_PLAN`, `FINYK_TX_CATS`, `FINYK_TX_SPLITS`,
  `FINYK_MONO_DEBT_LINKED`, `FINYK_NETWORTH_HISTORY`, `FINYK_CUSTOM_CATS`,
  `FINYK_MANUAL_EXPENSES`, `FINYK_TX_FILTERS`, `FINYK_SHOW_BALANCE`).
  Mono-кеші (`FINYK_TX_CACHE`, `FINYK_INFO_CACHE`, `FINYK_TX_CACHE_LAST_GOOD`)
  — НЕ входять, ідуть у PR #038 окремо. Цільові таблиці (фінальний шейп
  уточнити у PR — нижче — concept):
  - **Per-row CRUD таблиці** (id uuid PK, user_id, jsonb data, soft-delete,
    `(user_id, updated_at DESC) WHERE deleted_at IS NULL` index): `finyk_budgets`,
    `finyk_subscriptions`, `finyk_assets`, `finyk_debts`, `finyk_receivables`,
    `finyk_custom_categories`, `finyk_manual_expenses`, `finyk_tx_filters`.
    Domain-types у `apps/web/src/modules/finyk/hooks/useStorage.types.ts`
    (`Budget`, `Subscription`, `ManualAsset`, `Debt`, `Receivable`,
    `CustomCategory`, `ManualExpense`) тримаємо як `data_json` (jsonb)
    замість stretching кожного поля у колонку — спрощує клієнтську міграцію
    і uses storage уже LWW-friendly per-id.
  - **Composite-PK таблиці без id**: `finyk_hidden_accounts(user_id, account_id)`,
    `finyk_hidden_transactions(user_id, transaction_id)` — обидві
    set-membership структури з `STORAGE_KEYS.FINYK_HIDDEN` і
    `FINYK_HIDDEN_TXS`. PK захищає від дублікатів.
  - **Per-tx mapping таблиці**: `finyk_tx_categories(user_id, transaction_id, category_id, updated_at, deleted_at)`
    (для `FINYK_TX_CATS` map<txId, category>),
    `finyk_tx_splits(user_id, transaction_id, splits_json, updated_at, deleted_at)`
    (для `FINYK_TX_SPLITS` map<txId, TxSplit[]>),
    `finyk_mono_debt_links(user_id, transaction_id, debt_ids_json, updated_at, deleted_at)`
    (для `FINYK_MONO_DEBT_LINKED` map<txId, debtId[]>).
  - **Time-series таблиця**: `finyk_networth_history(id, user_id, month varchar(7), networth real, snapshot_json, ...)`
    з `(user_id, month DESC)` unique index — для `FINYK_NETWORTH_HISTORY`
    NetworthEntry[].
  - **Singleton-row prefs**: `finyk_prefs(user_id PK, monthly_plan_json,
show_balance, updated_at, deleted_at)` — об'єднує
    `FINYK_MONTHLY_PLAN` (єдиний об'єкт `{income, expense, savings}`)
    і `FINYK_SHOW_BALANCE` (boolean) у одну row-per-user, як
    `nutrition_prefs` у PR #031.
- **Артефакти.**
  - `apps/server/src/migrations/037_finyk_tables.{sql,down.sql}` —
    DDL з індексами і composite PKs; `down.sql` чистить у зворотньому
    FK-порядку. (Migration 036 — останній на main.)
  - `packages/db-schema/src/pg/finyk.ts` +
    `packages/db-schema/src/sqlite/finyk.ts` — паралельні Drizzle
    ORM-схеми (PG і SQLite) з `_lite` суфіксами для індексів. Великий
    розмір файла очікуваний (~16 таблиць vs 5 у nutrition / 5 у fizruk).
  - `packages/db-schema/src/__tests__/{pg,sqlite}-finyk-snapshot.test.ts`
    — snapshot drift-guard між драйверами.
  - `packages/db-schema/src/sqlite/migrations/index.ts` додає
    `FINYK_CLIENT_MIGRATIONS` з власним ledger-ом
    `__finyk_migrations` (separate від `__routine_migrations` /
    `__fizruk_migrations` / `__nutrition_migrations`).
  - `apps/{web,mobile}/src/modules/finyk/lib/clientMigrate.ts` —
    клієнтський runner (lazy, idempotent, pre-write).
  - `apps/server/src/modules/sync/syncV2.ts` — split apply-функції
    `applyFinykBudgets`, `applyFinykSubscriptions`, `applyFinykAssets`,
    `applyFinykDebts`, `applyFinykReceivables`, `applyFinykHiddenAccounts`,
    `applyFinykHiddenTransactions`, `applyFinykTxCategories`,
    `applyFinykTxSplits`, `applyFinykMonoDebtLinks`,
    `applyFinykNetworthHistory`, `applyFinykCustomCategories`,
    `applyFinykManualExpenses`, `applyFinykTxFilters`, `applyFinykPrefs`
    додано у `OP_LOG_TABLE_REGISTRY`. Кожна валідує `id` + ownership
    (`user_id`), застосовує LWW (`existing.updated_at < clientTs`),
    soft-delete (`UPDATE deleted_at` замість DELETE), парсить
    `parseRequiredDate` / `parseOptionalNumber` / `toJsonbParam`.
- **AC.**
  - `pnpm --filter @sergeant/db-schema test` — snapshot тести проходять,
    дрифт між PG і SQLite виявляється.
  - `apps/server/src/modules/sync/syncV2.integration.test.ts` — нові
    describe-кейси на 15 finyk apply-функцій (insert→update,
    LWW reject, soft-delete, composite-PK upsert для hidden_accounts /
    hidden_transactions, singleton upsert для prefs, invalid timestamp
    validation, FK-violation на parent для networth_history).
  - `pnpm -w lint` clean (без нових STORAGE_KEYS guards — це PR #039).
- **Не входить.**
  - Dual-write шар (`apps/{web,mobile}/src/modules/finyk/lib/dualWrite/`)
    — це PR #036.
  - Mono client-side mirror (`finyk_mono_transactions`,
    `finyk_mono_accounts`, `finyk_mono_account_snapshots`) — це PR #038
    окремо, бо source-of-truth — Mono API, не user, і refresh-cycle
    відрізняється.
  - Cut-over reads (UI читає з SQLite під фічфлаґом) — PR #037.
  - Drop `module_data.finyk` з `SYNC_MODULES` + ESLint guard — PR #039.
- **Dep.** PR #027 (fizruk schema pattern), PR #031 (nutrition schema
  pattern), PR #029 (server apply-fns pattern), PR #034 (cloud-sync
  drop pattern як референс на майбутню PR #039).
- **Risk.** Schema-only — нульовий risk на проді (default-off flag і
  наявних писань у нові таблиці нема). Snapshot тести ловлять drift.
  Найбільший за обсягом schema-PR на Stage 4 (16 таблиць) —
  тримаємо `data_json` jsonb замість per-field колонок щоб уникнути
  жорсткого зв'язку між Drizzle schema і domain types — refactoring
  у `useStorage.types.ts` не повинен ламати DB.

##### **PR #036 — `feat(finyk-domain): dual-write LS/MMKV↔SQLite`** ✅ LANDED — [#1680](https://github.com/Skords-01/Sergeant/pull/1680)

- Mirror PR #028 (fizruk dual-write) і PR #032 (nutrition dual-write)
  для finyk. Feature flag `feature.finyk.sqlite_v2.dual_write`,
  default off, experimental.
- **Scope.** Кожен write у Finyk LS-blob-и (15 cloud-sync ключів окрім
  Mono-кешів — діло PR #038) додатково мирорить у локальну SQLite.
  Reads ще беруться з LS — це чистий shadow-write для validation.
- **Реалізовано (web).** `apps/web/src/modules/finyk/lib/dualWrite/`:
  `diff.ts` рахує `FinykDualWriteOp[]` з `prev → next` snapshot-у per
  storage-key (composite діff: kept/added/removed для list-shape ключів,
  upsert/delete для map-shape, set-replace для prefs). `adapter.ts`
  — async best-effort upsert у відповідні `finyk_*` таблиці з
  LWW-guardом на `updated_at`. `index.ts` — orchestrator з
  registration-pattern-ом (gating через
  `feature.finyk.sqlite_v2.dual_write`, fail-soft на no-userId /
  sqlite-unavailable). `extract.ts` — пара мапперів LS-shape →
  diff-state. `dualWriteBoot.ts` + `useFinykDualWriteBoot()` —
  boot-wiring (mirror nutrition). `useFinykDualWriteSync()` —
  per-`useFinykStorageSlots`-render snapshot diff trigger; шлях
  включається тільки коли flag і userId відомі.
- **Реалізовано (mobile).** `apps/mobile/src/modules/finyk/lib/dualWrite/`
  diff/adapter/index/extract з тим самим shape-ом. Boot-hook
  `useFinykDualWriteBoot` встановлюється у `FinykApp.tsx`.
  `assetsStore.ts`, `budgetsStore.ts`, `transactionsStore.ts`
  додатково викликають `triggerFinykDualWrite(prev, next)` після
  `safeWriteLS` per-key (через `stateWithSlice` helper для
  ізольованого diff-у — інші ключі лишаються `EMPTY_FINYK_STATE` і
  не випльовують операцій).
- **Реєстрація.** Через registration-pattern як у routine / fizruk /
  nutrition. `bootFinykDualWrite()` + `registerFinykDualWriteContext()`
  у `lib/dualWriteBoot.ts` встановлюється з `useFinykDualWriteBoot`
  у `FinykApp.tsx` (web + mobile).
- **Не входить.** Outbox / `/v2/sync/push` для `finyk_*` (server
  apply-fns ландять у PR #035). Reads з SQLite — PR #037.
- **Dep.** PR #035 (schema + client migration runner).

##### **PR #037 — `feat(finyk-domain): cut-over reads to SQLite under feature flag`** ✅ LANDED (`c89870c6`)

- Mirror PR #029 + PR #029a (web + mobile fizruk read overlay) і
  PR #033 (nutrition read overlay) для finyk. Feature flag
  `feature.finyk.sqlite_v2.read_sqlite`, default off. LS/MMKV-write
  залишається safety net.
- **Реалізувати (web).** `apps/web/src/modules/finyk/lib/sqliteReader.ts`
  — кеш `SqliteFinykCache` з усіма 13+ доменами, `refreshFinykSqliteState(client, userId)`
  запитує всі finyk-таблиці, фільтрує `deleted_at IS NULL`,
  трансформує рядки у domain типи з `useStorage.types.ts`,
  будує nested maps (txId → category, txId → splits, txId → debt_ids).
  `sqliteReadBoot.ts` — idempotent boot з перевіркою feature flag,
  запуском міграцій через `migrateFinyk(client)`, початковим refresh
  кешу. `sqliteReadGate.ts` — pub-sub нотифікація через
  `useSyncExternalStore`.
- **Реалізувати (mobile).** `apps/mobile/src/modules/finyk/lib/`
  паритет shape-а кешу і refresh logic. Combined hook
  `useFinykSqliteReadGate()` що повертає `{ enabled, tick }`.
- **UI overlay.** Wiring у існуючі finyk хуки (`useStorage`,
  `useBudgets`, `useNetworthHistory`, `useSubscriptions`, …) під
  flag — read від SQLite-кешу під feature flag, LS-fallback як
  перша paint synchronous-fallback. Tab-flip під flag для
  Budgets / Subscriptions / Assets / Debts / Receivables / Networth
  сторінок.
- **Feature flag реєстрація** `feature.finyk.sqlite_v2.read_sqlite`
  у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
- **Не входить.** Mono client-side mirror (PR #038). Drop
  `module_data.finyk` (PR #039).
- **Dep.** PR #036 (dual-write).

##### **PR #038 — `feat(finyk-domain): client-side Mono cache mirror in SQLite`** ✅ LANDED — [#1702](https://github.com/Skords-01/Sergeant/pull/1702)

> **Чому окрема PR.** На відміну від інших finyk-доменів (user-edited),
> Mono кеші — реплікація **зовнішнього** API source-of-truth.
> `FINYK_TX_CACHE` (тисячі транзакцій), `FINYK_INFO_CACHE` (rate-limited
> Mono accounts/clientInfo), `FINYK_TX_CACHE_LAST_GOOD` (fallback
> snapshot) — потребують іншого refresh-cycle (Mono API + webhook +
> AI-enrichment) ніж user-edited blob-и. Тому виділяю в окрему PR
> щоб не ламати dual-write шаблон.

- **Scope.** Перенести три Mono-кеші у per-row SQLite-таблиці
  `finyk_mono_transactions`, `finyk_mono_accounts`,
  `finyk_mono_account_snapshots` (з `account_id`, `tx_id`, `imported_at`
  колонками для пагінації / refresh-cycle). Mirror на PG не потрібен
  — Mono API server-side вже джерело.
- **Реалізувати.** `apps/{web,mobile}/src/modules/finyk/lib/monoMirror/`
  — refresh helper що пише у SQLite на кожен Mono `/personal/statement`
  fetch (як зараз пише у LS), upsert по `tx_id` з LWW (Mono `time` field).
  Reads — overlay у `useMonobank` під фічфлаґом
  `feature.finyk.sqlite_v2.mono_mirror`. LS-write залишається
  safety net під час experiment.
- **Не входить.** PG-mirror Mono транзакцій (server-side вже має
  Mono integration через `apps/server/src/modules/finyk/`); op-log push
  для Mono-кешів — НЕ потрібен, кожен клієнт refresh-ить локально
  з API.
- **Dep.** PR #035 (schema pattern), PR #036 (dual-write
  registration-pattern як референс).

##### **PR #039 — `chore(shared): drop module_data.finyk cloud-sync wiring + ESLint guard`** ✅ DONE — landed [#1711](https://github.com/Skords-01/Sergeant/pull/1711) (2026-05-04)

- Mirror PR #030 (fizruk cloud-sync drop) і PR #034 (nutrition
  cloud-sync drop). Знімає `finyk` з `SYNC_MODULES`
  (`packages/shared/src/sync/modules.ts`), прибирає 19 `FINYK_*`
  ентрі з `eslint-plugin-sergeant-design` tracked sets
  (`TRACKED_STORAGE_KEY_NAMES` + `TRACKED_STORAGE_KEY_VALUES`),
  додає `no-restricted-syntax` guard у `eslint.config.js` з селектором
  `MemberExpression[STORAGE_KEYS.FINYK_(?:HIDDEN|HIDDEN_TXS|BUDGETS|SUBS|ASSETS|DEBTS|RECV|MONTHLY_PLAN|TX_CATS|TX_SPLITS|MONO_DEBT_LINKED|NETWORTH_HISTORY|CUSTOM_CATS|MANUAL_EXPENSES|TX_FILTERS|SHOW_BALANCE|TX_CACHE|TX_CACHE_LAST_GOOD|INFO_CACHE)]`.
  Carve-outs повторюють fizruk-/nutrition-патерн (test files,
  module wrappers, cross-module insights). Server-side
  `DELETE FROM module_data WHERE module='finyk'` — окремий
  runbook ops PR.
- **Deploy gate.** Як і PR #030 / PR #034: розкатувати тільки
  після 100% rollout `feature.finyk.sqlite_v2.{dual_write,read_sqlite,mono_mirror}`
  - server backfill `module_data.finyk` → відповідні `finyk_*` per-user.
- **Dep.** PR #036 (dual-write у проді), PR #037 (read overlay у
  проді), PR #038 (Mono mirror у проді).

---
