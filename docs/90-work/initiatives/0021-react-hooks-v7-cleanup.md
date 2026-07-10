# 0021 — React-hooks v7 ESLint cleanup

> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-09-12.
> **Status:** In progress
> **Agent-ready:** yes

## Проблема

`eslint.baseline.js:146-178` містить ~152 вимкнених `react-hooks/*` правил (set-state-in-effect 78, refs 37, purity 17, тощо) без власника, тикету чи дати закриття. Це блокує підняття severity react-hooks/v7 до `error` у всьому репо.

## Скоуп

- Аудит усіх ~152 inline-disables і baseline suppressions
- Категоризація: свідомі (з документованою причиною) vs. технічний борг
- Поетапне виправлення або документування кожного suppression
- Фінальне видалення з eslint.baseline.js

## Acceptance criteria

- [x] 3 eslint-disable в FinykApp.tsx виправлені (navigate додано до deps, mount-only effects)
- [x] 2 eslint-disable в useWorkoutsLifecycle.ts виправлені (mount-only, stable deps)
- [x] `react-hooks/immutability` — web 0 ✅ + mobile 0 ✅ (2026-07-10: CategoryDonut reduce; Sheet SheetContent split + scoped disables for RNGH worklets); promoted to `"error"` in `eslint.mobile.js`
- [x] `react-hooks/preserve-manual-memoization` — web 0 ✅ + mobile 0 ✅ (2026-07-10: `computeInitialExpenseDate` + centralised `pantryItems`); promoted to `"error"` in `eslint.web.js` / `eslint.mobile.js`
- [x] `react-hooks/purity` — web 0 ✅ + mobile 0 ✅ (2026-07-10); promoted to `"error"` in `eslint.web.js` / `eslint.mobile.js`
- [x] `react-hooks/refs` — web 0 ✅ + mobile 0 ✅ (2026-07-10); promoted to `"error"` in `eslint.web.js` / `eslint.mobile.js` (mobile waves 1–3 [#156](https://github.com/SkOrDs-02/sergeant/pull/156), [#160](https://github.com/SkOrDs-02/sergeant/pull/160), [#162](https://github.com/SkOrDs-02/sergeant/pull/162); web wave 1 — 26 files).
- [x] `react-hooks/set-state-in-effect` — web 0 ✅ (2026-07-10 wave 2); mobile 44 remaining
- [ ] react-hooks/exhaustive-deps violations в інших файлах виправлені
- [ ] baseline suppressions в `eslint.baseline.js` скорочені на 50%
- [ ] `eslint.baseline.js:146-178` оновлено або видалено (після promotion всіх 5 правил)

## Виконані дії (2026-07-10)

**Web-правила:**

- `immutability` (mobile) — promoted to `"error"` у `eslint.mobile.js` (2026-07-10): CategoryDonut immutable reduce; Sheet pan gesture → `sheetPanGesture.ts` (file-level disable for RNGH worklets) + `SheetContent` mount-only subtree.
- `preserve-manual-memoization` (mobile) — 4 call-sites fixed; promoted to `"error"` у `eslint.mobile.js` ([#159](https://github.com/SkOrDs-02/sergeant/pull/159)).
- `preserve-manual-memoization` (web) — promoted to `"error"` у `eslint.web.js` (рядок 500) після burndown 2026-07-04 (6 fix, 3 scoped-disable з обґрунтуванням); web 0.
- `purity` (mobile) — promoted to `"error"` у `eslint.mobile.js` (2026-07-10): OnboardingWizard ref placeholder + `useRecovery` `nowMs` state (web parity).
- `purity` (web) — promoted to `"error"` у `eslint.web.js` після burndown 14 call-sites у 9 файлах (2026-07-10).
- `refs` (web) — promoted to `"error"` у `eslint.web.js` (2026-07-10): 26 files — useEffect callback-ref sync, HubSearch destructure, AddMealSheet `useState`, useSwipeNavigation `isDragging` state, DropdownMenu/Tooltip ref-taint fixes.
- `set-state-in-effect` (web) — wave 1 (81→48): `useSqliteTickOverlay`, render-time SQLite overlay, `useSyncExternalStore`. Wave 2 (48→0): core hub/onboarding, finyk/nutrition/routine modules, shared UI (Toast/Tooltip/PageTransition/voice). Rule ready for promotion to `"error"` in `eslint.web.js` (pending mobile burndown).

**Mobile preserve-manual-memoization (PR #159):**

- `ManualExpenseSheet.tsx` — `computeInitialExpenseDate()` helper замість `useMemo` з `[initialExpense?.date]`.
- `useNutritionPantries.ts` — `pantryItems` з вузькою залежністю `activePantryItems` (паритет web).
- `Dashboard.tsx`, `RecipeRecommender.tsx`, `Shopping.tsx` — споживають `pantryItems` з хука.

**Mobile refs wave 2 (PR #160):** 8 файлів — core dashboard (AssistantFab, HubInsightsPanel, DraggableDashboard coach mark), Toast, FAB, SyncStatusIndicator, ModuleErrorBoundary, RestTimerOverlay. Патерн: `useRef(new Animated.Value(x)).current` → `useState(() => new Animated.Value(x))`.

**Mobile refs wave 3:** onboarding intro `useState`, HubSearch destructure, `useChatSessions` boot snapshot, `useLocalStorage`/`voice`/`useRoutineReminders` callback-ref sync via `useEffect`, draggable lists `reduceMotion` shared values + `useLayoutEffect` height buffers. Mobile `refs` → 0; promoted in `eslint.mobile.js`.

**Web refs wave 1:** 26 files — core hooks (activation, SW update, hub UI, speech, chat), HubSearch destructure, nutrition/fizruk/routine reminders, AddMealSheet/BarcodeScanner, DropdownMenu/Tooltip ref composition, useSwipeNavigation `isDragging` state, shared hooks (localStorage, theme). Web `refs` → 0; promoted in `eslint.web.js`.

**Залишок:** `set-state-in-effect` (~80 web / 44 mobile).

## Виконані дії (2026-06-10)

1. **FinykApp.tsx** (656 → 484 рядки)
   - Виправлено: `# sync= URL` effect (mount-only, eslint-disable-line)
   - Виправлено: `# first-run` navigation effect (mount-only)
   - Виправлено: `# pwaAction` effect (navigate додано до deps)
   - Розбито: SyncTone helper → `components/SyncIndicator.tsx`

2. **fizruk dualWrite/adapter.ts** (642 → 102 рядки)
   - Розбито на: `ops/workouts.ts`, `ops/exercises.ts`, `ops/dailyPlanTemplates.ts`
   - Виправлено: mount-only `useWorkoutsViewFromSession` effect

## Timeline

Починати не раніше Sprint 9 (2026-07-07). Ціль: закрити до 2026-09-09.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                          | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| [#3560](https://github.com/Skords-01/Sergeant/pull/3560) | fix: heal governance/format drift + dualWrite logger lint debt | 2026-06-14 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
