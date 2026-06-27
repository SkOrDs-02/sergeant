# QA Defects log (Phase 2 -> Phase 3)

> Confirmed product/UX defects found during live testing. Each gets a fix in Phase 3 and a retest in Phase 4.

## D-001 — Demo mode: Routine module shows empty while hub card says "5/5, 14-day streak" [CONFIRMED High]
- **Severity:** High (broken first impression — demo is the primary unauthenticated marketing path).
- **Surface:** routine / demo seed. Affects ROU-02 (FAIL) + ROU-11/12/13/26 (BLOCKED display) + ACC-09 demo quality.
- **Repro:** Enter demo (`/?demo=1` or "Подивитись приклад") -> hub Routine card shows "Рутина 5/5, Серія 14 днів" -> click into Routine module -> 0/0 habits, "Серія 0 днів", empty state "Почни з однієї звички" + auto first-run dialog.
- **Root cause:** `seedRoutine` writes the demo state to legacy LS key `hub_routine_v1` via `writeJSON(ROUTINE_STATE_KEY, state)` (apps/web/src/core/onboarding/seedDemoData/seedRoutine.ts:104). After the Stage-8 SQLite tombstone migration (PR #057r), `loadRoutineState()` (apps/web/src/modules/routine/lib/routineStorage.ts:91) reads ONLY from the SQLite warm cache (`getCachedSqliteRoutineState()`/`getCachedSqliteCompletions()`) and never reads `hub_routine_v1`. Seeded blob lands in a dead key -> routine renders empty. Hub Routine card still reads `ROUTINE_QUICK_STATS_KEY` from LS -> shows seeded 5/5.
- **Fix direction (Phase 3):** `seedRoutine` must seed through the SQLite path `loadRoutineState` reads — call `saveRoutineState(state)` (sets SQLite warm cache + dual-write) or `setCachedSqliteRoutineState`/`setCachedSqliteCompletions`, instead of `writeJSON`. Related: tombstone read-side regression history.
- **Note:** Not a real-user data-loss bug — real/local-no-account users write habits through the module (which writes the SQLite cache it reads; verified ROU-05/03 PASS). Demo-seed-only divergence.

## D-002 — CONFIRMED: seedFizruk / seedNutrition same SQLite-tombstone mismatch [VISUALLY CONFIRMED]
- **Confirmed via browser:** Demo Fizruk module shows "План порожній / ще немає шаблонів / Серія 0 / Тиждень 0" while hub card says "Фізрук: 2 трен., Серія 5 днів". Demo Nutrition module shows "Склад порожній" + empty ккал/Б/Ж/В goal inputs while hub card says "1250 ккал, Ціль 2200 ккал". Same root cause as D-001 across all 3 SQLite-migrated modules (routine/fizruk/nutrition). Finyk is the only module whose demo data surfaces in-module.
- **Code-evidence:** `seedFizruk` writes `FIZRUK_WORKOUTS_KEY`/`FIZRUK_MEASUREMENTS_KEY`; `seedNutrition` writes `NUTRITION_LOG_KEY`/`NUTRITION_WATER_KEY` via `writeJSON` (legacy LS). `apps/web/src/modules/nutrition/lib/nutritionStorage.test.ts:225` asserts `localStorage.getItem(NUTRITION_LOG_KEY)` is null after persist — i.e. SQLite-migrated, no longer reads that raw LS key.
- **Fix:** all four seeders must seed through the SQLite warm-cache/dual-write path the modules read, not legacy `writeJSON(*_KEY)`. One coherent Phase-3 fix.

## ✅ FIX APPLIED & VERIFIED (Phase 3) — D-001 + D-002
- **Change:** added synthetic demo userId fallback to the 3 module SQLite read-boot hooks so the residual `*_v1` LS->SQLite drain (which warms the global read cache) runs in demo mode (demo bypasses auth -> no real userId).
  - `apps/web/src/core/onboarding/onboardingGate.ts` — new `export const DEMO_LOCAL_USER_ID = "demo-local"`.
  - `apps/web/src/modules/routine/hooks/useSqliteReadBoot.ts` — `userId = user?.id ?? (isDemoActive() ? DEMO_LOCAL_USER_ID : null)` + AI-CONTEXT marker.
  - `apps/web/src/modules/fizruk/hooks/useFizrukSqliteReadBoot.ts` — same.
  - `apps/web/src/modules/nutrition/hooks/useNutritionSqliteReadBoot.ts` — same.
- **Blast radius:** activates ONLY when `isDemoActive()` AND no real userId. Authenticated + local-no-account paths unchanged. Real users read under their own id and never see `demo-local` rows.
- **Browser-verified (demo /?demo=1):**
  - Routine: module now shows **5/5, Серія 14 днів** + all 5 seeded habits (was 0/0 empty). Matches hub card.
  - Fizruk: now shows **2 тренування** this week + Останні тренування (Присідання 5.2т, Підтягування 860кг) + PR badge (was empty).
  - Nutrition: goals now **2200 ккал / Б140 Ж70 В240** + macro breakdown (was blank). Matches hub card.
- **Tests:** `useNutritionSqliteReadBoot.test.tsx` 3/3 pass. All 4 changed files type-clean.
- **Pre-existing (NOT mine):** `pnpm --filter @sergeant/web typecheck` fails on `src/core/lib/chatActions/fizrukActions/workouts.test.ts` (StartWorkout/FinishWorkout/PlanWorkoutAction missing `type` prop) on pristine origin/main HEAD 4ca376927 — unrelated to this fix.
- **Status:** D-001 FIXED, D-002 FIXED. ROU-02/FIZ-01/NUT-01 + the ~22 BLOCKED-by-seed display stories are now unblocked -> Phase 4 retest.

## Strategic impact
D-001/D-002 BLOCK live-testing of ~25 display/history-heavy stories (charts, heatmaps, analytics, PR boards, weekly tables) that need seeded history. **Phase 3 fixes seeds FIRST**, then re-seed -> Phase-2 display testing becomes possible -> Phase-4 retest.

## D-003 — Mixed-language exercise / muscle labels in Fizruk [NEW, minor, scope TBD]
- **Observed (demo Progress page):** PR board + muscle-volume list mix Ukrainian, English and Russian: "Становая тяга" (RU, should be UA "Станова тяга"), "squat" / "bench_press" / "ohp" (English ids shown as names), muscle groups "shoulders" / "back" / "chest" / "glutes" untranslated next to UA "Квадрицепс" / "Трицепс" / "Передпліччя".
- **Severity:** Low (cosmetic / localization). App is Ukrainian-only (UA copy style guide) so English/Russian labels are off-brand.
- **Scope DETERMINED:** NOT a demo-seed bug. `seedFizruk` stores correct `nameUk` ("Станова тяга" UA) + `exerciseId` (en) + muscle groups as en keys (chest/shoulders/back/glutes). But the Progress PR board + muscle-volume display resolve names from the **exercise catalog / muscle-label map (read from SQLite), NOT the stored nameUk** → shows raw exerciseId ("squat"/"bench_press"/"ohp") when the catalog lacks the entry, and Russian "Становая тяга" for deadlift (catalog name is RU, not UA), and untranslated en muscle keys. **This affects REAL authenticated users too** (they read fizruk from SQLite the same way) — it is pre-existing, merely surfaced in demo by the D-002 fix (which routes demo through the same SQLite read path). NOT a regression from the fix.
- **Fix direction (separate follow-up):** (a) localize catalog deadlift name RU->UA; (b) add UA labels for muscle groups chest/shoulders/back/glutes/triceps/biceps/hamstrings/forearms; (c) PR board / muscle list should fall back to stored `nameUk` (or a catalog UA lookup) instead of raw exerciseId. Low priority / cosmetic.

## Module-create paths verified WORKING (defects are seed-side, not module-side)
- Finyk: add manual expense persists + appears (FIN-02). Routine: add habit + toggle persist + appear + update stats/streak (ROU-05/03). The modules' own write->read paths are sound; only the demo SEEDER is out of sync with the SQLite migration.

## ENV NOTE (2026-06-27)
- Original ephemeral worktree `gifted-snyder-a3f621` was de-registered from git (pruned) and gutted mid-run by an external process; QA artifacts lost from disk and rebuilt here in fresh worktree `qa-feature-audit` (branch worktree-qa-feature-audit, from clean origin/main). All Phase-1/2 results reconstructed from session context.
