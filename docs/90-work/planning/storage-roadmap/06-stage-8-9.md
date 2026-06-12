# Storage & Sync — PR-плани: Stage 8–9 (SQLite cut-over та KV store swap)

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 6–7](./05-stage-6-7.md) · [→ Stage 13](./07-stage-13.md)

### Stage 8 — SQLite cut-over rollout

> **Status:** ✅ COMPLETE (21/21). Stage 7 закрив **boundary** (eslint
> allowlist = [], 6 storage-primitive-ів делегують у `webKVStore`,
> KVStore interface повний). Stage 8 — це **operational rollout**:
> переводимо 8 `feature.{routine,fizruk,nutrition,finyk}.sqlite_v2.*`
> прапорців з `defaultValue: false` (opt-in, experimental) у
> `defaultValue: true` (default-on), потім видаляємо LS-safety-net
> писання і LS-reader-оверлеї у 4 модулях.
>
> **Landed (post-2026-05-06):**
>
> - Dual-write default-on quartet — Routine [#2133](https://github.com/Skords-01/Sergeant/pull/2133)
>   (PR #055r1), Fizruk [#2135](https://github.com/Skords-01/Sergeant/pull/2135)
>   (PR #055f1), Nutrition + Finyk + Finyk Mono mirror
>   [#2178](https://github.com/Skords-01/Sergeant/pull/2178)
>   (PR #055n1 + PR #055k1).
> - PR #058 mobile sync-engine writer-runtime boot path landed у
>   [#2118](https://github.com/Skords-01/Sergeant/pull/2118) alongside
>   CloudSync v1 client cleanup.
> - Stage 8 dual-write telemetry sink
>   ([`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4)) —
>   `apps/web/src/core/observability/dualWriteTelemetry.ts` Sentry
>   sink that powers the `<m>.sqlite.dualwrite.*` decision-gate
>   metrics; consumed by Routine `dualWrite/index.ts` + Finyk `dualWrite/index.ts`.
>
> **Re-rolled out (post-2026-05-08):** read-default-on quartet flipped
> back to `defaultValue: true` per-module after the PWA-canary fix
> landed — Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
> (PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
> (PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251)
> (PR #055n2), Finyk (`24616449`, PR #055k2). Initial slice
> [#2179](https://github.com/Skords-01/Sergeant/pull/2179) had been rolled
> back by [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
> (`2735fa75`) after a PWA habit-input regression — see risk
> register §5 row.
>
> **Routine flag-gating drop:** PR #056r landed with revised scope
> (drop `feature.routine.sqlite_v2.dual_write` flag-gating only, not
> the LS-write callsite — Routine SQLite schema gap; див. footnote)
> у commit
> [`ff852475`](https://github.com/Skords-01/Sergeant/commit/ff852475)
> (`chore(web,mobile): drop Routine dual-write feature-flag gating`).
>
> **Stage 8 §3 parity probe quartet:** ✅ COMPLETE на всіх 4
> dual-write модулях (post-2026-05-08). Кожен probe порівнює
> LS↔SQLite id-sets per-entity-class і пише
> `<m>.sqlite.dualwrite.parity` decision-gate metric — best-effort
> у try/catch після `apply<M>DualWriteOps`, ніколи не throw-ить,
> ніколи не блокує orchestrator return; SELECT failures роутяться
> в `recordReadFallback`, не в `recordParityCheck`.
>
> - Routine ([#2243](https://github.com/Skords-01/Sergeant/pull/2243),
>   `4ea2c952`) —
>   `apps/web/src/modules/routine/lib/dualWrite/parity.ts`.
>   2 entity classes (completions, streaks) — лише ті 2 поля з
>   `RoutineState`, що мають SQLite mirror; інші 6 полів LS-only
>   (схема gap, див. footnote).
> - Fizruk ([#2257](https://github.com/Skords-01/Sergeant/pull/2257),
>   PR #055f3) —
>   `apps/web/src/modules/fizruk/lib/dualWrite/parity.ts`.
>   3 entity classes (workouts, customExercises, measurements);
>   9 нових тестів.
> - Nutrition ([#2259](https://github.com/Skords-01/Sergeant/pull/2259),
>   PR #055n3) —
>   `apps/web/src/modules/nutrition/lib/dualWrite/parity.ts`.
>   4 entity classes (meals, pantries, recipes + prefs
>   presence-only — singleton без id/`deleted_at`); 10 нових
>   тестів.
> - Finyk ([#2260](https://github.com/Skords-01/Sergeant/pull/2260),
>   PR #055k3) —
>   `apps/web/src/modules/finyk/lib/dualWrite/parity.ts`.
>   14 entity classes / 13 SQLite tables (7 per-row blob + 2
>   composite-PK tombstone + 3 per-tx mapping + 1 time-series + 1
>   prefs); `finyk_mono_*` mirrors і `finyk_tx_filters` свідомо
>   excluded (документовано у header `parity.ts`); 12 нових тестів.

> **Чому окрема Stage:** roadmap-у §3 раніше тримав цей блок як
> implicit «Stage 4 follow-up» в out-of-scope-секціях кожного
> per-module PR-а (PR #025/#026 для routine, аналогічно для
> fizruk/nutrition/finyk). Реальність — це 16+ PR-ів на 4 модулі ×
> 4 кроки, плюс mobile sync-engine writer-runtime wiring і shared
> telemetry — окрема Stage з власною таблицею прогресу і decision
> gate-ом точніше відображає шлях.

**Шаблон 4 PR-ів на модуль:**

| Крок | PR title shape                                                  | Що робить                                                                                                                                                                                 | Telemetry / canary gate                                                                              |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | `feat(<m>): default-on feature.<m>.sqlite_v2.dual_write`        | Перемкнути `defaultValue: false → true` у `apps/{web,mobile}/src/core/lib/featureFlags.ts`. LS-write шлях лишається authoritative; SQLite-write — best-effort fire-and-forget.            | `<m>.sqlite.dualwrite.error_rate ≤ 0.1%` за 7 днів. `<m>.sqlite.dualwrite.parity ≥ 99.9%` row-count. |
| 2    | `feat(<m>): default-on feature.<m>.sqlite_v2.read_sqlite`       | Перемкнути read-flag у default-on. Reads ідуть з SQLite з LS-overlay-fallback на miss. LS-write залишається active як safety net.                                                         | `<m>.sqlite.read.fallback` counter = 0 за 14 днів. UI smoke OK.                                      |
| 3    | `chore(<m>): remove LS-write safety net`                        | Видалити `localStorage.setItem` шлях у module storage layer (`<m>Storage.ts` / `<m>Store.ts`). Видалити dual-write helper (`triggerXyzDualWrite`) і feature flag (вже unconditional-on).  | Жодних `LS-write` подій у Sentry breadcrumbs за 14 днів. SQLite write error rate ≤ 0.05%.            |
| 4    | `chore(<m>): drop LS reader paths + tombstone STORAGE_KEYS.<M>` | Видалити `loadXyzState()` LS-overlay reader. Зняти модуль зі `STORAGE_KEYS` (або позначити `@deprecated tombstone`). One-time bootstrap migration читає residual LS → SQLite на 1-й boot. | LS-key counter = 0 у новому install. Existing users — read-residual + delete на boot.                |

**Per-module roadmap:**

#### **Routine (4 PR-и)**

##### **PR #055r1 — `feat(routine): default-on feature.routine.sqlite_v2.dual_write`** ✅ LANDED ([#2133](https://github.com/Skords-01/Sergeant/pull/2133))

- Flip `defaultValue: false → true` у обох
  `apps/{web,mobile}/src/core/lib/featureFlags.ts` (рядки
  `feature.routine.sqlite_v2.dual_write`).
- Landed via `df514265 feat(web): default-on routine dual-write flag`
  on 2026-05-06.
- Telemetry: `routine.sqlite.dualwrite.error_rate` (Sentry tag) +
  parity counter `routine.sqlite.dualwrite.parity` (web side у
  `triggerRoutineDualWrite` finally-block) — wired via
  [`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4)
  `dualWriteTelemetry.ts` sink.
- **Done criteria.** 7 днів proden у default-on без error-spike.
- **Risk.** Quota errors у power users з ~5+ MB SQLite даних.
  Mitigation: catch + tag без mute, dev panel у Settings →
  Експериментальне.
- **Dep.** PR #024 (boot wiring) — landed.

##### **PR #055r2 — `feat(routine): default-on feature.routine.sqlite_v2.read_sqlite`** ✅ LANDED ([#2244](https://github.com/Skords-01/Sergeant/pull/2244))

- Flip read-flag default-on. Reads ідуть з SQLite через
  `apps/{web,mobile}/src/modules/routine/lib/sqliteReader.ts` з
  LS-overlay-fallback на cache miss.
- Telemetry: `routine.sqlite.read.fallback` (counter, must be 0
  steady state).
- **Status.** Initial roll-out shipped у
  [#2179](https://github.com/Skords-01/Sergeant/pull/2179) (Routine +
  Fizruk read default-on, `07f306e1`) and was reverted by
  [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
  (`2735fa75 fix(web): restore pwa habit input stability`) after a
  PWA habit-input regression on installed-PWA Routine users.
  Re-rolled out per-module after the PWA-canary fix landed —
  Routine read-flag flipped back to `defaultValue: true` у
  [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
  (`feat(web,mobile): flip Routine read_sqlite default-on`).
- **Done criteria.** 14 днів без `read.fallback`. UI smoke
  (toggle entry, streak rendering, week view) OK на staging
  **AND** installed-PWA habit-input regression closed (немає
  Sentry events для `routine.pwa.habit_input.*` за 7 днів).
- **Dep.** PR #055r1 (default-on dual_write) — landed; +
  PWA-canary stability gate (додана у risk register
  §5 після #2179 incident; closed by #2244 re-rollout).

##### **PR #056r — `chore(routine): drop dual-write feature-flag gating`** ✅ LANDED (`ff852475`)

> **Re-interpretation note (2026-05-08).** The original Phase 4 plan
> for #056r was "drop LS-write safety net" — i.e. delete the
> `localStorage.setItem(STORAGE_KEYS.ROUTINE, …)` callsite in
> `saveRoutineState`. That literal reading is **not safe** for
> Routine because the SQLite schema (`packages/db-schema/src/sqlite/routine.ts`)
> only covers `routine_entries` (completions + denormalised habit
> name) and `routine_streaks` (server-driven aggregates). Seven of
> the eight fields in `RoutineState` — `habits`, `tags`,
> `categories`, `prefs`, `pushupsByDate`, `habitOrder`,
> `completionNotes` — are **LS/MMKV-only** and would be silently
> lost on every `saveRoutineState` if the LS write were dropped
> today.[^routine-schema-gap]
>
> **Revised scope:** drop only the feature-flag gating layer (the
> `feature.routine.sqlite_v2.dual_write` flag itself plus the
> `isEnabled()` callback on `RoutineDualWriteContext`). LS/MMKV-write
> remains as the **primary** writer for the seven non-completion
> fields (and as a safety mirror for the one field that is in SQLite
> too). The completion-mirror to `routine_entries` becomes
> unconditional whenever a dual-write context is registered. A full
> Routine SQLite cut-over (drop LS-write entirely) is **deferred to
> a future stage** — see Stage 10 candidate footnote below.

- Drop `feature.routine.sqlite_v2.dual_write` from
  `apps/{web,mobile}/src/core/lib/featureFlags.ts` (and from the
  governance registry in `docs/04-governance/governance/feature-flags.md`).
- Drop `isEnabled()` from `RoutineDualWriteContext` interface plus
  the corresponding `if (!ctx.isEnabled()) → "flag-off"` skip-logic
  in `dualWriteRoutineState()`. Remove `"flag-off"` from
  `DualWriteOutcome.reason` union.
- Drop `isFlagEnabled` from `BootRoutineDualWriteInput` and the
  `useFlag(FLAG_ID)` / `getFlag(FLAG_ID)` reads in
  `useRoutineDualWriteBoot`. The hook now boots dual-write
  unconditionally as soon as `userId` is known.
- **Out of scope (revised, was in original):**
  `localStorage.setItem(STORAGE_KEYS.ROUTINE, …)` and
  `triggerRoutineDualWrite()` STAY. Routine LS-write is still the
  source-of-truth for non-completion fields.
- **Done criteria.** Flag entry gone from registries. CI grep gate
  proves no remaining references to
  `feature.routine.sqlite_v2.dual_write` outside roadmap/changelog.
  Existing `dualwrite.routine.*` Sentry tags continue to populate
  with `applied`/`skipped(reason)` buckets identical to pre-merge
  shape (minus `flag-off`).
- **Dep.** PR #055r2 (read default-on; ≥ 14 днів стабільно is no
  longer enforced — dev-stage, no users).

[^routine-schema-gap]:
    ./**Routine SQLite schema gap.** Unlike Fizruk
    / Nutrition / Finyk (which mirror every LS/MMKV key into
    normalised SQLite tables and so can drop LS-write outright per
    PR #056f / #056n / #056k), Routine's PR #022 SPIKE was
    deliberately narrow: only completions and streaks live in
    SQLite. `habits[]`, `tags[]`, `categories[]`, `prefs{}`,
    `pushupsByDate{}`, `habitOrder[]`, `completionNotes{}` are
    **not** part of the SQLite schema, and the dual-write `diff.ts`
    only emits `completion-add` / `completion-remove` /
    `habit-rename` ops. Until the schema gap is closed (see Stage
    10 candidate below), dropping Routine LS-write is silent
    data-loss.

##### **Stage 10 — extend Routine SQLite schema to full LS coverage** ✅ COMPLETE (3/3) — web schema + web dualwrite + mobile mirror

Split into 2 PRs:

- **PR #070r-schema** ✅ LANDED ([#2279](https://github.com/Skords-01/Sergeant/pull/2279)) — 7 new SQLite tables
  (`routine_habits`, `routine_tags`, `routine_categories`,
  `routine_prefs`, `routine_pushups`, `routine_habit_order`,
  `routine_completion_notes`) + Drizzle schemas (SQLite + Pg) +
  sequential client migration `004_routine_full_state.sql` +
  server migration `050_routine_full_state.sql` (+ companion
  `050_routine_full_state.down.sql` and round-trip
  testcontainer harness modelled on 035/039) + snapshot tests +
  SQLite dialect re-exports brought into parity with Pg.
- **PR #070r-dualwrite** ✅ LANDED ([#2281](https://github.com/Skords-01/Sergeant/pull/2281)) — `dualWrite/diff.ts`
  тепер emit-ить ops для habit-create / habit-update / habit-archive /
  habit-delete / habit-restore / tag-create / tag-update /
  tag-delete / category-create / category-update /
  category-delete / pref-set / pushup-add / habit-order-set /
  completion-note-set; `parity.ts` extended до 15 entity classes;
  `sqliteReader.ts` повертає full-state warm cache; `adapter.ts`
  apply-paths покривають усі 7 нових таблиць.
- З обома PR-ами landed Routine dual-write тепер emit-ить ops для
  full LS state — 7 нових SQLite-таблиць populated в production,
  parity probe extended до 15 entity classes. Routine LS-write
  removal (`#057r-tombstone`) тепер unblocked (14d canary gating
  per Stage 8 #056\* policy).

##### **Stage 10 mobile mirror — Routine MMKV → SQLite full-state dual-write** ✅ COMPLETE (1/1)

> **Why this is its own follow-up:** Stage 10 (PR #070r-schema [#2279] +
> PR #070r-dualwrite [#2281]) covered web only — `apps/web/src/modules/routine`
> dual-write `diff.ts` тепер emit-ить ops для всіх 7 нових Routine таблиць,
> mobile же залишався на старому completion-only dual-write з PR #022 SPIKE.
> Mobile аналог landed у [#2286](https://github.com/Skords-01/Sergeant/pull/2286)
> (PR #070r-mobile-dualwrite). Mobile MMKV-write для Routine залишається
> active — drop через `#057r-tombstone-mobile` (Stage 8 follow-up) тепер
> unblocked, чекає bake-in `routine.sqlite.dualwrite.parity` decision-gate
> metric з #2286 у проді.

**Scope (3 PRs, mirror of web Stage 10 + #057r):**

- **PR #070r-mobile-dualwrite** ✅ LANDED ([#2286](https://github.com/Skords-01/Sergeant/pull/2286)) — extended
  `apps/mobile/src/modules/routine/lib/dualWrite/diff.ts` щоб emit-ити ops
  для habit-create/update/archive/delete/restore + tag-create/update/delete +
  category-create/update/delete + pref-set + pushup-add + habit-order-set +
  completion-note-set; mobile `parity.ts` додано (best-effort LS↔SQLite
  id-set / blob comparison для 7 entity classes); mobile `sqliteReader.ts`
  hydrate з усіх 7 нових таблиць; mobile `adapter.ts` apply-paths покривають
  усі 7 нових таблиць з LWW guard; mobile `dualWriteTelemetry.ts` (новий —
  mirror web `apps/web/src/core/observability/dualWriteTelemetry.ts`,
  `recordDualWriteOutcome` / `recordReadFallback` / `recordParityCheck` —
  breadcrumbs land via `addSentryBreadcrumb`, tag-сторона no-op до моменту
  коли mobile отримає `setSentryTag`). Web Drizzle schemas (SQLite + Pg) +
  serial migrations (`004_routine_full_state.sql` / `050_routine_full_state.sql`)
  уже landed у [#2279] — на mobile додалися тільки клієнтський диф/apply/parity/reader/telemetry.
- **PR #057r-tombstone-mobile** ✅ LANDED в [#2288] — drop MMKV writes у
  `apps/mobile/src/modules/routine/lib/routineStore.ts` (mirror
  web write-through cache pattern: `setCachedSqliteRoutineState()` +
  `setCachedSqliteCompletions()` → `triggerRoutineDualWrite()`); add
  `residualImport.ts` (MMKV → SQLite drain on boot з stale LWW timestamp,
  ідентичний pattern у Finyk `#057k-tombstone` mobile residual-import);
  wire у mobile boot path; `STORAGE_KEYS.ROUTINE` allowlist розширив
  на mobile `residualImport.ts`.
- **PR #057r-mobile-chat-actions** ❌ N/A — мобільна версія ще **не відвантажує**
  HubChat (тільки web; див. `apps/mobile/src/core/AssistantCataloguePage.tsx`,
  де UI буквально пише: «HubChat — наразі веб-версія»). Немає жодного
  mobile chat handler-а, який би писав Routine state напряму через MMKV.
  Web `apps/web/src/core/lib/chatActions/routineActions.ts` — залишається
  єдиним споживачем цього api ї вже переведений на
  `loadRoutineState()` / `saveRoutineState()` у [#2284]. PR реактивується
  автоматично, якщо/коли mobile HubChat handler tree буде додано до
  tombstone-у іншого модуля — або як окремий PR в рамках mobile-chat
  ініціативи. До того моменту — немає callsites, немає роботи.

**Done criteria.**

- Mobile `eslint-plugin-sergeant-design` tracked-keys-list зменшується
  на 1 entry для `STORAGE_KEYS.ROUTINE`.
- Mobile `dualWrite/parity.ts` повертає 15 entity classes (як на web).
- Mobile boot residual-import drain-ить leftover MMKV payload без
  data loss; ідемпотентний.
- `<m>.sqlite.dualwrite.parity` Sentry tag працює на mobile-стороні
  для всіх 7 нових Routine таблиць.

**Dep.** Web Stage 10 ✅ DONE — server migration `050_routine_full_state.sql`

- Drizzle schemas (Pg + SQLite) landed у [#2279]. Mobile-сторона потребує
  тільки клієнтське розширення (диф/apply/parity/reader) + tombstone PR.

**Calendar (early-stage dev, без canary):** ~2 тижні coding на 1 FTE
(mirror веб-патерну з [#2281] + Finyk MMKV residual-import з [#2277]).

[#2279]: https://github.com/Skords-01/Sergeant/pull/2279
[#2281]: https://github.com/Skords-01/Sergeant/pull/2281
[#2277]: https://github.com/Skords-01/Sergeant/pull/2277
[#2284]: https://github.com/Skords-01/Sergeant/pull/2284
[#2286]: https://github.com/Skords-01/Sergeant/pull/2286
[#2288]: https://github.com/Skords-01/Sergeant/pull/2288

##### **Stage 11 — extend Nutrition SQLite schema to full LS coverage** ✅ COMPLETE (4/4)

> **Why this is its own stage:** після Stage 10 mobile mirror landing
> ([#2286]) на Nutrition залишався той самий schema-gap, що був на
> Routine до Stage 10 — `nutritionStore.ts` water log + shopping list
> писали напряму через `safeWriteLS` без dual-write на обох платформах.
> Поточний Nutrition dual-write covers тепер 6 entity classes
> (meals / pantry / prefs / recipes / water-log / shopping-list) на
> web + mobile після [#2291] + [#2292]. Після `#057n-tombstone-mobile`
> mobile MMKV-write для water-log + shopping-list дропнуто — SQLite
> єдине джерело істини; boot-time residual-import
> (`residualImport.ts`) дренить leftover MMKV пейлоад у SQLite
> зі stale LWW timestamp (epoch zero) і видаляє MMKV-ключі після
> успіху; ідемпотентно на наступних бутах.
> Web `#057n-tombstone` ([#2274]) не зачепив water-log + shopping-list —
> на web вони залишаються LS-primary з dual-write mirror
> (окремий follow-up).

**Scope (4 PRs, mirror of Stage 10 pattern):**

- **PR #070n-schema** ✅ LANDED ([#2290](https://github.com/Skords-01/Sergeant/pull/2290))
  — 2 нові SQLite/Pg таблиці (`nutrition_water_log`,
  `nutrition_shopping_list`) + Drizzle schemas (SQLite + Pg) +
  sequential client migration `002_nutrition_full_state.sql`
  (per-module ledger numbering — Nutrition starts at
  `001_nutrition_tables.sql`, не глобальне `005_*`).
  - server migration `051_nutrition_full_state.sql` (+ companion
    `051_nutrition_full_state.down.sql` + 051 round-trip testcontainer
    harness modelled on 050).
- **PR #070n-dualwrite** ✅ LANDED ([#2291](https://github.com/Skords-01/Sergeant/pull/2291))
  — extended `apps/web/src/modules/nutrition/lib/dualWrite/diff.ts` щоб
  emit-ити ops для water-log-set + shopping-list-set (per-dateKey row
  для water-log; singleton blob `data_json` для shopping-list); web
  `parity.ts` extended до 6 entity classes; `sqliteReader.ts` повертає
  full-state warm cache для water log + shopping list; web `adapter.ts`
  apply-paths покривають 2 нові таблиці з LWW guard
  (`WHERE excluded.updated_at > current.updated_at`).
- **PR #070n-mobile-dualwrite** ✅ LANDED ([#2292](https://github.com/Skords-01/Sergeant/pull/2292))
  — mobile mirror Stage 11 на
  `apps/mobile/src/modules/nutrition/lib/dualWrite/{diff,adapter}.ts` +
  `sqliteReader.ts` warm cache + `dualWriteState.ts`
  `persistNutritionWaterLog` / `persistNutritionShoppingList` helpers
  (як для Routine у [#2286]). `nutritionStore.ts` `saveWaterLog` +
  `saveShoppingList` тригерять dual-write після MMKV write;
  `residualImport.ts` `EMPTY_STATE` поповнено двома slices.
- **PR #057n-tombstone-mobile** ✅ LANDED — drop MMKV writes для water log +
  shopping list у `nutritionStore.ts` (`saveWaterLog` / `saveShoppingList`
  більше не викликають `safeWriteLS` — тільки dual-write через
  `triggerNutritionDualWrite`); read paths (`loadWaterLog` /
  `loadShoppingList`) промовані на SQLite warm cache (як
  `loadNutritionLog`); residual-import (`residualImport.ts`) розширено
  на `WATER_LOG_KEY` + `SHOPPING_LIST_KEY` (drain на boot з stale LWW
  timestamp і MMKV-cleanup, ідентичний pattern Routine
  `residualImport.ts`); `dualWriteState.ts` `persistNutritionWaterLog` /
  `persistNutritionShoppingList` helpers видалені (вже не потрібні — logic
  інлайнена в `nutritionStore.ts` рівно як `saveNutritionLog`).
  - **Gap (Stage 13).** `STORAGE_KEYS.NUTRITION_SAVED_RECIPES` MMKV
    write у `apps/mobile/src/modules/nutrition/lib/recipeBookStore.ts`
    лишається — recipes пропустили у цьому tombstone-у. PR #073
    закриває цей залишок (mirror water-log + shopping-list pattern):
    drop `safeWriteLS(NUTRITION_SAVED_RECIPES, ...)`, extend
    `residualImport.ts` recipes drain (зараз hardcoded `recipes: []`).
    Див. § Stage 13.

**Done criteria.**

- `nutrition_water_log` + `nutrition_shopping_list` populated в production
  (web + mobile).
- `nutrition.sqlite.dualwrite.parity` decision-gate metric covers всі 6
  Nutrition entity classes (meals/pantry/prefs/recipes/waterLog/shoppingList)
  на обох платформах.
- `eslint-plugin-sergeant-design` tracked-keys-list зменшується на
  `STORAGE_KEYS.NUTRITION_WATER_LOG` + `STORAGE_KEYS.NUTRITION_SHOPPING_LIST`
  (web + mobile).
- Mobile boot residual-import drain-ить leftover MMKV payload без data loss;
  ідемпотентний.

**Dep.** Stage 10 ✅ DONE — pattern established (web schema → web dualwrite →
mobile dualwrite → tombstone). Stage 11 — повторюваний application цього
паттерну на менший scope (2 entity classes vs 7 у Routine).

**Calendar (early-stage dev, без canary):** ~3 тижні coding на 1 FTE
(найменший із tail-stage-ів через лише 2 нові таблиці).

[#2274]: https://github.com/Skords-01/Sergeant/pull/2274

##### **Stage 12 — extend Fizruk SQLite schema to full LS coverage** ✅ LANDED (4/4) for daily-log / monthly-plan / workout-templates

> **Why this is its own stage:** найбільший залишковий schema gap у tail.
> Поточний Fizruk dual-write covers лише workouts / custom-exercises /
> measurements (3 entity classes), але 7 hooks досі пишуть напряму через
> `safeWriteLS` без dual-write на обох платформах:
>
> - `useDailyLog.ts` (web + mobile) — daily log entries
> - `useMonthlyPlan.ts` (web + mobile) — monthly plan
> - `usePlanTemplate.ts` (mobile) — plan templates
> - `usePrograms.ts` (mobile) — training programs
> - `useWellbeing.ts` (mobile) — wellbeing log
> - `useWorkoutTemplates.ts` (web + mobile) — workout templates
> - `useActiveFizrukWorkout.ts` (mobile) — active workout id
>
> Web `#057f-tombstone` ([#2275]) не зачепив ці 7 entity classes (тому й
> drift-fix у [#2275] note-нув що `triggerFizrukDualWrite` був задекларований
> у PR #028 але не викликався з callsite-ів цих hooks). Поки гап відкритий,
> mobile аналог `#057f-tombstone-mobile` блокується.

**Scope (4 PRs, mirror of Stage 10 pattern):**

- **PR #070f-schema** ✅ LANDED — 6 нових SQLite/Pg таблиць
  (`fizruk_daily_log`, `fizruk_monthly_plan`, `fizruk_plan_templates`,
  `fizruk_programs`, `fizruk_wellbeing`, `fizruk_workout_templates`) +
  Drizzle schemas (`packages/db-schema/src/{sqlite,pg}/fizruk.ts`) +
  sequential client migration `002_fizruk_full_state.sql` (bundled
  inline in `packages/db-schema/src/sqlite/migrations/index.ts`,
  appended to `FIZRUK_CLIENT_MIGRATIONS`) + server migration
  `apps/server/src/migrations/052_fizruk_full_state.sql` (+ companion
  `.down.sql` + `__tests__/052-fizruk-full-state.test.ts` round-trip
  testcontainer harness covering forward/down/idempotency/re-up
  fingerprint). Snapshot tests `sqlite-fizruk-snapshot.test.ts` +
  `pg-fizruk-snapshot.test.ts` extended з ~95 нових assertions для
  кожної з 6 нових таблиць (column ordering, types, nullability,
  defaults, indexes, composite PK для `fizruk_wellbeing`). The
  seventh hook — `useActiveFizrukWorkout` — riding on the existing
  Stage 9 `kv_store` table (single string slot) without its own
  Fizruk-module table.
- **PR #070f-dualwrite** ✅ LANDED ([`a89ba326`](https://github.com/Skords-01/Sergeant/commit/a89ba326)) — extend
  `apps/web/src/modules/fizruk/lib/dualWrite/diff.ts` щоб emit-ити ops для
  daily-log-upsert / daily-log-delete / monthly-plan-set /
  workout-template-upsert / workout-template-delete; web `adapter.ts`
  apply-paths + LWW guards; `parity.ts` extended; `sqliteReader.ts`
  full-state warm cache. Скоуп охоплює лише 3 спільні web+mobile
  entity classes (daily-log / monthly-plan / workout-templates) — інші
  4 hooks (programs / plan-template / wellbeing / active-workout) є
  mobile-only й покриваються Stage 12.5.
- **PR #070f-mobile-dualwrite** ✅ LANDED — mirror web Stage 12 на
  `apps/mobile/src/modules/fizruk/lib/dualWrite/{diff,adapter,parity}.ts`
  - mobile `sqliteReader.ts` warm cache extended до 6 entity classes;
    `fizrukDualWriteState.ts` extractors для `dailyLog` / `monthlyPlan` /
    `workoutTemplates`; `dualWrite/index.ts` orchestrator wired до
    shared dual-write telemetry sink (`recordDualWriteOutcome`,
    `recordParityCheck`, `recordReadFallback`); `useDailyLog` /
    `useMonthlyPlan` / `useWorkoutTemplates` hook callbacks тригерять
    `triggerFizrukDualWrite` після кожного MMKV write. Test rig:
    `apps/mobile/src/modules/fizruk/lib/dualWrite/__tests__/{diff,adapter,parity,integration}.test.ts`
    (Jest + `better-sqlite3`, mirror Stage 10 routine pattern).
- **PR #057f-tombstone-mobile-stage12** ✅ LANDED — drop MMKV writes
  у 3 hooks (`useDailyLog`, `useMonthlyPlan`, `useWorkoutTemplates`)
  shipped у `#070f-mobile-dualwrite`. Hooks тепер читають з
  `getCachedFizrukSqliteState()` (cold-cache safe) + subscribe до
  `useFizrukSqliteReadTick`; persist веде через `triggerFizrukDualWrite`
  only (no `safeWriteLS`). `apps/mobile/.../residualImport.ts`
  розширений з 3 → 6 entity classes (драйнить `FIZRUK_DAILY_LOG` /
  `MONTHLY_PLAN_STORAGE_KEY` / `FIZRUK_TEMPLATES` на boot з
  epoch-zero `clientTs`, LWW guard завжди дає SQLite перемогти).
  `STORAGE_KEYS.FIZRUK_DAILY_LOG`, `STORAGE_KEYS.FIZRUK_TEMPLATES`,
  `MONTHLY_PLAN_STORAGE_KEY` помічені `@deprecated`. `PlanCalendar.tsx`
  переключений з direct-MMKV `readTemplates()` на `useWorkoutTemplates`
  hook (cache overlay). Tests: 3 hook overlay suites
  (`useDailyLog.sqliteOverlay.test.tsx` + `useMonthlyPlan…` +
  `useWorkoutTemplates…`) + 6 нових кейсів у
  `lib/__tests__/residualImport.test.ts` — всі mobile fizruk suites
  зелені (157/157). Залишкові 4 hooks (`usePlanTemplate`, `usePrograms`,
  `useWellbeing`, `useActiveFizrukWorkout`) ще не виведені з MMKV
  (потребують окремого `#070f-mobile-dualwrite` extension).

**Stage 12.5 — extend mobile dual-write до залишкових hooks (3+1):**

- **PR #070f2-mobile-dualwrite** ✅ LANDED ([#2313](https://github.com/Skords-01/Sergeant/pull/2313), `31817bab`) — розширити
  `apps/mobile/src/modules/fizruk/lib/dualWrite/{diff,adapter,parity}.ts`
  - `sqliteReader.ts` + `fizrukDualWriteState.ts` extractors на 3
    залишкові entity classes з виділеними SQLite таблицями:
    `programs` (singleton, `fizruk_programs`), `plan-template`
    (singleton JSON-blob, `fizruk_plan_templates`), `wellbeing`
    (composite-PK array per `(user_id, date_key)`, `fizruk_wellbeing`).
    Wire `triggerFizrukDualWrite` у `usePrograms` / `usePlanTemplate` /
    `useWellbeing` (зберігаємо `safeWriteLS` для майбутнього
    `#057f2-tombstone` PR). 4 нові ops (`programs-set`,
    `plan-template-set`, `wellbeing-upsert`, `wellbeing-delete`) +
    LWW guard на upsert (composite-PK для wellbeing).
    Schemas вже існують з `#070f-schema` (Stage 12) — нових міграцій
    не потрібно. Tests: extend `diff.test.ts` (+18 cases),
    `adapter.test.ts` (+11), `parity.test.ts` (+6), `integration.test.ts`
    (+1) — всі mobile fizruk suites зелені (192/192).
- **PR #057f2-tombstone-mobile-stage12-5** ✅ LANDED ([#2315](https://github.com/Skords-01/Sergeant/pull/2315), `ec5653f2`) — drop MMKV
  writes у 3 hooks shipped у `#070f2` (`usePrograms`, `usePlanTemplate`,
  `useWellbeing`). Hooks тепер читають з `getCachedFizrukSqliteState()`
  (cold-cache safe) + subscribe до `useFizrukSqliteReadTick`; persist веде
  через `triggerFizrukDualWrite` only (no `safeWriteLS`).
  `residualImport.ts` extended з 6 → 9 entity classes (драйнить
  `FIZRUK_ACTIVE_PROGRAM` / `FIZRUK_PLAN_TEMPLATE` / `FIZRUK_WELLBEING`
  на boot з epoch-zero `clientTs`, LWW guard завжди дає SQLite перемогти).
  `PlanCalendar.tsx` переключений з direct-MMKV `safeReadLS(FIZRUK_WELLBEING)`
  на `useWellbeing()` hook (cache overlay). `STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM`,
  `STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE`, `STORAGE_KEYS.FIZRUK_WELLBEING`
  помічені `@deprecated`. Tests: 3 hook overlay suites
  (`usePrograms.sqliteOverlay.test.tsx` + `usePlanTemplate…` + `useWellbeing…`)
  - 5 нових кейсів у `lib/__tests__/residualImport.test.ts`.
- **PR #070f3-active-workout-dualwrite** 📋 PROPOSED — окремий
  follow-up для `useActiveFizrukWorkout` (single string id у
  Stage 9 `kv_store`, інший pipeline ніж 9 виділених таблиць).
  Smaller PR (kv_store-shape adapter + extractor).

**Done criteria.**

- ~5–6 нових Fizruk таблиць populated в production (web + mobile).
- `fizruk.sqlite.dualwrite.parity` decision-gate metric covers всі ~10
  Fizruk entity classes на обох платформах.
- `eslint-plugin-sergeant-design` tracked-keys-list зменшується на 7 entries.
- Mobile boot residual-import drain-ить leftover MMKV payload без data loss.

**Dep.** Stage 11 — не блокер, але краще пройти Stage 11 спочатку (менший
ризик, той самий паттерн, нижчий schema-gap surface). Stage 10 + Stage 11
формують прецедент для Stage 12.

**Calendar (early-stage dev, без canary):** ~5 тижнів coding на 1 FTE
(найбільший із tail-stage-ів через ~6 нових таблиць + 7 hooks).

[#2275]: https://github.com/Skords-01/Sergeant/pull/2275

##### **PR #057r — `chore(routine): drop LS reader paths + tombstone STORAGE_KEYS.ROUTINE`** ✅LANDED

- **PR #057r-flag** ✅LANDED — drop the now-redundant
  `feature.routine.sqlite_v2.read_sqlite` flag-check from web +
  mobile (registry entry, boot wiring, `loadRoutineState` overlay
  gate). SQLite completions overlay тепер unconditional once boot
  has populated `getCachedSqliteCompletions().refreshedAt`; LS/MMKV
  first-paint read залишається synchronous fallback. Pre-step для
  `#057r-tombstone`.
- **PR #057r-tombstone** ✅LANDED (web) — early-stage dev shipped без
  canary вікон і decision-gate per @Skords-01 § "ми ще в розробці".
  - `routineStorage.ts` LS-write drop: `saveRoutineState()` тепер
    write-through-кешує SQLite warm cache (`setCachedSqliteRoutineState`
    - `setCachedSqliteCompletions`) і фірить `triggerRoutineDualWrite`,
      без жодного `localStorage.setItem`. Дзеркалить Fizruk
      `useWorkouts()` write-through pattern.
  - `residualImport.ts` (web): one-shot LS → SQLite drain on boot з
    stale LWW timestamp + видалення LS-ключа. Wired у
    `sqliteReadBoot.ts`.
  - `routineStorageInstance.ts` (web): shared module-level instance,
    щоб `routineStorage` і `residualImport` ходили через ту саму
    serialization layer.
  - `chatActions/routineActions.ts` мігровано з `ls()`/`lsSet()` на
    `loadRoutineState()`/`saveRoutineState()` для всіх 10 хендлерів
    (mark_habit_done, create_habit, create_reminder,
    complete_habit_for_date, archive_habit, edit_habit,
    set_habit_schedule, pause_habit, reorder_habits, habit_stats,
    habit_trend) + undo paths. Test fixtures у
    `hubChatActions{,Extended}.test.ts` + `routineActions.test.ts`
    seeding через cache.
  - `STORAGE_KEYS.ROUTINE` `@deprecated`. `eslint.config.js` allowlist
    розширений на `residualImport.ts` + `routineStorageInstance.ts` —
    решта repo заборонена від прямого доступу.
- **Mobile MMKV drop — окремий follow-up.** Mobile dual-write поки
  completion-only (Stage 10 mobile mirror — окремий тікет). Дроп MMKV
  без full-state mirror = data loss для habits/tags/categories/prefs/
  pushupsByDate/habitOrder/completionNotes. Тримаємо як next-step.
- **Done criteria.** `eslint-plugin-sergeant-design`
  tracked-keys-list зменшується на 1 entry для web. CI grep gate
  проти `STORAGE_KEYS.ROUTINE` reads-у поза `residualImport.ts` +
  `routineStorageInstance.ts`.

#### **Fizruk (4 PR-и)** — структура ідентична

- **PR #055f1** ✅ LANDED ([#2135](https://github.com/Skords-01/Sergeant/pull/2135),
  `e86f42b3 feat(web): default-on fizruk dual-write flag` +
  `39b71008 docs(docs): link fizruk rollout pr`) — default-on
  `feature.fizruk.sqlite_v2.dual_write`.
- **PR #055f2** ✅ LANDED ([#2247](https://github.com/Skords-01/Sergeant/pull/2247)) — default-on
  `feature.fizruk.sqlite_v2.read_sqlite`. Initial roll-out у
  [#2179](https://github.com/Skords-01/Sergeant/pull/2179) (Routine +
  Fizruk read default-on, `07f306e1`); reverted by
  [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
  (`2735fa75`); re-rolled out у
  [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
  (`feat(web,mobile): flip Fizruk read_sqlite default-on`) після
  PWA-canary stability re-verify.
- **PR #055f3** ✅ LANDED ([#2257](https://github.com/Skords-01/Sergeant/pull/2257)) —
  Stage 8 §3 parity probe wired у Fizruk dual-write
  (`apps/web/src/modules/fizruk/lib/dualWrite/parity.ts`).
  3 entity classes (workouts, customExercises, measurements);
  9 нових тестів; best-effort у try/catch після
  `applyFizrukDualWriteOps` — ніколи не throw-ить, ніколи не
  блокує orchestrator return.
- **PR #056f** ✅ LANDED (`abc575f0`) — з revised scope (mirror Routine
  PR #056r): drop `feature.fizruk.sqlite_v2.dual_write` feature-flag
  gating only — SQLite mirror фірить unconditionally whenever a
  dual-write context is registered. LS/MMKV-write залишається
  source-of-truth для workouts / custom_exercises / measurements
  до PR #057f. Cleanup: drop `isEnabled()` з `FizrukDualWriteContext`,
  `"flag-off"` з `DualWriteOutcome.reason` union, `isFlagEnabled` з
  `BootFizrukDualWriteInput`, `useFlag(FLAG_ID)` з
  `useFizrukDualWriteBoot` (web + mobile parity). LS-write removal
  (drop `localStorage.setItem` callsites у `fizrukStorage.ts`)
  виноситься у future PR (разом з #057f LS-reader drop або
  окремим кроком).
- **PR #057f** — drop LS readers + tombstone `STORAGE_KEYS.FIZRUK_*`.
  - **PR #057f-flag** ✅ LANDED — drop the now-redundant
    `feature.fizruk.sqlite_v2.read_sqlite` flag-check from web +
    mobile (registry entry, hooks, boot, reader gate). SQLite
    read-overlay тепер unconditional once boot completes; LS/MMKV
    first-paint read залишається synchronous fallback. Pre-step для
    `#057f-tombstone` (LS-reader drop + `STORAGE_KEYS.FIZRUK_*`
    tombstone + residual-import bootstrap).
  - **PR #057f-tombstone** ✅ LANDED ([#2275](https://github.com/Skords-01/Sergeant/pull/2275)) —
    full LS-write + LS-read drop for Fizruk (web + mobile).
    `useWorkouts`, `useExerciseCatalog` /`useCustomExercises`,
    `useMeasurements` тепер ініціалізуються з SQLite warm cache
    (`getCachedFizrukSqliteState`) і персистять exclusively через
    `triggerFizrukDualWrite` без жодного `localStorage.setItem`
    / MMKV `safeWriteLS`. Boot додає `importFizrukResidualFromLocalStorage`
    (web) / `importFizrukResidualFromMmkv` (mobile) wired у
    `bootFizrukSqliteReadPath` (idempotent LS→SQLite migration зі
    stale `clientTs` (epoch zero) so existing rows always win;
    delete LS / MMKV keys after successful apply).
    `STORAGE_KEYS.FIZRUK_{WORKOUTS,CUSTOM_EXERCISES,MEASUREMENTS}`
    помічені `@deprecated` (entries kept так як є cross-module
    reads у tombstoned reader paths під час residual-import).
    Mobile extractors отримали `ExtractableWorkoutLike` /
    `ExtractableMeasurementLike` structural types щоб hook-и могли
    викликати їх без `as unknown as` double-cast (`sergeant-design/no-strict-bypass` clean).
    **Drift-fix:** dual-write trigger був declared (PR #028) but
    ніколи не invoked from LS-write callsites через відсутність
    LS-write rewriting у попередніх PR-ах — це означало, що SQLite
    mirror для Fizruk весь час був порожній і parity probe з #055f3
    фактично ніколи не виконувалась. Цей PR закрив drift одночасно
    з tombstone scope. Pre-existing test failure
    (`NotificationsSection.test.tsx › persists nutrition reminder
toggle and hour into nutrition prefs`) — знайдений у CI on this
    PR but pre-existed on `main` from #057n-tombstone; not blocking,
    follow-up Nutrition test PR required.

#### **Nutrition (4 PR-и)** — структура ідентична

- **PR #055n1** ✅ LANDED ([#2178](https://github.com/Skords-01/Sergeant/pull/2178),
  `b33cf6a4 feat(shared): advance storage rollout`) — default-on
  `feature.nutrition.sqlite_v2.dual_write` (web + mobile defaults on).
- **PR #055n2** ✅ LANDED ([#2251](https://github.com/Skords-01/Sergeant/pull/2251)) —
  default-on `feature.nutrition.sqlite_v2.read_sqlite`
  (`feat(web,mobile): flip Nutrition read_sqlite default-on`).
  Re-rolled out квартет після PWA-canary stability re-verify
  (Nutrition read-flag не залендив у первинному #2179, тож тут
  це primary roll-out, не re-rollout).
- **PR #055n3** ✅ LANDED ([#2259](https://github.com/Skords-01/Sergeant/pull/2259)) —
  Stage 8 §3 parity probe wired у Nutrition dual-write
  (`apps/web/src/modules/nutrition/lib/dualWrite/parity.ts`).
  4 entity classes (meals, pantries, recipes + prefs
  presence-only — singleton без id/`deleted_at`); 10 нових тестів;
  best-effort у try/catch після `applyNutritionDualWriteOps`.
- **PR #056n** ✅ LANDED ([#2266](https://github.com/Skords-01/Sergeant/pull/2266),
  `65fe17fe`) — з revised scope (mirror Routine PR #056r): drop
  `feature.nutrition.sqlite_v2.dual_write` feature-flag gating only —
  SQLite mirror фірить unconditionally whenever a dual-write
  context is registered. LS/MMKV-write залишається source-of-truth
  для meals / pantries / prefs / recipes до PR #057n. Cleanup: drop
  `isEnabled()` з `NutritionDualWriteContext`, `"flag-off"` з
  `DualWriteOutcome.reason` union, `isFlagEnabled` з
  `BootNutritionDualWriteInput`, `useFlag(FLAG_ID)` з
  `useNutritionDualWriteBoot` (web + mobile parity). LS-write removal
  (drop `localStorage.setItem` callsites у `nutritionStorage.ts`)
  виноситься у future PR (разом з #057n LS-reader drop або
  окремим кроком).
- **PR #057n** — drop LS readers + tombstone `STORAGE_KEYS.
NUTRITION_*`. Зняти стару migration `storageManager #002`
  (legacy single pantry → multi pantry), бо residual-import
  bootstrap покриє цей переїзд.
  - **PR #057n-flag** ✅ LANDED ([#2269](https://github.com/Skords-01/Sergeant/pull/2269)) —
    drop the now-redundant
    `feature.nutrition.sqlite_v2.read_sqlite` flag-check from
    web + mobile (registry entry, hooks, boot, reader gate).
    SQLite read-overlay тепер unconditional once boot completes;
    LS first-paint read залишається synchronous fallback. Pre-step
    для `#057n-tombstone` (LS-reader drop + `STORAGE_KEYS`
    tombstone + residual-import bootstrap).
  - **PR #057n-tombstone** ✅ LANDED — full LS-write + LS-read
    drop for Nutrition (web + mobile). `nutritionStorage.ts` /
    `nutritionStore.ts` `load*` тепер хитают the SQLite warm
    cache (`getCachedNutritionSqliteState`); `persist*` /
    `save*` фірять диф через `triggerNutritionDualWrite` без
    жодного `localStorage.setItem` / MMKV `safeWriteLS`. Boot
    додає `importNutritionResidualFromMmkv` /
    `importNutritionResidualFromLocalStorage` (idempotent
    LS→SQLite migration з stale LWW timestamp і delete LS keys
    after successful apply). Hooks втратили MMKV /
    `storage` listeners — cache-tick-bump після dual-write
    apply тепер єдиний "value changed" сигнал.
    `STORAGE_KEYS.{NUTRITION_LOG, NUTRITION_PANTRIES,
NUTRITION_ACTIVE_PANTRY, NUTRITION_PREFS}` помічені
    `@deprecated` (entries kept так як є cross-module reads
    у tombstoned reader paths під час residual-import).

#### **Finyk (4 PR-и)** — структура ідентична

- **PR #055k1** ✅ LANDED ([#2178](https://github.com/Skords-01/Sergeant/pull/2178),
  `b33cf6a4 feat(shared): advance storage rollout`) — default-on
  `feature.finyk.sqlite_v2.dual_write` + `feature.finyk.sqlite_v2.mono_mirror`
  (web + mobile defaults on). Mono-mirror table set
  (`finyk_mono_transactions`, `finyk_mono_accounts`,
  `finyk_mono_account_snapshots`) populated по `mono_time` LWW;
  consumed by `apps/web/src/modules/finyk/lib/monoMirror.ts` +
  `apps/web/src/modules/finyk/lib/dualWrite/index.ts`.
- **PR #055k2** ✅ LANDED (`24616449`) — default-on
  `feature.finyk.sqlite_v2.read_sqlite`
  (`feat(web,mobile): flip Finyk read_sqlite default-on`,
  commit-only PR landed inline with the read-default-on
  re-rollout квартета). PWA-canary stability re-verify closed.
- **PR #055k3** ✅ LANDED ([#2260](https://github.com/Skords-01/Sergeant/pull/2260)) —
  Stage 8 §3 parity probe wired у Finyk dual-write
  (`apps/web/src/modules/finyk/lib/dualWrite/parity.ts`).
  14 entity classes / 13 SQLite tables (7 per-row blob + 2
  composite-PK tombstone + 3 per-tx mapping + 1 time-series + 1
  prefs); `finyk_mono_*` mirrors і `finyk_tx_filters` свідомо
  excluded (документовано у header `parity.ts`); 12 нових тестів;
  best-effort у try/catch після `applyFinykDualWriteOps`.
- **PR #056k** ✅ LANDED ([#2265](https://github.com/Skords-01/Sergeant/pull/2265),
  `535a9984`) — з revised scope (mirror Routine PR #056r): drop
  `feature.finyk.sqlite_v2.dual_write` feature-flag gating only —
  SQLite mirror фірить unconditionally whenever a dual-write
  context is registered. LS/MMKV-write залишається safety net
  для 14 finyk\_\* keys (`finyk_hidden_accounts`,
  `finyk_hidden_transactions`, `finyk_budgets`, `finyk_subscriptions`,
  `finyk_assets`, `finyk_debts`, `finyk_receivables`,
  `finyk_custom_categories`, `finyk_manual_expenses`,
  `finyk_tx_categories`, `finyk_tx_splits`, `finyk_mono_debt_links`,
  `finyk_networth_history`, `finyk_prefs`) + 3 mono cache LS-keys
  (`finyk_tx_cache`, `finyk_info_cache`, `finyk_tx_cache_last_good`)
  до PR #057k. Cleanup: drop `isEnabled()` з `FinykDualWriteContext`,
  `"flag-off"` з `DualWriteOutcome.reason` union, `isFlagEnabled` з
  `BootFinykDualWriteInput`, `useFlag(FLAG_ID)` з
  `useFinykDualWriteBoot` (web + mobile parity). LS-write removal
  (drop `localStorage.setItem` callsites у `finykStorage.ts`)
  виноситься у future PR (разом з #057k LS-reader drop або
  окремим кроком).
- **PR #057k** — drop LS readers + tombstone `STORAGE_KEYS.FINYK_*`.
  - **PR #057k-flag** ✅ LANDED — drop the now-redundant
    `feature.finyk.sqlite_v2.read_sqlite` flag-check from web +
    mobile (registry entry, store hooks, boot, reader gate).
    SQLite read-overlay тепер unconditional once boot completes;
    LS/MMKV first-paint read залишається synchronous fallback.
    Pre-step для `#057k-tombstone` (LS-reader drop + `STORAGE_KEYS`
    tombstone + residual-import bootstrap).
  - **PR #057k-tombstone** ✅ LANDED — full LS-write + LS-read drop
    for Finyk (web + mobile). Web: 14 `usePersist` → `useReadonlyPersist`
    in `useFinykStorageSlots`; `residualImport.ts` created (boot-time
    drain LS → SQLite, stale-ts LWW-safe, idempotent); `finykBackup.ts`
    reads from SQLite warm cache (LS fallback). Mobile:
    `residualImport.ts` created (MMKV → SQLite drain); `budgetsStore`,
    `assetsStore`, `transactionsStore` — MMKV `safeWriteLS` removed,
    mutations flow solely through dual-write pipeline; MMKV listener
    trimmed to Mono cache keys only. 14+1 `STORAGE_KEYS.FINYK_*` marked
    `@deprecated` with SQLite-equivalent pointers. 3 LS-only keys
    (`finyk_excluded_stat_txs`, `finyk_rec_dismissed`,
    `finyk_show_balance_v1` for prefs) stay LS-backed (no SQLite column
    yet — future PR scope).
  - **Follow-ups (Stage 13).** PR #074 закриває
    `finyk_show_balance_v1` SQLite reader (column існує з PR
    #057k-tombstone, але reader не написаний — `@deprecated` tag
    зараз misleading). PR #075 фіксує decision для
    `finyk_excluded_stat_txs` + `finyk_rec_dismissed` (intentionally
    LS-only vs schema gap). Див. § Stage 13.

#### **PR #058 — `feat(mobile): wire sync-engine writer-runtime in boot path`** ✅ LANDED

- Mobile counterpart до web `apps/web/src/core/syncEngine/syncEngineWriter.ts`
  ([#1953](https://github.com/Skords-01/Sergeant/pull/1953)).
- Landed у [#2118](https://github.com/Skords-01/Sergeant/pull/2118)
  alongside CloudSync v1 client cleanup. Boot path:
  `apps/mobile/app/_layout.tsx`; singleton:
  `apps/mobile/src/core/syncEngine/singleton.ts`; runtime:
  `apps/mobile/src/core/syncEngine/syncEngineWriter.ts`.
- Mobile-сторона більше не є read-only stub: `useSyncStatus` читає
  v2 writer status, а boot path стартує push-loop після storage
  bootstrap. Це знімає hard-blocker для mobile-частини PR #056\*,
  але module rollout gates нижче лишаються обов'язковими.
- **Out-of-scope-таск** з PR #053c (line 2530-2532, "Mobile
  sync-engine writer-runtime wiring у boot-path... — окремий
  follow-up") закрито в PR #2118.

#### **PR #058a — `feat(web): add Stage 8 dual-write telemetry sink`** ✅ LANDED ([`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4))

- Adds `apps/web/src/core/observability/dualWriteTelemetry.ts`
  Sentry sink (`recordDualWriteOutcome`) consumed by Routine
  (`apps/web/src/modules/routine/lib/dualWrite/index.ts`) and Finyk
  (`apps/web/src/modules/finyk/lib/dualWrite/index.ts`) dual-write
  pipelines, plus `monoMirror.ts` write-path. Powers the
  `<m>.sqlite.dualwrite.error_rate` /
  `<m>.sqlite.dualwrite.parity` decision-gate metrics referenced у
  PR #055\*1 + decision-gate-таблиці нижче.
- Не несе власного PR-номера у GitHub squash history (commit-only).
- **Out-of-scope:** Fizruk + Nutrition dual-write pipelines
  (`fizrukStorage.ts`, `nutritionStorage.ts`) не повністю
  під'єднані до `recordDualWriteOutcome` — own follow-up
  paired з майбутнім LS-write removal step (потенційно разом
  з #057f / #057n LS-reader drop) — telemetry hook як safety-net guard.
  PR #056f / PR #056n landed (revised scope) без цього wiring;
  flag-gating drop не торкалася LS-write коллсайтів.

**Active rollout state:** Stage 8 default-on dual-write тепер покриває
Routine, Fizruk, Nutrition, Finyk і Finyk Mono mirror на web + mobile
(квартет PR #055\*1 — landed via #2133/#2135/#2178). Read-default-on
квартет re-rolled out per-module after PWA-canary fix landed:
Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
(PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
(PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251)
(PR #055n2), Finyk (`24616449`, PR #055k2). Усі 4 read-flag-и now
`defaultValue: true` у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
Stage 8 dual-write telemetry sink (`ff92dbb4`) wired для Routine +
Finyk + Finyk Mono. **Stage 8 §3 parity probe quartet ✅ COMPLETE
на всіх 4 dual-write модулях:** Routine
([#2243](https://github.com/Skords-01/Sergeant/pull/2243), `4ea2c952`),
Fizruk ([#2257](https://github.com/Skords-01/Sergeant/pull/2257),
PR #055f3), Nutrition ([#2259](https://github.com/Skords-01/Sergeant/pull/2259),
PR #055n3), Finyk ([#2260](https://github.com/Skords-01/Sergeant/pull/2260),
PR #055k3) — `<m>.sqlite.dualwrite.parity` decision-gate metric
тепер populated на всіх 4 модулях. **Stage 8 dual-write feature-flag
drop quartet ✅ COMPLETE** (revised scope per Routine PR #056r —
drop flag-gating only, не LS-write): Routine `#056r` (`ff852475`),
Fizruk `#056f` (`abc575f0`), Finyk `#056k`
([#2265](https://github.com/Skords-01/Sergeant/pull/2265), `535a9984`),
Nutrition `#056n` ([#2266](https://github.com/Skords-01/Sergeant/pull/2266),
`65fe17fe`). Усі 4 `feature.<m>.sqlite_v2.dual_write` flag-и видалені
з web + mobile реєстрів; SQLite mirror фірить unconditionally whenever
a dual-write context is registered. LS/MMKV-write source-of-truth status:
Fizruk ([#2275](https://github.com/Skords-01/Sergeant/pull/2275)),
Nutrition ([#2274](https://github.com/Skords-01/Sergeant/pull/2274)),
Finyk ([#2277](https://github.com/Skords-01/Sergeant/pull/2277)) —
full cut-over LANDED у `#057f`/`#057n`/`#057k` tombstones (LS-write
і LS-read drop, residual-import boot helpers). Routine — web
tombstone LANDED у `#057r-tombstone` (early-stage dev, без canary):
`routineStorage.ts` LS-write drop через write-through cache +
`triggerRoutineDualWrite`, `residualImport.ts` LS→SQLite drain,
`STORAGE_KEYS.ROUTINE` `@deprecated`. Stage 10 schema +
dual-write extension landed раніше у
[#2279](https://github.com/Skords-01/Sergeant/pull/2279) +
[#2281](https://github.com/Skords-01/Sergeant/pull/2281). Mobile
MMKV-write drop — окремий follow-up (mobile dual-write
completion-only; дроп без Stage 10 mobile mirror = data loss).

#### **Decision gate (Stage 8 → Stage 9).**

| Метрика                                              | Pass                  | Fail                        |
| ---------------------------------------------------- | --------------------- | --------------------------- |
| `<m>.sqlite.dualwrite.error_rate` (Sentry, 14 днів)  | ≤ 0.1% per module     | ≥ 0.5% — pause #055\*2      |
| `<m>.sqlite.read.fallback` (counter, post-#055\*2)   | 0 steady state        | > 0 — investigate, rollback |
| Total LS-write events per session (post-#056\*)      | ≤ 5 (only auth + ack) | > 10 — find missed callsite |
| `STORAGE_KEYS` enum entries (post-#057\*)            | ≤ 3 (auth + flags)    | > 5 — missed tombstone      |
| Bundle size delta after Stage 8 (web)                | ≤ -8 KB net           | > +5 KB — check tree-shake  |
| Mobile sync-engine writer-runtime active (post-#058) | yes                   | no — block #056\*           |

#### **Calendar.**

- 4 модулі × 4 кроки = 16 PR-ів кодом (~3 тижні чистого coding на
  1 FTE) — лишився квартет #057\* (~1.5 тижні coding).
- Між кроками 1↔2 і 2↔3 — _≥ 7 і ≥ 14 днів_ canary spec-ів.
- **Total wall-clock:** 2-3 місяці (rollout-watching паралельно
  з Stage 9).

---

### Stage 9 — KV store swap (`webKVStore` → SQLite-backed `kv_store`)

> **Status:** ✅ COMPLETE (7/7). PRs #060–#066 всі landed:
> PR #060 ([#2155](https://github.com/Skords-01/Sergeant/pull/2155) `kv_store` SQLite table),
> PR #061 ([#2157](https://github.com/Skords-01/Sergeant/pull/2157) `createSqliteKVStore` warm-cache adapter),
> PR #062 ([#2159](https://github.com/Skords-01/Sergeant/pull/2159) web `bootstrapKvStore()`),
> PR #063 ([#2165](https://github.com/Skords-01/Sergeant/pull/2165) `webKVStore` swap),
> PR #064 ([#2168](https://github.com/Skords-01/Sergeant/pull/2168) drop LS mirror),
> PR #065 ([#2170](https://github.com/Skords-01/Sergeant/pull/2170) mobile KV mirror swap, commit `66a799bf`),
> PR #066 (`createMemoryKVStore` moved to `@sergeant/shared/test-utils`; web memory fallback is app-local).
> Це той самий «SQLite-backed
> `kv_store(key TEXT PK, value JSON)`» який original PR #054 final
> тезу обіцяв, але ніколи не входив у Done criteria цього PR-у.
> Виноситься у власну Stage, бо технічно нетривіальний — async
> SQLite init vs sync `KVStore.getString` API + кругова
> залежність kvvfs ↔ localStorage на iOS Safari < 16.4 (де SQLite
> сам сидить у LS, тому put-ити LS-data у SQLite, що сидить у LS,
> = circular).

**Цільова інфра.**

- Нова таблиця `kv_store(key TEXT PRIMARY KEY, value TEXT NOT NULL,
updated_at INTEGER NOT NULL)` у `packages/db-schema/src/sqlite/`.
- Boot-time warm-cache: `await sqlite.select().from(kvStore)` →
  `Map<string, string>`. Cache populates _до_ App-render
  (синхронний `getString` має повертати committed reads — тому
  warm-cache блокує boot до завершення SQLite init).
- Sync `getString(key)` → `cache.get(key) ?? null`.
- Sync `setString(key, value)` → `cache.set(key, value)` _плюс_
  fire-and-forget `sqlite.insert().onConflictDoUpdate({ key, value,
updated_at: Date.now() })`. Async-write enqueue-ується через
  op-log retry queue для durability.
- `onChange(key, listener)` працює через `BroadcastChannel`
  (cross-tab) + локальну sub-list.

**PR plan.**

#### **PR #060 — `feat(db-schema): add kv_store SQLite table + client migration`** ✅ LANDED ([#2155](https://github.com/Skords-01/Sergeant/pull/2155))

- Drizzle SQLite schema у `packages/db-schema/src/sqlite/kvStore.ts`:
  ```ts
  export const kvStore = sqliteTable("kv_store", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  });
  ```
- Inline міграція у `packages/db-schema/src/sqlite/migrations/`
  - manifest entry.
- Postgres counterpart **НЕ потрібний** — `kv_store` суто
  client-local (per-device key-value, без sync-у на сервер;
  для cross-device prefs далі юзаємо нормалізовані модульні
  таблиці).
- **AC.** `pnpm --filter @sergeant/db-schema test` — passes;
  schema snapshot test покриває нову таблицю.
- **Out-of-scope.** Жодних змін у `webKVStore` impl-ації — це
  схема-only PR.

#### **PR #061 — `feat(shared): add createSqliteKVStore + warm-cache`** ✅ LANDED ([#2157](https://github.com/Skords-01/Sergeant/pull/2157))

- New KVStore adapter у `packages/shared/src/storage/kv.ts` (поряд
  з `createMemoryKVStore`/`createWebKVStore`/`createMmkvKVStore`):
  ```ts
  export function createSqliteKVStore(deps: {
    sqlite: SqliteMigrationClient;
    boot: { warmCache: Map<string, string>; loaded: boolean };
    crossTab?: BroadcastChannelLike;
  }): KVStore;
  ```
- `getString` — sync read з `boot.warmCache`. Якщо
  `boot.loaded === false` → throw `KVStoreNotReadyError` (caller
  має зачекати boot).
- `setString` — sync update warm-cache + async write-back до
  SQLite через op-log queue.
- `listKeys` — sync `Array.from(boot.warmCache.keys())`.
- `onChange` — local list + `BroadcastChannel`-based cross-tab
  signal.
- **Tests** (`__tests__/sqliteKv.test.ts`) — boot-sequence,
  fallback на init failure, write-coalesce, BC stress test.
- **Dep.** PR #060.

#### **PR #062 — `feat(web): bootstrap warm-cache + LS→kv_store one-time migration`** ✅ LANDED ([#2159](https://github.com/Skords-01/Sergeant/pull/2159))

- New `apps/web/src/core/db/kvStoreBoot.ts`:
  ```ts
  export async function bootstrapKvStore(): Promise<{
    warmCache: Map<string, string>;
    loaded: true;
  }>;
  ```
- Boot sequence:
  1. SQLite init (existing `apps/web/src/core/db/sqlite.ts`).
  2. Read `kv_store` → populate `warmCache`.
  3. Якщо `kv_store` empty AND `localStorage` non-empty AND
     migration flag (`kv_store_migrated_v1`) not set →
     bulk-import all LS keys → upsert до `kv_store` → set flag.
  4. Subscribe to `BroadcastChannel('kv-store')` для cross-tab.
- App entry (`main.tsx`) await-ить bootstrap до `<App />` mount.
- **Failure-mode**: SQLite init throw → render fallback UI +
  Sentry alarm; `webKVStore` лишається LS-backed (через
  `resolveStore()` ladder додається `if (!boot.loaded) → return
webLsKv`).
- **Dep.** PR #061.

#### **PR #063 — `feat(web): swap webKVStore impl from localStorage to SQLite-backed kv_store`** ✅ LANDED ([#2165](https://github.com/Skords-01/Sergeant/pull/2165))

- Refactor `apps/web/src/shared/lib/storage/storage.ts ::
resolveStore()` — пріоритет 1: SQLite warm-cache (якщо
  `boot.loaded`); пріоритет 2: web LS adapter (fallback); пріоритет
  3: memory fallback (SSR/private mode).
- LS залишається як live mirror на 4 тижні (writes йдуть і в
  SQLite, і в LS) — щоб revert-нути PR без втрати юзер-даних.
- Telemetry: `kvstore.backend` tag (`sqlite | ls-fallback | memory`)
  - `kvstore.boot.duration_ms` histogram.
- **Done criteria.** SQLite backend у > 99% sessions після
  bootstrap-у на staging.
- **Dep.** PR #062.

#### **PR #064 — `chore(web): drop LS mirror in webKVStore (SQLite-only)`** ✅ LANDED ([#2168](https://github.com/Skords-01/Sergeant/pull/2168))

- Після 4 тижнів post-#063 без telemetry-incident-ів: drop LS
  mirror writes. `webKVStore` тепер strictly SQLite-backed (з
  memory fallback на init failure).
- Drop одноразової LS→kv_store migration (вже не треба).
- Removed `makeDualWriteKvStore()` — `resolveStore()` returns
  SQLite directly. Two-rung ladder: SQLite → LS-only fallback → memory.
- Restored original PR #062/063 JSDoc in `kvStoreBoot.ts` and
  `storage.ts` (pre-PR-#064 state with LS migration + dual-write).
- Updated `storage.dualwrite.test.ts` to verify LS is NOT mirrored.
- **Done criteria.** `kvstore.backend === "ls-fallback"` rate
  ≤ 0.1% за 14 днів.
- **Dep.** PR #063 + 4 тижні стабільного потоку.

#### **PR #065 — `feat(mobile): mirror — swap mobile webKVStore-equivalent onto SQLite-backed kv_store`** ✅ LANDED — [#2170](https://github.com/Skords-01/Sergeant/pull/2170)

- Mobile counterpart до PR #061-#064. Mobile вже використовує
  `createMmkvKVStore` (через `react-native-mmkv`) — Stage 9 на
  mobile = swap MMKV → SQLite-backed `kv_store`.
- New `apps/mobile/src/core/db/kvStoreBoot.ts` — mobile bootstrap
  pump: expo-sqlite init → kv_store migration → warm-cache scan →
  one-time MMKV→kv_store import → `createSqliteKVStore`.
- Dual-write pattern: SQLite primary + MMKV mirror for canary
  safety (PR #066 drops the mirror).
- `_layout.tsx` calls `bootstrapMobileKvStore()` after encrypted
  storage bootstrap, before sync-engine writer boot.
- MMKV native bundle (~80 KB) можна прибрати з app shell після
  cut-over — bundle saving + один менший native dep maintenance
  burden.
- **Risk.** MMKV — synchronous + faster (~µs); SQLite через
  `expo-sqlite` — синхронний на native side, але через JSI bridge
  має ~ms latency. Warm-cache pattern компенсує.
- **Dep.** PR #064.

#### **PR #066 — `chore(shared): drop createMemoryKVStore from prod shipping (tests-only)`** ✅ LANDED

- `createMemoryKVStore` винесено з production runtime barrel у
  `@sergeant/shared/test-utils`.
- Shared tests імпортують memory store з test-utils; production web/mobile
  code не імпортує його з `@sergeant/shared`.
- Web SSR/private-mode fallback лишився app-local memory adapter у
  `apps/web/src/shared/lib/storage/storage.ts`, щоб не втратити runtime
  resilience.

#### **Stage 9 hotfix tail (post-canary, 2026-05-07 → 2026-05-08).**

Production Sentry surfaced `SQLITE_ERROR: no such table: sync_op_outbox`
on installed-PWA users where the boot-path race left the outbox in a
partial-migration state after PR #063 (`webKVStore` swap). Five
hotfixes landed to harden the boot path; root-cause + decision tree
are documented у `docs/90-work/audits/archive/2026-05-07-app-audit.md` §A1.

| Commit                                                                                         | PR                                                       | What it fixes                                                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`3f40a27e`](https://github.com/Skords-01/Sergeant/commit/3f40a27e) (alias `ac840eda` on main) | [#2192](https://github.com/Skords-01/Sergeant/pull/2192) | `fix(web): run outbox migrations at sync engine boot` — guarantees `sync_op_outbox` exists before enqueue. |
| [`7bc3b2f3`](https://github.com/Skords-01/Sergeant/commit/7bc3b2f3)                            | follow-up commit                                         | `fix(web): hotfix kvStoreBoot import + ESLint guard against db-schema/migrate umbrella`.                   |
| [`ba6cb113`](https://github.com/Skords-01/Sergeant/commit/ba6cb113)                            | [#2199](https://github.com/Skords-01/Sergeant/pull/2199) | `fix(web): self-heal sqlite outbox from partial 002 migration` — `repairPartialOutboxMigration` helper.    |
| [`ce4fb145`](https://github.com/Skords-01/Sergeant/commit/ce4fb145)                            | follow-up commit                                         | `fix(web): tag sync_op_outbox boot outcome in Sentry` — boot outcome breadcrumb for monitoring.            |
| [`316ef626`](https://github.com/Skords-01/Sergeant/commit/316ef626)                            | [#2201](https://github.com/Skords-01/Sergeant/pull/2201) | `fix(web): resolve app audit hotfixes` — bundle of audit §A1–A4 closures.                                  |
| [`12090d00`](https://github.com/Skords-01/Sergeant/commit/12090d00)                            | [#2220](https://github.com/Skords-01/Sergeant/pull/2220) | `fix(web): make localStorage writable in Vitest setup + close audit items 1-4` — audit follow-up.          |
| [`dcd31e02`](https://github.com/Skords-01/Sergeant/commit/dcd31e02)                            | follow-up commit                                         | `fix(web): route typedStore writes through webKVStore for SQLite consistency`.                             |

These commits are part of the Stage 9 boot-path resilience layer
(post-#063) but are not new PRs in the #060–#066 plan. They
strengthen the same swap rather than extending it. Tracked у audit
§A appendix; no new Stage 9 plan-row required.

#### **Risk register для Stage 9.**

| Ризик                                                                                       | Likelihood | Impact | Mitigation                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| SQLite init fails на iOS Safari < 16.4 (kvvfs fallback) → boot blocks                       | Medium     | High   | Fallback ladder: SQLite → web LS adapter → memory. Telemetry на real fallback rate.              |
| Warm-cache miss race: setItem-then-getItem у одному tick до flush                           | Low        | Medium | Sync update warm-cache **перед** async-write до SQLite — read-after-write consistency garantied. |
| BroadcastChannel doesn't fire між tabs у Safari Private mode                                | Low        | Low    | Fallback на localStorage `storage` event як signal-only (не для data).                           |
| One-time LS→kv_store migration ламається на 5+ MB user (LS quota error на read-then-import) | Low        | Medium | Idempotent batch-import (50 keys per batch); resume from migration flag.                         |
| Async write-back queue overflow під offline + heavy write пресс                             | Low        | Medium | Queue cap (1000 ops); dropping LRU з Sentry alarm.                                               |
| Drizzle `.onConflictDoUpdate` має edge-case bug на Safari WASM                              | Low        | Medium | Fallback на raw SQL (`INSERT OR REPLACE`).                                                       |

#### **Calendar.**

- 5 PR-ів × ~3 дні per PR + ~4 тижні canary post-#063 = **2 місяці
  wall-clock** (1 FTE кодом ~2 тижні + рest — telemetry-watching).

---

