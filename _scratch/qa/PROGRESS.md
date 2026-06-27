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

## ✅ PHASE 2 COMPLETE + LIVE-BACKEND PASS: 200/200 — PASS 63 · RENDER 84 · BLOCKED 50 · FAIL 3(fixed) | Phase4 retested 40
## LIVE BACKEND brought up (Postgres docker + server :3000 + web :5173, .env with LLM_*=stub): unblocked 21 BLOCKED→PASS/RENDER.
## Real-account cluster verified (not demo): ACC-01 sign-up + ACC-02 login + ACC-07 logout(server 200) + ACC-11/13/25 onboarding/FTUX + ACC-18 pricing + ACC-19 paywall(503 graceful) + ACC-21 plan-status + ACC-22 waitlist + HUB-16/17/18/19/20/21/22 profile/sessions/biometrics(real writes persisted) + HUB-27 whats-new + HUB-02 AI-chat(graceful error, needs key).
## NEW DEFECT D-004: logout spinner hangs in demo+auth mixed state (server sign-out 200, UI never completes) — see DEFECTS.md.
## AI cluster tested with temporary real ANTHROPIC_API_KEY (LLM_*=anthropic): HUB-02 chat PASS — streaming + tool-use READ (read real habit stats by id) + synthesis all work end-to-end. AI quota enforces live (coach 429 after free 5/day exhausted → HUB-07 RENDER).
## NEW DEFECT D-005: AI chat marks habit complete (tool returns success + 'Усі звички закриті 🎉') but completion NOT reflected in routine module (0/1 after fresh reload) — dual-write bypass for habit-completion path. See DEFECTS.md.
## Remaining 50 BLOCKED = genuinely external (cannot test in local dev): Monobank OAuth (FIN-01/24/27/30/35), camera/mic (NUT-03/12, FIN-33, FIZ-19), Google/Apple OAuth (ACC-05/06), paid AI key (chat/coach/photo/meal-plans: FIN-32, NUT-07/08/09/10/21/29, HUB-07/08), SW-gated sync drain (FIN-21/FIZ-30/NUT-20/ROU-29), FTUX edge states + recovery-history-dependent fizruk (FIZ-05/16/20/24/28).
## Final push (40→0 pending): fizruk active-workout flow (FIZ-02/04/07/08/09/10/21/22/23 + FIZ-24 recovery retest) + body log (FIZ-12/13); finyk analytics+tx (FIN-04/06/18/22/25/28/34); routine habit-detail CRUD (ROU-06/07/08/09/10/37); nutrition source/prefs (NUT-14/18); hub reports+cross-module (HUB-04/27/31/32/36); account FTUX/backend (ACC-08/12-16/19/23/25 → BLOCKED, honest env limits).
## BLOCKED 71 = genuine env limits: backend :3000 down (auth/AI/sync/profile), camera/mic, OAuth, Pro-gating, Monobank, fresh-FTUX-only onboarding states. NOT defects.
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

## FIZRUK recovery cluster CLOSED (live-backend, real workout history): logged Присідання 100×5 via retroactive entry → unblocked FIZ-05 (exercise detail/PR/load-calc), FIZ-16 (muscle atlas + recovery readiness), FIZ-20 (last-session hint), FIZ-24 (recovery conflict 'Рано навантажувати'), FIZ-28 (recovery focus), FIZ-10/11 retests. Fizruk now only FIZ-19 (voice/mic) + FIZ-30 (SW-sync) BLOCKED.
## TALLY after fizruk: PASS 73 · RENDER 87 · BLOCKED 37 · FAIL 3 · Phase4 44.

## MONOBANK cluster CLOSED (real token + cloudflared tunnel): user provided real Mono token. Webhook-based connect needs public URL → spun up cloudflared quick-tunnel → PUBLIC_API_BASE_URL=tunnel → connect SUCCESS (mono_connected accountsCount=6). FIN-01 PASS (connect), FIN-27 PASS (6 accounts + credit detection: black 40k limit → −39999₴ debt, cards +1378₴), FIN-30 PASS (error UI), FIN-15 PASS (net worth −38621₴), FIN-35 RENDER (backfill running, Monobank rate-limit 1/60s). SECURITY: tunnel torn down, PUBLIC_API_BASE_URL reverted, mono_connection row + stored token WIPED from test DB after. User to revoke token in Monobank app.
## TALLY after Monobank: PASS 77 · RENDER 88 · BLOCKED 32 · FAIL 3 · Phase4 50. BLOCKED now overwhelmingly: voice/mic (4), camera (2), SW-sync (4), OAuth (2), Resend-email auth (ACC-03/04), push (ROU-31), FTUX edge (ACC-14/15/16/17/23/24), misc edge.
