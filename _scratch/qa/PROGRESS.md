# QA Loop — Progress Tracker

> Single-source loop state. Not a governance doc. Rebuilt in worktree `qa-feature-audit` after the original worktree was pruned mid-run.

## Goal (4-phase loop)
1. **Phase 1 — Inventory:** every feature -> user story + expected behaviour (from code) -> canonical CSV. ✅ DONE (200 stories).
2. **Phase 2 — Test:** run each story, document errors. IN PROGRESS (115/200 statused).
3. **Phase 3 — Fix:** fix every logistical/UX error (start with demo-seed D-001/D-002).
4. **Phase 4 — Retest:** re-run every behaviour post-fix.

## Current phase: **3 done for D-001/D-002 → back to 2 (finish pending) + 4 (retest unblocked)**

## ✅ PHASE 3 — D-001/D-002 FIXED & browser-verified (see DEFECTS.md)
- Fix: demo-id fallback in 3 SQLite read-boot hooks + DEMO_LOCAL_USER_ID in onboardingGate.ts.
- Verified in demo: Routine 5/5+14d streak+5 habits; Fizruk 2 workouts+PR; Nutrition goals 2200kcal. All match hub cards.
- nutrition hook test 3/3 pass; 4 changed files type-clean. (Pre-existing unrelated typecheck fail in chatActions/workouts.test.ts on origin/main — NOT mine.)
- 19 rows now FixStatus+ready-retest (3 FAIL→fixed, 16 BLOCKED-by-seed→unblocked).
- NOT committed (per no-commit-without-ask rule); changes live on branch worktree-qa-feature-audit.

## Phase 2 status legend
- **PASS** interaction verified. **RENDER** renders correctly, not deep-interacted. **BLOCKED** needs backend(:3000 down)/AI/camera/OAuth/Pro/seed-history. **FAIL** real defect (-> Phase 3).

## Progress: 115/200 statused (PASS 28 · RENDER 21 · BLOCKED 63 · FAIL 3 · pending 85)
| Surface | Tested | Notes |
| --- | --- | --- |
| finyk | 20/35 | core works; pending = FIN-04,06,12-18,22,25,26,28,34 |
| fizruk | 14/30 | FIZ-01 FAIL (D-002); rest BLOCKED-history or create-flow pending |
| nutrition | 18/33 | NUT-01 FAIL (D-002); pending = create-flows |
| routine | 24/37 | create/toggle/calendar PASS; ROU-02 FAIL (D-001) |
| account | 16/25 | most BLOCKED (auth backend); demo/onboarding PASS |
| hub | 22/40 | dashboard PASS; profile/sessions/sync BLOCKED |

## ⚠️ Methodology
- Backend (:3000) NOT running; all `/api/*` 502s + manifest dev syntax error EXPECTED, not defects.
- Demo re-seeds on hard reload — test mutations via IN-APP SPA nav only.
- Enter clean demo via `/?demo=1` (seeds + lands on `/`); then SPA-nav into modules.
- Number inputs need real keystrokes (pressSequentially), not always `.fill()`.
- Update CSV via `node _scratch/qa/apply-results.mjs <batch.json>`.

## 🐞 Defects: see DEFECTS.md
- D-001 [CONFIRMED High] demo Routine empty vs hub 5/5 (seed writes dead hub_routine_v1, loadRoutineState SQLite-only).
- D-002 [CONFIRMED] same for fizruk + nutrition. All 3 SQLite-migrated modules; finyk exempt. ONE Phase-3 fix (route seeders through SQLite).

## 85 pending = demo-reachable interactive create/edit/toggle/settings flows (live-test next).

## Est. total loop iterations ≈ 13-16 (env disruption added ~1). Remaining: ~3 Phase-2 live + ~2-3 Phase-3 fix + ~2-3 Phase-2bis(unblocked display) + ~2 Phase-4.

## ENV: now in worktree qa-feature-audit (E:\.claude\Sergeant\.claude\worktrees\qa-feature-audit), branch worktree-qa-feature-audit. Reinstalling deps + db-schema, then restart vite :5173.

## Live tally: 160/200 statused — PASS 45 · RENDER 57 · BLOCKED 55 · FAIL 3(fixed) · pending 40 | Phase4 retested 20
## Covered this push: hub settings (all 3 tabs → HUB-09/10/11/14/15/24/25/26/33/38/39/40 + ROU-32/33/34), finyk Overview/Assets (FIN-12/14/15/16/17/26), nutrition Журнал+AddMealSheet (NUT-02/04/13/15/16/22/23/24/26/32/33), fizruk WorkoutsHome (FIZ-02/03/04/06/11/17/18/27), routine (ROU-04/07/14/21).
## Remaining 40 pending: mostly auth-flow (ACC create/onboarding), finyk create (FIN-04/06/13/18/22/25/28/34), routine create (ROU-06/08/09/10/30/37), fizruk body/measure create (FIZ-07/08/09/10/12/13/21/22/23), nutrition (NUT-03... AI), hub (HUB-04/18/31/32/36).
## Defects: D-001 FIXED, D-002 FIXED, D-003 (mixed-lang exercise/muscle labels, pre-existing catalog, low-pri, logged not fixed).
## Phase-4 retest PASS: routine stats/heatmap/leaders (ROU-11/12/13), fizruk progress/PR/recent (FIZ-14/15/26).
## Remaining: 85 pending Phase-2 create-flows (finyk display FIN-12..18, hub settings HUB-09..40, nutrition/fizruk create) + nutrition display retest (NUT-25/26/29).

## Loop log
- iter 1-2: inventory 200 stories (Phase 1 done).
- iter 3: finyk core tested (20 rows). Demo-reseed methodology learned.
- iter 4: routine tested; FOUND D-001 (root-caused). hub/account batch.
- iter 5: confirmed D-002 (fizruk+nutrition empty in demo). Triage batch -> 115/200 statused.
- iter 6 (ENV RECOVERY): original worktree pruned/gutted mid-run; QA artifacts lost. Created fresh worktree qa-feature-audit, rebuilt all artifacts (CSV+DEFECTS+PROGRESS+script) from context. Reinstalling to resume.
