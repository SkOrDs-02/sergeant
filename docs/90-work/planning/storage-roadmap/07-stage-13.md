# Storage & Sync — PR-плани: Stage 13 (Audit findings & post-migration cleanup)

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 8–9](./06-stage-8-9.md) · [→ Appendix](./08-appendix.md)

### Stage 13 — Audit findings & post-migration cleanup

> **Status:** ✅ COMPLETE (9/9 LANDED) — last updated 2026-05-10.
>
> **Landed (9/9):** PR #071 ✅ ([#2322](https://github.com/Skords-01/Sergeant/pull/2322)
> — mobile `hubBackup` delegates to module-level apply, 4 new module-level
> backup helpers + integration test); PR #072 ✅ ([#2320](https://github.com/Skords-01/Sergeant/pull/2320)
> — weekly-digest SQLite `finyk_prefs.monthly_plan_json` reader); PR #073
> ✅ ([#2366](https://github.com/Skords-01/Sergeant/pull/2366) — mobile
> `NUTRITION_SAVED_RECIPES` MMKV-write tombstone + residualImport drain);
> PR #074 ✅ ([#2325](https://github.com/Skords-01/Sergeant/pull/2325)
> — finyk `showBalance` slot bundle із SQLite-overlay
> `finyk_prefs.show_balance` + LS first-paint fallback; closes audit
> finding A4); PR #075 ✅ ([#2321](https://github.com/Skords-01/Sergeant/pull/2321)
> — finyk LS-only slots `excluded_stat_txs` + `dismissed_recurring`
> migrated to SQLite cross-device sync); PR #076
> ✅ ([#2319](https://github.com/Skords-01/Sergeant/pull/2319) — dropped
> dead `syncedKV.ts` + `SYNC_EVENT/SYNC_STATUS_EVENT` + lying OpenAPI
> registrations); PR #077 ✅ ([#2367](https://github.com/Skords-01/Sergeant/pull/2367)
> — drop 11 dead `STORAGE_KEYS.{SYNC,MOBILE_SYNC}_*` entries + web
> `dirtyCount`/`queuedCount` from `useSyncStatus`); PR #078 ✅ (retire
> `feature.finyk.sqlite_v2.mono_mirror` flag — last sqlite_v2 flag;
> mono mirror boots unconditionally); PR #079
> ✅ ([#2324](https://github.com/Skords-01/Sergeant/pull/2324) — doc drift
> refresh: Initiative 0003 Phase 2 PR placeholder resolved + Phase 6
> bullets carry explicit commit/PR refs; ADR-0047 amendment + Phase 7
> exit-criteria already in-tree from audit-prep commit `37bcba1c`).
>
> Post-Stage-12.5 audit (read-only review всіх `safeWriteLS`/`safeReadLS`
> callsites + `STORAGE_KEYS` references + sync-engine exports + OpenAPI
> registry + residual-import shapes на web + mobile) виявив:
>
> - **2 справжні баги** (mobile hubBackup writes MMKV post-tombstone;
>   weekly-digest reads dead `finyk_storage_v2` blob) — всі закриті (#071, #072).
> - **3 partial gaps** (nutrition `NUTRITION_SAVED_RECIPES` mobile
>   tombstone не закритий — живий, #073; finyk LS-only slots — закрито
>   в #075; misleading `@deprecated` tag на `FINYK_SHOW_BALANCE` — живий, #074).
> - **7 dead-code cleanup кандидатів** (~600 LOC) post-Stage-7 / Stage-9
>   — забуті exports, listeners, schemas, OpenAPI entries, що не
>   звільнили після CloudSync v1 sunset (T₀ = 2026-05-06, ADR-0047) — частково
>   закрито в #076; решта — #077, #078.
> - **2 doc-drift items** (Initiative 0003 Phase 6 status застарів;
>   ADR-0047 без exit-criteria для sunset routes) — живий, #079.
>
> Stage 13 декомпозує findings на 9 PR-ів (не 7 як планувалося
> спочатку — додався #077 sync-metadata та #078 mono_mirror під час
> implementation), групованих за severity та ризиком. Жоден з них не
> блокер — Stages 0–12.5 покривають ~98% поверхні. Це cleanup-tail,
> який краще закрити окремою серією після Stage 12.5 burn-in.

**Group A — Bug fixes (HIGH severity).**

#### **PR #071 — `fix(mobile): hubBackup delegates to module-level apply functions, drops MMKV pass-through`** ✅ LANDED ([#2322](https://github.com/Skords-01/Sergeant/pull/2322), 2026-05-10) — HIGH (silent functional bug)

- **Symptom.** `apps/mobile/src/core/hub/hubBackup.ts`
  `buildHubBackupPayload()` читає прямо з MMKV через
  `safeReadLS(STORAGE_KEYS.ROUTINE, ...)`, `STORAGE_KEYS.NUTRITION_*`,
  `FIZRUK_FULL_BACKUP_KEYS`, `FINYK_FIELD_TO_STORAGE_KEY`.
  `applyHubBackupPayload()` пише назад через `safeWriteLS(...)` для тих
  самих ключів. Після Stage 8 PR #057r/f/n/k-tombstone-mobile + Stage
  12 / Stage 12.5 fizruk tombstones — MMKV для цих ключів **порожнє**.
- **Effect.**
  1. Експорт mobile-бекапу повертає stale/empty payload (нічого не
     прочитує з SQLite — джерела правди).
  2. Імпорт пише в MMKV, але всі module reads ходять через SQLite +
     warm cache → дані ніколи не застосовуються в UI. Навіть на
     reboot `residualImport.ts` має `STALE_TIMESTAMP =
"1970-01-01T00:00:00.000Z"` (LWW guard) — стале SQLite-значення
     завжди перемагає, бекап осідає у MMKV назавжди.
- **Web counterpart коректний.** `apps/web/src/core/hub/hubBackup.ts`
  делегує в module-level `applyRoutineBackupPayload` /
  `applyFizrukFullBackupPayload` / `applyNutritionBackupPayload` /
  `persistFinykNormalizedToStorage` — ті ходять через нормальний
  dual-write trigger з валідним `Date.now()` clientTs.
- **Реалізувати.** Mirror web pattern на mobile: hubBackup читає
  state через ті ж SQLite readers (`loadRoutineState()` /
  `buildFizrukFullBackupPayload()` / `buildNutritionBackupPayload()` /
  `loadFinykNormalized()`); applyHubBackupPayload делегує в
  module-level apply functions, що тригерять dual-write з валідним
  `Date.now()`. Drop direct `safeReadLS`/`safeWriteLS` callsites.
  Update `eslint.config.js` allowlist (видалити `hubBackup.ts`
  carve-out — більше не потрібен).
- **AC.** Round-trip export-on-mobile (post-tombstone) → import-on-mobile
  → reboot → дані видимі у Routine/Fizruk/Nutrition/Finyk UI у всіх 4
  модулях. Tests: integration test, що валідує payload не порожній і
  apply переносить state у SQLite (через dual-write telemetry).
- **Files.** `apps/mobile/src/core/hub/hubBackup.ts` (lines ~38–192
  заміняти повністю на mirror web pattern); `eslint.config.js` allowlist
  trim; новий test fixture у `hubBackup.integration.test.ts`.
- **Dep.** None — Stage 12.5 уже забезпечує всі module-level apply
  functions на mobile.

#### **PR #072 — `fix(insights): weekly-digest reads SQLite finyk_prefs.monthly_plan_json instead of dead finyk_storage_v2 blob`** ✅ LANDED ([#2320](https://github.com/Skords-01/Sergeant/pull/2320), 2026-05-10) — MEDIUM (silent feature deg)

- **Symptom.** `apps/web/src/core/insights/useWeeklyDigest.ts:150-152`:
  ```ts
  const finykStorage = useReadonlyPersist<{
    monthlyPlan?: { expense?: number };
  } | null>("finyk_storage_v2", null);
  const monthlyBudget = finykStorage?.monthlyPlan?.expense ?? null;
  ```
  Mobile twin: `apps/mobile/src/core/dashboard/weeklyDigestAggregates.ts:122-124`.
- **Чому це баг.** `finyk_storage_v2` — монолітний blob з ери до Stage 4
  / PR #035–#039 (per-key розкладення). Жоден код **більше не пише**
  у нього (perevіrено grep, тільки 2 readers + `storageKeys.ts`
  definition). Тому `monthlyBudget` для weekly digest — завжди `null`
  на свіжих інсталяціях; cross-module recommendation
  `Insights.budgetRemaining` тихо деградована.
- **Реалізувати.** Reader chain: SQLite `finyk_prefs.monthly_plan_json`
  (canonical) → LS `finyk_monthly_plan` (legacy fallback). Mirror того,
  як `useFinykDualWriteSync.ts` побудував dual-write extractor — той
  самий serialization shape (`MonthlyPlan` schema з
  `packages/finyk-domain`). Drop `finyk_storage_v2` read.
- **AC.** Snapshot test, що `monthlyBudget` reflects SQLite-стан після
  PR #055k1 + #057k-tombstone. Drop `STORAGE_KEYS.FINYK_STORAGE` entry
  з `storageKeys.ts` (значення `finyk_storage_v2` не має ні читача ні
  писаря після цього PR).
- **Files.** `apps/web/src/core/insights/useWeeklyDigest.ts:150-152`,
  `apps/mobile/src/core/dashboard/weeklyDigestAggregates.ts:122-124`,
  `packages/shared/src/lib/storageKeys.ts:55` (drop `FINYK_STORAGE`).
- **Dep.** None.

**Group B — Partial tombstones (MEDIUM).**

#### **PR #073 — `chore(mobile,nutrition): drop NUTRITION_SAVED_RECIPES MMKV write + extend residualImport`** ✅ LANDED ([#2366](https://github.com/Skords-01/Sergeant/pull/2366), 2026-05-10) — MEDIUM

- **Symptom.** `apps/mobile/src/modules/nutrition/lib/recipeBookStore.ts:88-107`
  усе ще робить `safeReadLS(NUTRITION_SAVED_RECIPES)` для read-path і
  `safeWriteLS(NUTRITION_SAVED_RECIPES, book)` + trigger dual-write для
  write-path. `apps/mobile/src/modules/nutrition/lib/residualImport.ts:54,111`
  явно скіпає recipes (`recipes: []`). PR #057n-tombstone-mobile
  закрив water-log + shopping-list, але recipes пропустили.
- **Реалізувати.** Mirror water-log + shopping-list pattern з
  `#057n-tombstone-mobile`:
  - `recipeBookStore.ts` читає рецепти з SQLite warm cache
    (`getCachedNutritionSqliteState().recipes`) з MMKV-fallback на
    cold start. Drop `safeWriteLS(NUTRITION_SAVED_RECIPES, ...)`.
  - `residualImport.ts` дренує recipes на boot (epoch-zero
    `clientTs`, LWW guard).
  - `STORAGE_KEYS.NUTRITION_SAVED_RECIPES` помічається `@deprecated`
    із pointer на SQLite `nutrition_recipes` table.
  - `eslint.config.js` carve-out для `NUTRITION_SAVED_RECIPES` drop.
- **AC.** Mobile nutrition test suite passes; recipes після
  cold-boot з MMKV-only state переезжають у SQLite і подальші reads
  ходять через overlay. `eslint-plugin-sergeant-design` tracked-keys
  list зменшується на 1.
- **Dep.** Stage 11 (`nutrition_recipes` table існує).

#### **PR #074 — `chore(finyk): SQLite reader for finyk_prefs.show_balance + tombstone FINYK_SHOW_BALANCE`** ✅ LANDED ([#2325](https://github.com/Skords-01/Sergeant/pull/2325), 2026-05-10) — LOW (closed A4)

- **Symptom.** `STORAGE_KEYS.FINYK_SHOW_BALANCE` (`finyk_show_balance_v1`)
  має `@deprecated → use SQLite finyk_prefs.show_balance` tag (Stage 8
  PR #057k-tombstone), але:
  - `apps/web/src/modules/finyk/FinykApp.tsx:107,136` — читає/пише
    через raw LS.
  - `apps/web/src/modules/finyk/hooks/useFinykDualWriteSync.ts:36` —
    читає LS, пише SQLite (write-only path).
  - Жоден код не **читає** `finyk_prefs.show_balance` із SQLite.
  - Stage 8 PR #057k-tombstone лінії 3470-3471 кажуть що
    `finyk_show_balance_v1` "stays LS-backed (no SQLite column yet —
    future PR scope)" → конфлікт із `@deprecated` tag-ом.
- **Реалізувати.** Closing the loop:
  - `FinykApp.tsx` showBalance читає з SQLite overlay
    (`getCachedFinykSqliteState()?.prefs.showBalance`) з LS fallback.
  - Drop direct `writeRaw("finyk_show_balance_v1", ...)` —
    `setShowBalance` тепер тригерить dual-write через `triggerFinykDualWrite`.
  - Update Stage 8 PR #057k-tombstone roadmap entry: видалити
    "stays LS-backed (no SQLite column yet)" згадку для
    `finyk_show_balance_v1`.
- **AC.** SQLite `finyk_prefs.show_balance` читається у UI.
  `localStorage.setItem("finyk_show_balance_v1", ...)` callsite-ів — 0
  (CI grep gate). `STORAGE_KEYS.FINYK_SHOW_BALANCE` `@deprecated` tag
  тепер truthful.
- **Dep.** Stage 8 PR #057k-tombstone (column існує).

#### **PR #075 — `feat(db-schema): cross-device sync для excluded_stat_txs та dismissed_recurring`** ✅ LANDED ([#2321](https://github.com/Skords-01/Sergeant/pull/2321), 2026-05-10) — LOW (closes A5)

- **Symptom.** Stage 8 PR #057k-tombstone (lines 3469-3471) залишив
  `finyk_excluded_stat_txs` + `finyk_rec_dismissed` як LS-only без
  виділеного PR-у — лише згадка "future PR scope".
- **Реалізувати.** Або (а) додати SQLite columns у `finyk_prefs`
  (`excluded_stat_tx_ids JSON`, `dismissed_recurring JSON`) +
  dual-write extractor + reader overlay (mirror PR #074 pattern), або
  (б) явно зафіксувати "intentionally LS-only (UI prefs, not synced
  cross-device)" + перенести з `STORAGE_KEYS` у local module constant
  (як `finyk_first_expense_seen_v1` activation funnel marker).
- **Decision pending.** Залежить від рішення: чи treat-имо ці слоти як
  cross-device prefs (option а) чи як device-local UI hints (option б).
- **AC.** Storage-roadmap явно фіксує рішення; "future PR scope"
  згадки видалено; `STORAGE_KEYS` reflects реальність.

**Group C — Dead code cleanup (CLEAR WINS).**

#### **PR #076 — `chore(shared): drop dead syncedKV.ts + SYNC_EVENT/SYNC_STATUS_EVENT + lying OpenAPI registrations`** ✅ LANDED ([#2319](https://github.com/Skords-01/Sergeant/pull/2319), 2026-05-10) — clear win, ~300 LOC

- **B1 — `packages/shared/src/sync/syncedKV.ts`.** 100% dead:
  `createSyncedKVStore()` exported, has full test suite, 0 production
  imports (grep confirmed). Vestige of cloudSync v1 monkey-patch
  infrastructure (long sunset). Drop file + tests + barrel re-export.
- **B2 — `SYNC_EVENT` (`hub-cloud-sync-dirty`) + `SYNC_STATUS_EVENT`
  (`hub-cloud-sync-status`).** Listener живий у
  `apps/web/src/core/cloudSync/hook/useSyncStatus.ts:74-82`,
  диспатчер — 0 callsites (grep `dispatchEvent`/`new CustomEvent` —
  жоден SYNC_EVENT). Drop constants з
  `packages/shared/src/sync/modules.ts` + listener pair з
  `useSyncStatus.ts` (лишається тільки `online`/`offline` window
  events + v2 status subscription).
- **B5 — OpenAPI lies.** `packages/shared/src/schemas/api.ts:505-552`
  експортує `SyncModuleEnum` + `SyncPushSchema` + `SyncPullSchema` +
  `SyncPushAllSchema` + `ClientUpdatedAtSchema`. `packages/shared/src/openapi/registry.ts:99-110,283-287`
  registers them як OpenAPI components з description-ами
  "POST /api/sync/push (per-module LWW)" etc. — ці routes returning
  410 Gone з 2026-05-06 (T₀, ADR-0047). Drop schemas + registry
  entries (or — safer step 1 — додати `deprecated: true` + опис
  "Returns 410 Gone since 2026-05-06").
- **AC.** No production imports of dropped exports (CI grep gate);
  generated OpenAPI spec не показує v1 sync endpoints як живі;
  test suite passes.
- **Risk.** Нульовий — все drop targets вже не мають production
  consumers.
- **Dep.** None.

#### **PR #077 — `chore(shared): drop dead sync-metadata STORAGE_KEYS + web useSyncStatus dirtyCount/queuedCount`** ✅ LANDED ([#2367](https://github.com/Skords-01/Sergeant/pull/2367), 2026-05-10) — MEDIUM (~50 LOC)

- **B3 — Web `useSyncStatus.dirtyCount` / `queuedCount` perpetually 0.**
  `apps/web/src/core/cloudSync/hook/useSyncStatus.ts:33-34` returns
  `{ dirtyCount: 0, queuedCount: 0, ... }`. Comment пояснює (кожен раз
  чесно): "kept on the return shape so OfflineBanner can stay agnostic".
  `apps/web/src/core/app/OfflineBanner.tsx:30` робить
  `Math.max(queuedCount, dirtyCount, syncV2PendingCount)` →
  `Math.max(0, 0, X) === X`. Drop both fields з web shape; update
  OfflineBanner на `const pending = syncV2PendingCount;`. Mobile shape
  різний (там `dirtyCount = rejected + dead_letter`) — не торкатися.
- **B4 — 10 dead `STORAGE_KEYS.{SYNC,MOBILE_SYNC}_*` entries.**
  В `packages/shared/src/lib/storageKeys.ts`:
  `SYNC_VERSIONS`, `SYNC_DIRTY_MODULES`, `SYNC_MODULE_MODIFIED`,
  `SYNC_OFFLINE_QUEUE`, `SYNC_MIGRATION_DONE`, та їх 5 mobile-twins
  - `MOBILE_SYNC_DEAD_LETTER_QUEUE`. Тільки тести у
    `packages/shared/src/sync/__tests__/modules.test.ts` асертять, що
    вони НЕ в `ALL_TRACKED_KEYS`. Drop 10 entries + trim test
    assertions. Optionally: one-shot boot cleanup (5 LOC) для
    legacy users з stale LS/MMKV blobs (mirror ROUTINE_LEGACY_QUERY_PREFIX
    cleanup pattern).
- **AC.** Web `SyncStatusState` shape — без `dirtyCount`/`queuedCount`;
  `STORAGE_KEYS` має 10 fewer entries; tests passing; CI grep gate
  проти dropped names.
- **Dep.** None — все це stale-references.

#### **PR #078 — `chore(finyk): retire feature.finyk.sqlite_v2.mono_mirror flag`** ✅ LANDED (2026-05-10) — LOW (mirror #057k-flag pattern)

- **Symptom.** Останній sqlite_v2 flag still gated. `defaultValue:
true, experimental: true` у `featureFlags.ts:62-69`. Усі інші
  sqlite_v2 flags вже або default-on і unconditional (PR #056*) або
  повністю видалені (PR #057*-flag quartet). Mono mirror parity probes
  стабільні з 2026-05-06.
- **Реалізувати.** Mirror PR #057k-flag pattern:
  - Drop flag check у `monoMirrorBoot.ts`, `monoMirrorGate.ts`,
    `monoMirrorReader.ts` (web + mobile parity), `useFinykMonoMirrorBoot.ts`,
    `apps/mobile/src/modules/finyk/lib/transactionsStore.ts:316`.
  - Drop registry entry з `featureFlags.ts:62-69`.
  - Update `featureFlags.test.ts` ассертії.
- **Burn-in window.** Чекати ≥4 тижні після PR #057k3 (тобто
  ~2026-06-10) щоб гарантувати mono-mirror parity stability.
- **AC.** SQLite mono-mirror тригерить unconditionally once boot
  completes; LS-write залишається safety net (не drop у цьому PR — це
  Stage 12.6 scope або окремий PR).
- **Dep.** Mono cache parity probes healthy.

**Group D — Doc drift (boring).**

#### **PR #079 — `docs: refresh Initiative 0003 Phase 6 status + add ADR-0047 sunset exit-criteria`** ✅ LANDED (2026-05-10) — doc-only

- **A6 — Initiative 0003 Phase 6 stale.**
  [`docs/90-work/initiatives/0003-sync-v2-rollout-and-v1-sunset.md:237-244`](../../initiatives/0003-sync-v2-rollout-and-v1-sunset.md)
  каже "Pending" з 4 bullets:
  - `apps/web/src/core/cloudSync/` 35 файлів → реально 2 (`hook/useSyncStatus.ts`
    - `index.ts`).
  - `apps/mobile/src/sync/` 30 файлів → реально 3 dirs.
  - `apps/server/src/modules/sync/sync.ts` → файлу нема
    (тільки `sunsetGone.ts`/`sunsetHeaders.ts`/`syncV2.ts`/`audit.ts`).
  - Drop column `module_data` → migration 046 уже задрилила.
    Flip до "Done" з посиланнями на PR-и.
- **A7 — ADR-0047 без exit criteria.** v1 sunset routes
  (`/api/sync/{push,pull,pull-all,push-all}` — return 410 Gone з
  2026-05-06) лишаються mounted з sunset/audit/headers middleware.
  Initiative 0003 пише "intentionally kept" для legacy-client decay,
  але без timeline. Додати у ADR-0047 (чи окремою Phase 7 у
  Initiative 0003): "коли `sync_v1_legacy_clients_total` буде 0 для
  N consecutive weeks (пропоную N=8) — drop sunset routes +
  middleware". Standard deprecation cycle: 90 днів з T₀ →
  2026-08-04 як earliest removal date.
- **AC.** Initiative 0003 Phase 6 → Done; ADR-0047 amendment з
  exit-criteria додано; новий issue/реstor у Initiative 0003 Phase 7
  для final route removal.
- **Risk.** Нульовий — doc-only.

**Group E — Optional / requires decision.**

- **B6 — `SYNC_MODULES` registry single-entry tombstone.**
  `packages/shared/src/sync/modules.ts` тримає `SYNC_MODULES` з 1
  entry (`profile`), `keyToModule()`, `ALL_TRACKED_KEYS`,
  `MAX_OFFLINE_QUEUE = 10000`, `MAX_QUEUE_ATTEMPTS = 10` — все
  вживається тільки у тестах. Three options: (1) keep with comment;
  (2) reduce до простої константи `PROFILE_MODULE`; (3) повністю
  drop, якщо `profile` cloud-sync взагалі не активний. Decision
  pending — потребує перевірки чи `profile` sync досі активно
  consume v2 op-log channel. **Не блокує** інші Stage 13 PR-и.
- **C1 — `STORAGE_KEYS.FIZRUK_REST_SETTINGS`.** Активно вживається,
  але без SQLite mirror і без `@deprecated`. Decision: intentionally
  LS-only (UI prefs, не sync), or schema gap? Якщо (a) — просто
  додати коментар "intentionally LS-only, не cross-device". Якщо
  (b) — окремий PR на додавання SQLite column. **Низький priority**,
  можна підчепити у будь-який Fizruk PR.
- **C2 — `STORAGE_KEYS.FIZRUK_PLAN` misuse.** Значення
  `"fizruk-storage-monthly-plan"` — це event name (диспатчиться у
  `useMonthlyPlan.ts`), а не storage slot. Зловживання `STORAGE_KEYS`
  namespace. Cleanup: переіменувати у inline-constant у
  `useMonthlyPlan.ts` чи окремий `STORAGE_EVENTS` namespace.
  **Дуже низький priority** — пов'язаний з #074/#075 fizruk PRs.

**Sequencing recommendations.**

1. **Тиждень 1:** PR #071 (mobile hubBackup fix) — найбільший impact,
   low risk. Single PR.
2. **Тиждень 1:** PR #072 (weekly-digest reader swap) — паралельно з
   PR #071.
3. **Тиждень 2:** PR #076 (clear-win cleanup B1+B2+B5) — 1 PR на
   ~300 LOC.
4. **Тиждень 2:** PR #079 (doc-drift refresh) — паралельно з PR #076.
5. **Тиждень 3-4:** PR #073 + PR #074 + PR #075 (finyk + nutrition
   tail tombstones).
6. **Тиждень 3:** PR #077 (drop dead sync-metadata STORAGE_KEYS +
   `dirtyCount`/`queuedCount`).
7. **Тиждень 7+:** PR #078 (mono_mirror flag retire) — після burn-in
   window.

**Done criteria для Stage 13.** All met as of 2026-05-10.

- ✅ 0 production reads/writes для `STORAGE_KEYS.{SYNC,MOBILE_SYNC}_*`
  (11 dropped entries — PR #077).
- ✅ 0 production imports `createSyncedKVStore` /
  `SYNC_EVENT` / `SYNC_STATUS_EVENT` (PR #076).
- ✅ OpenAPI generated spec не показує v1 sync endpoints як живі
  (PR #076).
- ✅ Mobile hubBackup round-trip post-tombstone — passes integration
  test (PR #071).
- ✅ Weekly-digest на web + mobile reads `finyk_prefs.monthly_plan_json`
  (SQLite) для `monthlyBudget` (PR #072).
- ✅ Initiative 0003 Phase 6 → Done з посиланнями (PR #079).
- ✅ ADR-0047 містить exit-criteria для sunset routes (8-week clean
  signal або 2026-08-04 — whichever first) (PR #079).
- ✅ `feature.finyk.sqlite_v2.mono_mirror` retired (last sqlite_v2
  flag) — PR #078.

**Calendar (actual):** 9 PRs landed across 2026-05-10 — early-stage
dev cadence, burn-in window for PR #078 waived per user decision.

---

