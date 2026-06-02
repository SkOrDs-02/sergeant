# Sergeant v2 — Execution Status (live tracker)

> **Last validated:** 2026-05-21 by @Skords-01 (v2 close-out batch merged — #3055 doc closure, #3056 Fizruk dashboard glass, #3057 Finyk slug fix, #3058 Hub glass batch. **Redesign-v2 fully closed.** Next pickup: v2 retrospective + Phase 7 prioritization session).
> **Next review:** v2 retrospective scheduled (Phase 7 product-call session).
> **Status:** Active.
> **Companion docs:** [`execution-brief.md`](./execution-brief.md) (orchestration contract — how to run the work) · [`execution-plan.md`](./execution-plan.md) (intent — what we plan to do) · [`governance.md`](./governance.md) (governance) · [`migration.md`](./migration.md) (BEFORE/AFTER tokens) · [`retrospective-2026-05-21.md`](./retrospective-2026-05-21.md) (v2 retrospective) · [`handoff-package/`](./handoff-package/) (canvas mockups + locked decisions, 2026-05-17).

## Як цей doc працює

Цей файл — **live status**, не plan. План (`redesign-v2-execution-plan.md`) каже **що ми хочемо зробити**. Цей — **що насправді зроблено, що відкладено, які знайдені розриви плану та реальності**. Оновлюється наприкінці кожної фази у тому ж PR, що закриває фазу.

Якщо ти агент, що приходить cold у редизайн-роботу — починай **з цього файлу**, не з плана. Він дає мінімальний context: де ми, що було скоплено, які risk'и активні.

---

## Phase status matrix

| Phase                      | Status          | Branch / PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Acceptance                                                                                                                           |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 — Foundation       | ✅ Shipped      | [#2952](https://github.com/Skords-01/Sergeant/pull/2952) — `feat/redesign-v2/phase-0-foundation`                                                                                                                                                                                                                                                                                                                                                                                                                                        | Typecheck clean, 8/8 rule tests pass, additive only                                                                                  |
| Phase 1 — Quick wins       | ✅ Shipped      | [#2953](https://github.com/Skords-01/Sergeant/pull/2953) — squash-merged → main                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Typecheck clean (0 new errors); Chrome MCP smoke verified on https://sergeant.vercel.app — all features functional, 0 console errors |
| Phase 2 — Polish migration | ✅ Shipped      | Wave 1 (5 PRs merged 2026-05-18): #2969 P2 primitives, #2970 Finyk C3, #2971 ModuleBottomNav v2, #2974 Fizruk C4, #2976 Atlas hero. Wave 2 (2 PRs merged 2026-05-18/19): [#3003](https://github.com/Skords-01/Sergeant/pull/3003) Nutrition V2, [#3005](https://github.com/Skords-01/Sergeant/pull/3005) Routine V1.                                                                                                                                                                                                                    | Both waves green                                                                                                                     |
| Phase 3 — Friction removal | ✅ Shipped      | 6 PRs merged 2026-05-19: [#3009](https://github.com/Skords-01/Sergeant/pull/3009) F1, [#3011](https://github.com/Skords-01/Sergeant/pull/3011) F2+W2, [#3012](https://github.com/Skords-01/Sergeant/pull/3012) F3, [#3013](https://github.com/Skords-01/Sergeant/pull/3013) F4, [#3014](https://github.com/Skords-01/Sergeant/pull/3014) F6, [#3015](https://github.com/Skords-01/Sergeant/pull/3015) F5a. Deferred to backlog: F5b ManualExpenseSheet localStorage migration.                                                          | All shipped. F5b backlogged with localStorage migration plan                                                                         |
| Phase 4 — Value + Wow      | ✅ Shipped      | 3 PRs merged 2026-05-19: [#3032](https://github.com/Skords-01/Sergeant/pull/3032) 4b W1+W3+W4 celebrations, [#3034](https://github.com/Skords-01/Sergeant/pull/3034) 4c V3+V5 Hub Insights, [#3035](https://github.com/Skords-01/Sergeant/pull/3035) 4a V4 outcome empty states. V1+V2 pre-shipped in Wave 2 (#3003+#3005), W2 bundled into Phase 3 #3011 — у Phase 4 не дублювалися.                                                                                                                                                   | All 3 PRs merged                                                                                                                     |
| Phase 5 — Insights wiring  | ✅ Shipped      | 5 PRs merged 2026-05-19: [#3038](https://github.com/Skords-01/Sergeant/pull/3038) 5b Fizruk, [#3039](https://github.com/Skords-01/Sergeant/pull/3039) 5a Finyk, [#3040](https://github.com/Skords-01/Sergeant/pull/3040) 5d Nutrition, [#3041](https://github.com/Skords-01/Sergeant/pull/3041) 5c Routine, [#3045](https://github.com/Skords-01/Sergeant/pull/3045) 5e Hub aggregator. 9 triggers + `useAllInsights()` aggregator with `showOn` filter. F5b ManualExpenseSheet localStorage migration spawned in flight (separate PR). | All shipped. F5b in flight as parallel cleanup                                                                                       |
| Phase 6 — Expensa delights | ✅ Shipped      | 5 PRs merged 2026-05-19/20: [#3047](https://github.com/Skords-01/Sergeant/pull/3047) 6.5 Routine StreakFlame, [#3048](https://github.com/Skords-01/Sergeant/pull/3048) 6.1 Finyk category pill, [#3049](https://github.com/Skords-01/Sergeant/pull/3049) F5b ManualExpenseSheet emoji→slug, [#3051](https://github.com/Skords-01/Sergeant/pull/3051) 6.2+6.3 manual expense hero + AI suggestion, [#3053](https://github.com/Skords-01/Sergeant/pull/3053) 6.4 AI-source badge.                                                         | All 5 shipped. 6.5b/6.6/6.7 deferred to Phase 7 (post-v2 cycle) per plan                                                             |
| Phase 7 — Mobile RN parity | 🚫 Out of scope | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Свідомо відкладена — окремий стратегічний цикл                                                                                       |

### Phase 0 — Foundation (tasks)

| #   | Task                                              | Status | Notes                                                                                                                                                                                                                            |
| --- | ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `.text-style-display-hero` (Manrope 800)          | ✅     | `packages/design-tokens/tailwind-preset.js`. Additive — `.text-style-display` залишений на 700                                                                                                                                   |
| T2  | `--c-chart-{module}` CSS vars × 4 themes          | ✅     | `apps/web/src/styles/theme.css`: `:root` + `.dark` + `html.hc` + `html.hc.dark`. Дзеркалить Tailwind preset values                                                                                                               |
| T3  | `Sheet` `variant="glass"`                         | ✅     | Default лишається `default`. `GlassVariant` story додано                                                                                                                                                                         |
| T4  | v1 gradient `@deprecated` + `no-v1-gradient` rule | ✅     | Rule severity `error` — recon показав zero consumers, безпечно                                                                                                                                                                   |
| T5  | `prefer-text-style` → `error` для `modules/**`    | ✅     | Baseline cleanup [#3070](https://github.com/Skords-01/Sergeant/pull/3070) (65 files, 101 ins/100 del, 1 TODO escape у `PushupsWidget.tsx:124` для responsive `sm:text-sm`) + severity flip окремим follow-up. Closed 2026-05-21. |
| T6  | `min-h-touch-target` + `[data-touch-target]`      | ✅     | Tailwind utility (always-on) + opt-in attribute selector у `mobile.css`                                                                                                                                                          |

### Phase 1 — Quick wins (tasks)

| #   | Task                                           | Status           | Notes                                                                                                                                                                   |
| --- | ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | FAB `v2-{module}` на 4 module entries          | ⚠️ Reduced scope | Тільки Finyk (inline `<button>` → `<FloatingActionButton variant="v2-finyk">`). Інші 3 модулі не мали FAB взагалі — додавання поза «quick wins» (див. Divergences §1.1) |
| 1.2 | M4 synergy — `--bottom-nav-height` на Hub root | ✅               | Hub насправді ВЖЕ wrapped у MeshBackground; додав `style` prop. Закрило M4 + M6 одним edit                                                                              |
| 1.3 | M1 iOS Capacitor JS-detect                     | ✅               | `main.tsx` + `theme.css`. Replaces deprecated `@supports (-webkit-overflow-scrolling: touch)`                                                                           |
| 1.4 | M2 HubBottomNav safe-area math fix             | ✅               | `mb-3` → wrapper `padding-bottom: calc(...)`                                                                                                                            |
| 1.5 | M5 KeyboardAccessory chip `min-h-touch-target` | ✅               | Pairs with T6 token                                                                                                                                                     |
| 1.6 | M3 `motion-safe:backdrop-blur-{md,xl}`         | ✅               | HubBottomNav + ModuleBottomNav                                                                                                                                          |
| 1.7 | Inline close-SVG → `<Icon name="close">`       | ✅               | Sheet + Modal. Icon registry уже мав `close` glyph                                                                                                                      |

### Phase 2 — Polish migration (tasks)

Wave 1 = 4 паралельні sub-PRs + 1 follow-up (shipped 2026-05-18). Wave 2 = 2 паралельні sub-PRs (Routine V1 + Nutrition V2), unblocked після #2969 merge — spawn'нуто 2026-05-19 у worktree-isolated web-agents.

| #     | Task                                          | Status               | Notes                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.0   | P2 hero primitives bundle (prework)           | ✅ Shipped [#2969]   | NEW PR — handoff doc припускав що `HeroValueLine` / `KpiRowCompact` / `CounterReveal` / `MacroBarRow` шипилось у Phase 0; реально не шипилось. ProgressRing extend з `variant` prop тонує stroke через `--c-chart-{module}` (T2). Wave 2 (Routine + Nutrition) blocker.                                                                                                                                      |
| 2.1   | Finyk overview HeroCard (C3)                  | ✅ Shipped [#2970]   | Per handoff §2.1. `border-l-4 + bg-finyk/[.06]` → `<Card prominence="hero" module="finyk">` + `--hero-grad-finyk` wash. T1 `.text-style-display-hero` на day-budget. Typecheck clean.                                                                                                                                                                                                                        |
| 2.2   | Routine CalendarHero (V1)                     | 🚀 Open [#3005]      | Wave 2 (2026-05-19). `Card variant=routine padding=lg` + 4 stat tiles → `Card prominence=hero module=routine radius=r-2xl` + `HeroValueLine` (narrative + `CounterReveal` + `DayProgressRing`) + `KpiRowCompact` (4 compact items). Eslint-disable `no-eyebrow-drift` removed. 49 ins / 69 del. Spawned in parallel with #3003 via worktree-isolated web-agents.                                             |
| 2.3   | Fizruk Dashboard HeroCard (C4)                | ✅ Shipped [#2974]   | Реальний target — `components/dashboard/HeroCard.tsx`, не `pages/Dashboard.tsx` (recon помилився, див. §2.3 divergence). Створено shared `HeroShell` sub-component — 4 state-варіанти (Active/Today/Upcoming/Empty) тепер прості обгортки.                                                                                                                                                                   |
| 2.3.1 | Fizruk Atlas hero (follow-up)                 | ✅ Shipped [#2976]   | Той самий duplication-pattern на Atlas page → інлайнова копія HeroShell pattern (не reused export). Spawn-task chip → PR за один turn.                                                                                                                                                                                                                                                                       |
| 2.4   | Nutrition Dashboard (V2)                      | ✅ Shipped [#3003]   | Wave 2 (2026-05-19). 4 zero macro plates → `Card prominence=hero module=nutrition radius=r-2xl` + `ProgressRing variant=nutrition` (kcal) + `MacroBarRow` (protein/fat/carbs). `!hasGoal` outcome CTA fallback. Removed inline `ring()` helper + `chartHex` import + `MACRO_DEFS` + `pct()`. 106 ins / 180 del. File at `components/NutritionDashboard.tsx` (NOT `pages/` — recon error #2 in this session). |
| 2.5   | ModuleBottomNav v2 unification (decision 3.2) | ✅ Shipped [#2971]   | Окремий PR per locked decision. Shape match HubBottomNav v2. Module-tinted active pill (`bg-{module}-strong`). Routine FAB як sibling. 10px→12px labels (Hard Rule #16). v1 top-pill indicator + icon glow видалено.                                                                                                                                                                                         |
| 2.6   | Codemod для MAJOR module lists (~15 files)    | ⚠️ Scope collapsed   | Recon показав реальний codemod scope = ~3 files (не ~15), всі вже покриті 2.1 + 2.3 + 2.3.1. Окремий sub-PR не потрібен.                                                                                                                                                                                                                                                                                     |
| 2.7   | Fizruk workout-list + stat tiles glass        | 📦 Spawn-task active | Handoff §2.3 additional — defer'нуто з #2974 щоб C4 hero scope лишався tight. Chip активний.                                                                                                                                                                                                                                                                                                                 |

[#2969]: https://github.com/Skords-01/Sergeant/pull/2969
[#2970]: https://github.com/Skords-01/Sergeant/pull/2970
[#2971]: https://github.com/Skords-01/Sergeant/pull/2971
[#2974]: https://github.com/Skords-01/Sergeant/pull/2974
[#2976]: https://github.com/Skords-01/Sergeant/pull/2976
[#3003]: https://github.com/Skords-01/Sergeant/pull/3003
[#3005]: https://github.com/Skords-01/Sergeant/pull/3005

### Phase 3 — Friction removal (tasks)

Phase 3 shipped як 6 паралельних sub-PRs (2026-05-19). 5 merged, F5a open, F5b deferred.

| #     | Task                                             | Status             | Notes                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1    | Nutrition AddMealSheet skip source step          | ✅ Shipped [#3009] | Skip when `mealTemplates.length === 0 && !initialMeal && !photoResult`. Backtrack link "Обрати джерело ↑" rendered when user landed via auto-skip. Implemented via `useEffect` + `useRef` (not `useMemo` per spec) to keep open-time reset logic single-source.                                                                                             |
| F2+W2 | Fizruk set-delete undo + Workout Win celebration | ✅ Shipped [#3011] | Bundled. `useToast()` + `useCelebration()` hoisted to `ActiveWorkoutPanel`. F2: snapshot-restore on set delete via `onDeleteSet` prop. W2: `useCelebration().achievement()` fires on save-last-set (optimistic, post-save). 383 ins / 303 del.                                                                                                              |
| F3    | Routine completion note collapse                 | ✅ Shipped [#3012] | `noteExpanded: Record<string, boolean>` keyed via existing `completionNoteKey(habitId, date)`. Auto-expand if `savedValue.length > 0`. Collapse-on-clear via `onBlur` (optional per spec — implemented for UX completeness).                                                                                                                                |
| F4    | Fizruk exercise type pill-segmented              | ✅ Shipped [#3013] | Native `<select>` → existing shared `Segmented` primitive (variant=`fizruk`, style=`solid`). Pills shortened to "Силова"/"Час"/"Дист" for narrow screens; full labels in `title`+`ariaLabel`. Space/Enter activation (not full arrow-roving — matches existing Segmented call-sites).                                                                       |
| F5a   | Engine emoji → typed `IconName`                  | ✅ Shipped [#3015] | `insightsEngine.ts` (6) + `recommendationEngine.ts` (11) + `HubReports.tsx` (consumer) + `TodayFocusCard.tsx` (4th file caught by agent — rendered `{focus.icon}` as raw text) + 2 tests. 20 emoji literals replaced. `Rec.icon` field name kept (defined in `packages/insights/`, out of web scope). `searchSources.ts` excluded (different `Hit` schema). |
| F5b   | ManualExpenseSheet category labels               | 📦 Backlogged      | Category strings persist in localStorage with leading emoji ("🍴 їжа"). Has existing legacy "pre-emoji" upgrade-path. Risky migration — separate PR with backward-compat upgrade and persisted-data migration plan.                                                                                                                                         |
| F6    | MacrosEditor kcal-edit unlink bypass             | ✅ Shipped [#3014] | `isLinked = Boolean(pickedFood) && Number(pickedGrams) > 0`. When linked && key !== "kcal" → confirm; else → apply directly. Required threading `pickedGrams` prop through `AddMealSheet`. Hint banner updated to surface kcal-free policy.                                                                                                                 |

[#3009]: https://github.com/Skords-01/Sergeant/pull/3009
[#3011]: https://github.com/Skords-01/Sergeant/pull/3011
[#3012]: https://github.com/Skords-01/Sergeant/pull/3012
[#3013]: https://github.com/Skords-01/Sergeant/pull/3013
[#3014]: https://github.com/Skords-01/Sergeant/pull/3014
[#3015]: https://github.com/Skords-01/Sergeant/pull/3015

### Phase 4 — Value + Wow integration (tasks)

Phase 4 shipped як 3 паралельні sub-PRs (2026-05-19). 2 merged, 1 open. V1+V2 pre-shipped у Wave 2 (#3003 + #3005), W2 bundled у Phase 3.2 #3011 — у Phase 4 не дублювалися.

| #   | Task                                    | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | P1+P2 primitives                        | ✅ Pre-shipped     | Skip — primitives (`CounterReveal`, `HeroValueLine`, `KpiRowCompact`, `MacroBarRow`, `ProgressRing variant`) shipped у [#2969](https://github.com/Skords-01/Sergeant/pull/2969) Phase 2.0 prework. Plan correction документована у [`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md) §D1.                                                                                                                                           |
| 4.2 | V4 ModuleEmptyState outcome framing     | ✅ Shipped [#3035] | `MODULE_EMPTY_CONFIG` titles flipped до outcome questions ("Куди йдуть твої гроші?" замість "Почни вести фінанси"). Added `goalContext?` prop + local `resolveGoalAwareDesc` helper (cross-package import bottleneck — `getGoalAwareDesc` живе у `core/onboarding/` що shared/ не може import'ити). Тільки Finyk має active call-site; інші 3 модулі використовують raw `EmptyState`.                                                                |
| 4.3 | V1+V2 HeroValueLine wiring              | ✅ Pre-shipped     | V1 (Routine narrative) — shipped у Wave 2 [#3005](https://github.com/Skords-01/Sergeant/pull/3005). V2 (Nutrition no-goals outcome CTA) — shipped у Wave 2 [#3003](https://github.com/Skords-01/Sergeant/pull/3003). У Phase 4 не дублювалися.                                                                                                                                                                                                       |
| 4.4 | W1+W3+W4 wow celebrations               | ✅ Shipped [#3032] | W1: Finyk `HeroCard.tsx` networth + day-budget wrapped у `CounterReveal entranceFrom=0`. W3: `GoalBudgetCard.tsx` fires `useCelebration().goalCompleted(theme="finyk")` з in-memory `useRef` dedupe per goal id. W4: `NutritionDashboard.tsx` `useEffect` fires `toast.success("Денну норму виконано")` коли kcal ratio ∈ [0.95, 1.05]. W2 (Workout Win) було bundled у Phase 3.2 #3011.                                                             |
| 4.5 | V3 HubInsightsBlock value subtitle      | ✅ Shipped [#3034] | Subtitle composition: `rest[0]!.title` (perший `Rec` з `useDashboardFocus`) → real text "Поповни бюджет на харчування" замість generic count. Fallbacks: loading → error → digest → nudge → "AI-порада на день". Smart-expand: `insightsDefaultOpen` обчислено у `useHubDashboardState` ПЕРЕД маунтом `CollapsibleSection` (lazy useState не дозволяє useEffect post-mount). FTUX detector: `isFirstRealEntryDone` з `core/onboarding/vibePicks.ts`. |
| 4.6 | V5 HubReports insight threshold ≥2 → ≥1 | ✅ Shipped [#3034] | `HubReports.tsx:545` змінено `insights.length >= 2` → `>= 1`. Bundled у тому ж PR що V3 (логічно пов'язано).                                                                                                                                                                                                                                                                                                                                         |

[#3032]: https://github.com/Skords-01/Sergeant/pull/3032
[#3034]: https://github.com/Skords-01/Sergeant/pull/3034
[#3035]: https://github.com/Skords-01/Sergeant/pull/3035

### Phase 5 — Insights wiring (tasks)

Phase 5 shipped як 4 паралельні PRs по модулях (2026-05-19). 9 InsightCard triggers wire dormant primitive (0 consumers since PR-7a → live на всіх 4 модулях). Hub-level aggregation deferred як follow-up.

| #   | Triggers (count)                                            | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5a  | Finyk: coffee-limit, budget-overrun, recurring-detected (3) | ✅ Shipped [#3039] | Detection hooks under `modules/finyk/hooks/`. Wired через новий `FinykInsightsBlock.tsx` між `HeroCard` та `MonthPulseCard` на Overview. **Divergence:** `coffee` slug немає у `MCC_CATEGORIES` → fallback на `restaurant` (MCC 5812/5813/5814 cafés). Exported `COFFEE_CATEGORY_SLUG` константу для override. Recurring detection делегує 28-day window до існуючого `detectRecurring` helper.                                                                                                                                                                                                                                                                                    |
| 5b  | Fizruk: rest-day-overdue, pr-pending (2)                    | ✅ Shipped [#3038] | Detection hooks under `modules/fizruk/hooks/`. Wired між `HeroCard` та `StatusStrip` у `Dashboard.tsx`. **Divergence:** немає "next planned exercise" concept без orchestrator join → fallback на (1) active in-progress workout (real-time nudge); (2) most-recent completed workout. PR detection = max raw `weightKg` ever logged per exercise (не Epley 1RM); target = PR + 2.5 kg plate increment.                                                                                                                                                                                                                                                                            |
| 5c  | Routine: streak-record-pending, todo-evening (2)            | ✅ Shipped [#3041] | Detection hooks under `modules/routine/hooks/`. Wired у `RoutineCalendarPanel.tsx`. **Divergence:** `longestStreak` field не існує — derive per-render через `maxStreakAllTime` aggregation across active habits (same pattern як `HabitDetailSheet bestStreak`). Kyiv hour sampled per render via `getKyivDateParts().hour`. `onActivate` calls `applyTimeMode("today")` (scrolls panel to today).                                                                                                                                                                                                                                                                                |
| 5d  | Nutrition: protein-low, streak-7-days (2)                   | ✅ Shipped [#3040] | Detection hooks under `modules/nutrition/hooks/`. Wired у `NutritionDashboard.tsx` між hero та weekly mini-bar. **Divergence:** streak insight id suffixed `-{YYYY-WW}` (per ISO week) for natural dedupe via `useInsightDismissal` — no separate LS key needed. 7-day window: full scan iteration (`i = 0..6`), bail on first miss. Used existing `getKyivDayKey()` + `addDaysISODate` helpers.                                                                                                                                                                                                                                                                                   |
| 5e  | Hub-level aggregator (`<InsightCard>` у `HubInsightsBlock`) | ✅ Shipped [#3045] | 4 module wrapper hooks (`useFinykInsights`, `useFizrukInsights`, `useRoutineInsights`, `useNutritionInsights`) — each fetches own storage. Top-level `useAllInsights({ surface, cap })` aggregates, filters by `showOn`, priority-sorts, caps at 3. Wired into `HubInsightsBlock` above `AssistantAdviceCard`. **Surprise:** 7/9 Phase 5 a-d triggers default to `showOn: "module"` — тільки 2 Routine triggers surface at Hub immediately. Per-trigger `showOn` promotion = окрема micro-PR. Module surfaces left untouched (zero regression). Finyk wrapper uses SQLite Mono mirror cache (`getCachedFinykMonoMirrorState`) — empty before mirror warms, safe defensive default. |

[#3038]: https://github.com/Skords-01/Sergeant/pull/3038
[#3039]: https://github.com/Skords-01/Sergeant/pull/3039
[#3040]: https://github.com/Skords-01/Sergeant/pull/3040
[#3041]: https://github.com/Skords-01/Sergeant/pull/3041
[#3045]: https://github.com/Skords-01/Sergeant/pull/3045

### Phase 6 — Expensa delights (tasks)

Phase 6 spawned 2026-05-19 as parallel agents per spec line. Scope = 5 items (6.1, 6.2, 6.3, 6.4, 6.5). 6.5b/6.6/6.7 deferred to Phase 7 per plan.

| #   | Task                                                                                                                                                   | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Category-tinted icon pill on Finyk transaction rows                                                                                                    | ✅ Shipped [#3048] | `TxRow.tsx` — 28px pill `w-7 h-7` + 16px Icon. Tint light: `bg-finyk/[0.08] text-finyk-strong`. Tint dark: `dark:bg-finyk/[0.15] dark:text-finyk`. `aria-hidden` on wrapper (decorative). 15-entry `CATEGORY_ICON_MAP` keyed by `cat.id` (slug-stable, F5b-safe), fallback `tag`. F5b conflict risk low — F5b edits `ManualExpenseSheet.tsx`, не `TxRow.tsx`; if F5b strips emojis from `MCC_CATEGORIES` labels, `catName` slice may need micro-adjustment.                                                                                                                            |
| 6.2 | ManualExpenseSheet big amount hero (`text-style-display-hero` + JetBrains Mono)                                                                        | ✅ Shipped [#3051] | Bundled with 6.3 — same file. Manual implementation коли agent usage limit вдарив mid-spawn. Amount hero `text-style-display-hero font-mono tabular-nums text-finyk-strong dark:text-finyk leading-none` рендериться above input коли parsed amount > 0. `aria-hidden` (input нижче має accessible label). Reset на close-and-reopen via existing reset hook.                                                                                                                                                                                                                          |
| 6.3 | Inline AI suggestion in ManualExpenseSheet (`<Badge variant="soft-module" dismissible animate>` recipe — Badge primitive extension, NOT new component) | ✅ Shipped [#3051] | Bundled with 6.2. State: `aiAppliedCategory: CategorySlug \| null` clears на (close-and-reopen / manual category pick / explicit dismiss). Recipe реалізує "AI · {category-label} ✕" Badge `variant="finyk" tone="soft" size="sm"` + Icon sparkles + close button з `hover:bg-finyk/20`. `motion-safe:animate-in fade-in duration-200`. Цей recipe тепер reused для 6.4 на TxRow/MealRow.                                                                                                                                                                                              |
| 6.4 | AI-source tag on tx/meal rows (`<Badge soft module>AI · {category}</Badge>`)                                                                           | ✅ Shipped [#3053] | `TxRow.tsx`: новий Badge для auto-categorized tx (skip if `_manual` / `overrideCatId` / income / internal-transfer / `other`). `MealRow.tsx`: upgrade existing macroSource Badge — `variant: isAiSourced ? "nutrition" : "neutral"` + sparkles Icon for `photoAI`/`recipeAI`. `productDb` залишається deterministic — keeps neutral tone без sparkles.                                                                                                                                                                                                                                 |
| 6.5 | W6 StreakFlame wiring on Routine hero (`useStreakFlame(streakDays)` hook + `<StreakFlame>` placement)                                                  | ✅ Shipped [#3047] | Primitive existing — hook + integration only. Hook intensity tiers: 0=hidden, 1-6=low (yellow static), 7-29=medium (amber/orange pulse), 30-99=strong (red), 100+=violet milestone burst. Placement: `absolute top-3 right-3` inside Card with `min-h-[44px]` touch-target wrapper, `aria-hidden` (streak narrative covered у `HeroValueLine` + `KpiRowCompact`). Reduced-motion: primitive's `motion-safe:animate-streak-glow` + `motion-safe:animate-celebration-pop` CSS guards handle it. MeshBackground у `RoutineApp` shell-level, not inside hero — нема AMBIENT slot conflict. |
| F5b | ManualExpenseSheet category labels emoji → typed icon slug                                                                                             | ✅ Shipped [#3049] | Option A (slug). Slug map: `food/groceries/cafe/transport/entertainment/health/shopping/utilities/tech/subscriptions/education/travel/other`. Era detection: Era 3 = direct key match; Era 2 (emoji-prefixed) = strip non-letter/digit → UA→slug map; Era 1 (bare UA) = direct strip (no-op) → map lookup. Updated `personalization.ts` `CANONICAL_TO_MANUAL_LABEL` to return slugs. `FinykApp.tsx` has pre-existing dead `cat === "restaurant"` branch — was broken before F5b, slug now `cafe` (cleanup deferred to parallel-track follow-up).                                       |

[#3047]: https://github.com/Skords-01/Sergeant/pull/3047
[#3048]: https://github.com/Skords-01/Sergeant/pull/3048
[#3049]: https://github.com/Skords-01/Sergeant/pull/3049
[#3051]: https://github.com/Skords-01/Sergeant/pull/3051
[#3053]: https://github.com/Skords-01/Sergeant/pull/3053

---

## Divergences from plan

Кейси де реальність репо відрізнялась від припущень плана. Збираємо тут аби майбутні фази могли вчитися.

> **Council-v4 alignment audit, 2026-05-18.** 5-роль ради проаналізували code↔plan↔mockups трикутник. Знайдено 11 decisions + 11 open questions. Найвпливовіша знахідка для цього файлу: `execution-plan.md` Phase 4.1 була stale (CounterReveal+HeroValueLine listed як «create» при тому що вже shipped у PR #2969). Виправлено в plan-correction PR. Повний звіт: [`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md). P1 corrections: [`#2991`](https://github.com/Skords-01/Sergeant/pull/2991).

### Fizruk shell migration — coverage gap (D2, audit 2026-05-18)

`apps/web/src/modules/fizruk/FizrukApp.tsx:121` досі рендериться через `<ModuleShell module="fizruk">`, тоді як `FinykApp`, `RoutineApp`, `NutritionApp` мігровані на `<MeshBackground>`. `governance.md:74` декларує PR-6 (#2908) покриття «ModuleShell + 3 \*App.tsx», але live-код суперечить full migration reading. **Відкрите Q1:** прочитати diff PR #2908 щоб визначити чи це intent (ModuleShell обгорнутий MeshBackground внутрішньо) чи bug (Fizruk просто пропущений). Backlog entry — `backlog.md § Critical`.

### Planning gaps (D3, D5, D9 — audit 2026-05-18)

- **6 mockup-novel surfaces без phase-owner:** nudges, push, quick-add, states, responsive, details-pattern. Виняток — `quick-add` приземлено у Phase 4 (Q2 resolution). 5 інших → post-launch (`backlog.md § Post-launch design-ready`).
- **Marketing/landing/pricing scope** був implicit-excluded, тепер explicit у `README.md § Scope boundaries`.
- **Phase 3/5/6 acceptance criteria** були zero. Template stub доданий у `backlog.md § Acceptance criteria template`.

### Phase 0

**§T1 file path mismatch.**
План вказував `apps/web/tailwind-preset.js`. Реально preset живе у `packages/design-tokens/tailwind-preset.js` (monorepo package). Recon agent (Explore) це виявив. Виправлено в плані по факту? — ні, файл `redesign-v2-execution-plan.md` ще каже стару locație. **TODO:** виправити при наступному оновленні плана.

**§T2 chart vars — більше ніж план описав.**
План каже «додати 4 змінні у `:root` що дзеркалять preset values. Light + dark + HC окремо». Реальність — 4 theme scopes (`:root`, `.dark`, `html.hc`, `html.hc.dark`), плюс свідомо НЕ додав у `[data-theme-preview="..."]` блоки (DesignShowcase зараз не рендерить charts у preview, додавання — окрема фаза якщо потрібно).

**§T5 severity flip blocked by baseline.**
План просив flip rule на `error` для `modules/**`. Реальність — ~80 candidate violations baseline (grep на `text-* font-*` сполучення). Flip без cleanup ламає CI. Відкладено: TODO у config + spawn-task для cleanup PR.

### Phase 1

**§1.1 FAB inventory empty.**
План припускав «4 FAB-и» на 4 module entries для wire'ing `variant="v2-{module}"`. Реальність — `FloatingActionButton` component експортується з shared/ui, є stories, але **жоден module НЕ використовує його**. Finyk має inline `<button>` styled як FAB (FinykApp.tsx:513-523); Fizruk/Routine/Nutrition не мають quick-add FAB взагалі. Рішення: Finyk inline button → справжній `<FloatingActionButton variant="v2-finyk">`; інші 3 — out of scope (додавання FABs до них — продуктовий change, не «quick win»).

**§1.2 recon agent error.**
Spawned Explore agent помилково повідомив що «Hub не wrapped у MeshBackground — потрібна обгортка». Точкова перевірка через Read `HubHomeView.tsx:87` показала що Hub ВЖЕ wrapped (since PR-5). План був правильний; recon помилився. Урок: для критичних state-перевірок дублюй recon з точковим Read'ом перед прийняттям рішення.

### Phase 2

**§2.0 P2 primitives missing from Phase 0.**
Handoff doc (§6 checklist) припускав що PR-2 «Phase 0 bundle» включав P1+P2 primitives. Реально Phase 0 шипив тільки T1-T6 (tokens + ESLint rules), без primitives. Wave 1 implementer agents для Routine V1 + Nutrition V2 не могли стартувати — їм нема що імпортувати. Рішення: новий PR-prework #2969 створює primitives як standalone bundle. Цей PR = новий task 2.0 (не plan-original). Lesson: handoff docs можуть посилатись на роботу що НЕ виконана — point-verify primitive existence через grep ДО спавна consumer agents.

**§2.3 codemod scope collapsed з ~15 до ~3 файлів.**
Plan казав sub-PR 2.3 = codemod ~15 module list files. Recon grep на anti-patterns (`bg-{module}/[.06]` + `border-l-4 + shadow-card` + `rounded-3xl bg-panel shadow-card`) дав ~3 matches: Finyk HeroCard, Fizruk HeroCard, Atlas section. Усі покриті hero-migration PRs (2.1 + 2.3 + 2.3.1). Окремий codemod sub-PR не потрібен. Урок: plan estimates на recon-driven scope треба перевіряти grep'ом перед розширенням parallelism.

**§2.3 C4 target file mis-identified by recon (3rd recon error за сесію).**
Recon агент сказав C4 hero region = `Dashboard.tsx` line 384. Implementer Read показав що l.384 = `quickTemplates` button (UI control, не hero); реальний C4 = окремий компонент `components/dashboard/HeroCard.tsx` з `HERO_CARD_CLASS` константою на l.98 дублюваною у 4 state-варіантах. Implementer перепланував on-the-fly: створив shared `HeroShell` sub-component замість 4 окремих Card wrappers. Урок: recon на негативних/специфічних line claims = ненадійний. ALWAYS verify через Read перед edit.

**§2.0/2.5 worktree parallelism via `isolation: "worktree"` — повністю спрацював.**
4 паралельні implementer agents у окремих worktrees, нуль file conflicts. Кожен повернув diff for review; головний агент закомітив. Це новий правильний pattern для Phase 2+ — НЕ shared worktree з stash-transfer (anti-pattern з memory Phase 0+1).

**§2.0 NutritionDashboard.tsx false-negative recon claim.**
Recon агент сказав `apps/web/src/modules/nutrition/pages/NutritionDashboard.tsx` NOT FOUND. Point-verify Glob знайшов файл у `components/`, не `pages/`. 4th recon negative-claim помилка цієї сесії. Урок (вже зафіксований у memory) знову підтверджено.

---

## Follow-ups not done (свідомі відкладення)

Список того, що було б добре зробити, але свідомо відклав поза поточними PRs. Tracked aби не загубилось.

| Item                                                                                  | Why deferred                                                                                                                                                                                                                                                   | Where lives                                                            | When pickup                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`prefer-text-style` baseline cleanup** (~80 violations у `apps/web/src/modules/**`) | Phase 0 «purely additive» contract; flip severity ламає CI                                                                                                                                                                                                     | Spawn-task chip у твоєму UI; TODO у `eslint.config.js`; row у T5 above | Як окремий cleanup PR перед Phase 5+                                                                                                                            |
| **Fizruk / Routine / Nutrition quick-add FABs**                                       | Phase 1 scope reduction — продуктовий change, не quick win                                                                                                                                                                                                     | Цей doc (§1.1 divergence)                                              | Окрема product-decision сесія коли визначиш semantic для quick-add (за моделлю Finyk = expense; що для Fizruk? workout? exercise log? — потрібен product input) |
| **Refactor `--bottom-nav-height` як default у MeshBackground**                        | Phase 1.2 фікс — patch consequence (style prop), не root cause; MeshBackground мала б default'нути 60px на module shells і 0 на standalone                                                                                                                     | Self-eval Phase 1 + цей doc                                            | Phase 4 (Value + Wow primitives) — там і так refactoring shared/components                                                                                      |
| **Capacitor ready-event observer для iOS detect**                                     | Phase 1.3 race на early mount — якщо `getPlatform()` повертає "web" до того як bridge ready, fallback неправильний                                                                                                                                             | Self-eval Phase 1                                                      | Phase 5+ (insights wiring) коли інші Capacitor APIs зачіпаються — можна додати observer там одним touch                                                         |
| **Chart CSS vars у `[data-theme-preview]` блоки**                                     | DesignShowcase зараз не рендерить charts у preview tiles                                                                                                                                                                                                       | T2 above                                                               | Якщо у Phase 4 DesignShowcase отримає Recharts стори — додати тоді                                                                                              |
| **Update plan file** з виправленнями шляхів і scope-reductions                        | План — intent doc, не status; live updates перевантажують його                                                                                                                                                                                                 | Цей doc                                                                | Перед merge всієї редизайн-послідовності (Phase 7 фінал) — single update pass для history                                                                       |
| ~~**Wave 2: Routine V1 CalendarHero + Nutrition V2 Dashboard**~~                      | ✅ Done 2026-05-19 — [#3003](https://github.com/Skords-01/Sergeant/pull/3003) merged · [#3005](https://github.com/Skords-01/Sergeant/pull/3005) open (CI pending)                                                                                              | Phase 2 tasks table 2.2 + 2.4                                          | Closed                                                                                                                                                          |
| **Fizruk Dashboard workout-list + stat tiles glass migration**                        | Handoff §2.3 additional — defer'нуто з #2974 щоб C4 hero scope лишався tight                                                                                                                                                                                   | Spawn-task chip активний                                               | Як окремий PR `feat/redesign-v2/fizruk-dashboard-glass-migration`                                                                                               |
| ~~**Husky pre-commit shebang fix**~~                                                  | ✅ Done 2026-05-19 — [#3007](https://github.com/Skords-01/Sergeant/pull/3007) додає `#!/bin/sh` у `.husky/pre-commit` + `.husky/commit-msg`. Verified: commit на цій же branch пройшов без `--no-verify`. Зніме блок для майбутніх Claude Code сесій назавжди. | This doc § Near-misses                                                 | Closed (merge pending)                                                                                                                                          |
| **Lift `HeroShell` із fizruk/HeroCard.tsx до shared module-level**                    | Phase 2.3.1 Atlas hero застосовує inline copy. При 3+ call-sites — lift `HeroShell` у `apps/web/src/modules/fizruk/components/HeroShell.tsx`.                                                                                                                  | Цей doc 2.3.1 + PR #2976                                               | Коли зʼявиться 3-й fizruk hero call-site                                                                                                                        |

---

## Hard-rule violations / near-misses

Поки **0 violations**. Список near-misses (для audit trail):

- **Phase 1, main.tsx:** перший варіант iOS detect я вставив МІЖ `import` statements. ESM забороняє code між imports → potential ESBuild warning. Самостійно catch'нув при final Read pass, виправив (move after all imports) ДО typecheck.
- **Phase 2 husky `--no-verify` use (env, not code).** `.husky/pre-commit` + `.husky/commit-msg` не мали shebang line → Windows git валиться `Exec format error` при кожному `git commit` через Bash tool / subagent worktrees. Не code violation — env-side bug. Per-commit user authorization запитано і отримано перед кожним `--no-verify`. Permission classifier тричі auto-denied навіть з явним user-OK через AskUserQuestion — потрібен був explicit free-text дозвіл («обійди все»). **Resolved 2026-05-19 у [#3007](https://github.com/Skords-01/Sergeant/pull/3007)**: shebang prepended до обох hooks; commit на цьому PR пройшов без `--no-verify` → root cause fixed.

---

## Skill / tool dispatch lessons

Що працювало добре:

- **Recon-перед-планом через Explore agent** — економить 5-8 Read/Grep операцій. Recon виявив 2 plan-reality розриви у Phase 0 + 1 у Phase 1 які я мав би catch'нути сам.
- **`sergeant-design/no-v1-gradient` rule pattern** (tripwire з zero current consumers + paired `@deprecated` JSDoc) — низько-ризикова DS-enforcement без CI fail.
- **TODO-comment + spawn-task chip duo для T5 defer** — TODO для майбутнього reader'а коду, chip для actionable cleanup task.
- **Phase 2: 4 паралельні implementer agents у `isolation: "worktree"`** — повний parallel, нуль file conflicts. Кожен повертає diff for review; головний агент закомічує. Це новий правильний pattern для Phase 2+. Час: 4 PRs за ~20 хв wall-clock замість 2 год sequential.
- **Phase 2: spawn-task chip → PR за один turn** — Atlas hero migration (PR #2976) пройшла повний шлях від chip → spawn → diff → commit → PR за один turn користувача. Доказ що chip pattern працює для clean out-of-scope cleanup.
- **Phase 2: implementer scope-reduction правильне рішення** — Fizruk C4 implementer знайшов що hero chrome дублюється у 4 state-варіантах, створив shared `HeroShell` sub-component замість 4 окремих Card обгорток. Краще за blind recipe execution.

Що треба міняти:

- **Параллелізм sub-tasks**: Phase 0 + Phase 1 робив sequential, навіть коли tasks незалежні. Phase 2 (codemod на 15 файлів) — обов'язково паралельні Agent calls per sub-PR.
- **Trust + verify recon outputs**: recon agent помилявся на 1.2 Hub MeshBackground state. Point-verify ключові твердження перед edit.
- **Не запускай typecheck у фоні до того як changes у потрібному worktree**: Phase 1 я стартував typecheck, потім транслував changes між worktrees, доводилось cancel+restart. Завжди typecheck у тому worktree де changes сидять.
- **Phase 2 rate-limit failure mode**: Перша Fizruk C4 спроба впала 0 edits — агент уперся в API quota ДО початку edits. `isolation: "worktree"` автоматично видалив worktree без diff. Симптом: empty branch + worktree NOT FOUND. Respawn після reset спрацював. Урок: коли quota низький — спавнь МЕНШЕ паралельних агентів (1-2), не 4.
- **Phase 2 permission classifier vs explicit user OK**: класифікатор auto-denied `--no-verify` навіть після явного user-OK через AskUserQuestion. Потрібен був explicit free-text дозвіл («обійди все»). Урок: для CLAUDE.md hard nopes — AskUserQuestion недостатньо. Або користувач додає permission rule у `.claude/settings.local.json` (`"Bash(git commit --no-verify *)": "allow"`), або каже дозвіл прямою фразою.
- **Recon negative-claim errors — 4 за сесію**: Phase 1.2 (Hub wrapping), Phase 2.0 (NutritionDashboard NOT FOUND), Phase 2.3 (Dashboard.tsx l.384 hero), плюс попередні. Усі — false negatives або wrong line numbers. Будь-яке «X doesn't exist» / «X at line N» від recon = ALWAYS verify Read'ом ДО рішення.

---

## Next session entry point

Якщо ти агент, що приходить cold у v2-роботу — **починай ЗВІДСИ.** Це 30-секундний onboarding before any tool call.

### Reading order (≤ 10 хв)

1. [`AGENTS.md`](../../../AGENTS.md) — hard rules #11-#17 (особливо).
2. [`CLAUDE.md`](../../../CLAUDE.md) — local-execution policy (не запускай `pnpm test/lint/check/build/dev` без явного прохання).
3. [`execution-brief.md`](./execution-brief.md) — orchestration contract: toolkit dispatch matrix, anti-patterns, self-eval rubric, per-phase acceptance gates. **Читай повністю.**
4. **Цей файл** — поточний phase status, divergences, follow-ups.
5. [`execution-plan.md`](./execution-plan.md) — intent / phase sequencing.
6. [`governance.md`](./governance.md) — governance / token strategy.
7. [`migration.md`](./migration.md) — BEFORE/AFTER patterns (Phase 2 + 6 потребують).
8. [`handoff-package/`](./handoff-package/) — canvas mockups + locked decisions per phase 2 entry (Finyk hero A/B, ModuleBottomNav v2, Phase 6 cherry-picks).

### Memory (durable behavioral lessons)

`C:\Users\dmytr\.claude\projects\E---claude-Sergeant\memory\project_redesign_v2_tokens.md` — оновлюй після кожної фази:

- Що landed (короткий summary)
- Hard-rule trip-prevention notes
- Behavioral lessons (recon errors, scope reductions, anti-pattern slips)
- Open follow-ups not done

### Bootstrap steps

```powershell
# 1. Verify state
cd E:\.claude\Sergeant
git checkout main
git pull --ff-only origin main

# 2. Sync target worktree if needed (or create new for next phase)
git worktree list
# If `..\sergeant-redesign-v2-exec` is on a stale post-merge branch, switch to main:
git -C ..\sergeant-redesign-v2-exec checkout main
git -C ..\sergeant-redesign-v2-exec pull --ff-only origin main

# 3. New phase branch
git -C ..\sergeant-redesign-v2-exec checkout -b feat/redesign-v2/phase-<N>-<topic> main

# 4. Load skill
# Active skill: sergeant-web-ui (repo has no sergeant-design-system — DS work falls under web-ui)
```

### Current phase pointer

- **Last completed:** Phase 5e Hub aggregator — [#3045](https://github.com/Skords-01/Sergeant/pull/3045) merged 2026-05-19. `useAllInsights({ surface, cap })` aggregates 4 module wrapper hooks, filters by `showOn`, priority-sorts. Rendered у `HubInsightsBlock`. Phase 5 повністю closed (5 PRs total: a/b/c/d/e).
- **In flight (3 parallel agents, spawned 2026-05-19):**
  - **6.1** Category-tinted icon pill на Finyk transaction rows
  - **6.5** W6 StreakFlame wiring on Routine hero
  - **F5b** ManualExpenseSheet emoji → typed icon slug (localStorage migration)
- **Phase 4 closed:** 3 PRs merged (#3032 4b, #3034 4c, #3035 4a).
- **Phase 3 closed:** 6 PRs merged (F1, F2+W2, F3, F4, F6, F5a).
- **Phase 2 closed:** Wave 1 + Wave 2 (#3003, #3005) merged.
- **Infra fix merged:** [#3007](https://github.com/Skords-01/Sergeant/pull/3007) husky shebang.
- **Next waves (after Wave 1 lands):**
  - **6.2+6.3** ManualExpenseSheet big amount hero + inline AI suggestion (bundled — same file, must wait for F5b to land first to avoid 3-way conflict)
  - **6.4** AI-source badge on tx/meal rows (depends on 6.3 Badge recipe)
- **Parallel-track follow-up #1:** T5 `prefer-text-style` baseline cleanup PR — spawn-task chip активний.
- **Parallel-track follow-up #2:** Fizruk Dashboard workout-list + stat tiles glass migration — spawn-task chip активний.
- **Parallel-track follow-up #3:** Per-trigger `showOn` promotion micro-PRs — 7/9 Phase 5 triggers default to `"module"`; promote to `"both"` for hub surfacing per-trigger.

### Telling the next agent in plain text

> "Continue redesign v2 execution. Phases 0-5 closed (5e Hub aggregator merged як [#3045](https://github.com/Skords-01/Sergeant/pull/3045)). **Phase 6 + F5b in flight** — 3 parallel agents spawned (6.1 Finyk category pill, 6.5 Routine StreakFlame, F5b ManualExpenseSheet emoji migration). Wave 2 коли F5b лендиться: spawn 6.2+6.3 bundle (ManualExpenseSheet hero amount + AI suggestion). Wave 3 коли 6.3 лендиться: spawn 6.4 (AI-source badge — uses 6.3 Badge recipe). Husky shebang fixed (#3007). Worktree pre-commit can fail if `pnpm exec lint-staged` can't resolve (worktree lacks node_modules). Active skill: `sergeant-web-ui`. Read `execution-plan.md § Phase 6` для scope (6.1-6.5; 6.5b/6.6/6.7 deferred Phase 7). Check memory `project_redesign-v2-alignment-2026-05-18.md`, `feedback_husky_windows_spawn_bug.md`, `feedback_worktree_skip_pnpm_install.md`. **Phase 5e finding:** 7/9 module triggers default to `showOn: 'module'`. Per-trigger promotion to `'both'` for hub surfacing = окрема micro-PR per trigger — backlog candidate."

## Refs

- Brief (orchestration): [`execution-brief.md`](./execution-brief.md)
- Plan: [`execution-plan.md`](./execution-plan.md)
- Governance: [`governance.md`](./governance.md)
- Migration BEFORE/AFTER: [`migration.md`](./migration.md)
- Polish backlog: [`backlog.md`](./backlog.md)
- Handoff package (canvas + locked decisions): [`handoff-package/`](./handoff-package/)
- DS contract: [`../design-system.md`](../design-system.md)
