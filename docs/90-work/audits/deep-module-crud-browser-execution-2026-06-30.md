# Deep module CRUD browser execution log

> **Last validated:** 2026-06-30 by Codex. **Next review:** 2026-07-14.
> **Status:** Active

## Контекст запуску

- Repo: `E:\.claude\Sergeant`
- Worktree for changes: `E:\.claude\Sergeant\.claude\worktrees\browser-user-journey-loop`
- Branch: `codex/browser-user-journey-loop`
- Existing PR: `https://github.com/SkOrDs-02/sergeant/pull/76`
- Loop doc: `docs/90-work/audits/deep-module-crud-browser-loop.md`

## Code map

| Module    | Route/surface                                      | Source evidence                                                              | Planned selector contract                                                                             |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Finyk     | `/finyk/transactions` + `ManualExpenseSheet`       | `FinykApp`, `ManualExpenseSheet`, `useFinykStorageMutations`                 | FAB `Додати витрату`, fields `Сума ₴`/`Назва`, buttons `Додати`/`Зберегти`/`Видалити`                 |
| Nutrition | `/nutrition/pantry` + `PantryCard`/`ItemEditSheet` | `NutritionPantryPage`, `PantryCard`, `ItemEditSheet`, `useNutritionPantries` | input placeholder `напр. лосось 300г`, `Редагувати <item>`, `Кількість`, `Одиниця`, `Прибрати <item>` |
| Routine   | `/routine` + `HabitQuickCreateDialog`              | `RoutineApp`, `RoutineActions`, `HabitQuickCreateDialog`, `HabitDetailSheet` | quick-create button/dialog, field labels from `HabitForm`, save/edit/delete controls                  |
| Fizruk    | `/fizruk/body` + `Body` journal                    | `Body`, `JournalEntryCard`, `showUndoToast`                                  | fields `body-weight`, `body-sleep`, `body-note`, button `Записати`, delete aria-label                 |

## Results

| Group         | Command / evidence                                                                                                                                       | Result  | Notes                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Setup         | `docker ps`, `Invoke-WebRequest http://127.0.0.1:3000/health`                                                                                            | Passed  | Docker daemon доступний; `hub-postgres` healthy; API health повернув `200 OK` після ручного старту.                             |
| Code map      | codebase memory graph + focused source reads                                                                                                             | Passed  | CRUD candidate surfaces found for Finyk, Nutrition, Routine, Fizruk.                                                            |
| Format        | `pnpm exec prettier --write ...`                                                                                                                         | Passed  | Applied to touched TS/TSX/docs files.                                                                                           |
| Build         | `pnpm --filter @sergeant/web build`                                                                                                                      | Passed  | Production web build + PWA service worker build completed.                                                                      |
| Typecheck     | `pnpm --filter @sergeant/web exec tsc -p tsconfig.json --noEmit --pretty false`                                                                          | Blocked | Passed once after the Nutrition hook fix, then repeatedly timed out at 300s with no diagnostics.                                |
| Browser run 1 | `pnpm --filter @sergeant/web exec playwright test tests/smoke/deep-module-crud.spec.ts --config playwright.smoke.config.ts --project chromium --no-deps` | Failed  | Finyk passed before later cache-wait instrumentation; Nutrition/Routine/Fizruk exposed CRUD defects.                            |
| Browser run 2 | same command against manual preview with empty `storageState`                                                                                            | Failed  | Empty auth state is not valid for this CRUD loop: SQLite/local state overlay loses module data.                                 |
| Browser run 3 | same command against authenticated smoke state                                                                                                           | Partial | Routine passed; Finyk/Nutrition/Fizruk exposed SQLite read/write cache races.                                                   |
| Browser run 4 | same command after z-index + dual-write cache-refresh fixes                                                                                              | Partial | Routine passed; Finyk initial refresh did not fire, Nutrition input was reset by refresh, Fizruk lost journal after navigation. |

## Findings

- `DCRUD-001` — Harness correction: Finyk day groups collapse after navigation; the test must expand the `Сьогодні` group before asserting row text.
- `DCRUD-002` — Harness correction: undo CTA text is `Повернути`, not `Скасувати`.
- `DCRUD-003` — Product defect fixed: `z-200`, `z-300`, `z-400`, `z-500` classes were used by modal/dialog surfaces but missing from the Tailwind preset. This made Routine edit dialog stacking unreliable.
- `DCRUD-004` — Product defect fixed: Nutrition `upsertItem(PantryItem)` passed object input into `parseLoosePantryText`, restoring `[object object]` after undo/edit paths. It now normalizes object/array inputs directly.
- `DCRUD-005` — Product defect partially fixed: Nutrition dual-write now schedules as a macrotask and refreshes/notifies the SQLite read cache after apply.
- `DCRUD-006` — Product defect partially fixed: Finyk and Fizruk dual-write now refresh and notify their SQLite read caches after apply, matching the Nutrition pattern.
- `DCRUD-007` — Remaining blocker: CRUD paths can still race SQLite read boot/cache refresh. Evidence: Finyk timed out waiting for initial module refresh, Nutrition refresh reset the pantry input and disabled `Додати`, Fizruk still lost the body journal entry after navigation.
- `DCRUD-008` — Verification blocker: web typecheck is unstable in this worktree; it passed once, then repeated 300s timeouts left orphan `tsc` processes that had to be killed.

## Current status

Routine CRUD is browser-passing in authenticated Chromium after the z-index fix.

Finyk, Nutrition, and Fizruk are not cleared yet. The remaining work is storage-cutover correctness, not selector polish: each module needs deterministic ordering between initial SQLite read boot, user mutation, dual-write apply, cache refresh, and UI overlay.
