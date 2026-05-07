/**
 * Routine module composition root.
 *
 * Phase 2 decomposition (initiative 0001) — the prior 745-LOC file
 * has been split into:
 *
 *   - `RoutineApp.helpers.ts` — pure date/grouping utilities.
 *   - `useRoutineAppState.ts` — orchestrator hook with the
 *     time-state reducer, derived memos and effects.
 *   - `RoutineHeader.tsx` — the standard module header bar.
 *   - `RoutineTimeline.tsx` — the calendar/stats timeline body.
 *   - `RoutineActions.tsx` — bottom nav + quick-add dialog.
 *
 * This root is intentionally thin: it wires the public props through
 * the orchestrator hook and renders the three visual chunks inside
 * the module's accent provider. No business logic lives here —
 * adding a new behaviour means editing the matching shard above.
 */

import { ModuleAccentProvider } from "@shared/components/layout";
import { RoutineActions } from "./RoutineActions";
import { RoutineHeader } from "./RoutineHeader";
import { RoutineTimeline } from "./RoutineTimeline";
import { useRoutineAppState } from "./useRoutineAppState";

export interface RoutineAppProps {
  onBackToHub?: () => void;
  onOpenSettings?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function RoutineApp({
  onBackToHub,
  onOpenSettings,
  onOpenModule,
  pwaAction,
  onPwaActionConsumed,
}: RoutineAppProps = {}) {
  const {
    routine,
    setRoutine,
    isHabitPending,
    storageErrorMsg,
    setStorageErrorMsg,
    mainTab,
    setMainTab,
    quickAddHabitOpen,
    quickAddFocusTick,
    openQuickAddHabit,
    closeQuickAddHabit,
    streakMax,
    calendarData,
    calendarActions,
    handlePullRefresh,
    handlePullRefreshError,
  } = useRoutineAppState({ pwaAction, onPwaActionConsumed, onOpenModule });

  return (
    <ModuleAccentProvider module="routine" asShellRoot>
      <RoutineHeader
        onBackToHub={onBackToHub}
        onOpenSettings={onOpenSettings}
      />

      <RoutineTimeline
        storageErrorMsg={storageErrorMsg}
        onDismissStorageError={() => setStorageErrorMsg(null)}
        calendarData={calendarData}
        calendarActions={calendarActions}
        isHabitPending={isHabitPending}
        mainTab={mainTab}
        routine={routine}
        streakMax={streakMax}
        onPullRefresh={handlePullRefresh}
        onPullRefreshError={handlePullRefreshError}
      />

      <RoutineActions
        mainTab={mainTab}
        setMainTab={setMainTab}
        routine={routine}
        setRoutine={setRoutine}
        quickAddHabitOpen={quickAddHabitOpen}
        quickAddFocusTick={quickAddFocusTick}
        onOpenQuickAddHabit={openQuickAddHabit}
        onCloseQuickAddHabit={closeQuickAddHabit}
      />
    </ModuleAccentProvider>
  );
}
