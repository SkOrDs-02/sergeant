/**
 * Routine bottom actions: tab nav + the quick-add habit dialog.
 *
 * Split out of `RoutineApp.tsx` as part of the Phase 2 decomposition
 * (initiative 0001). The bottom nav and the bottom-sheet dialog form
 * a tight visual cluster — both anchor to the bottom of the viewport
 * and react to the same "+ Add habit" affordance.
 */

import type { Dispatch, SetStateAction } from "react";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { messages } from "@shared/i18n/uk";
import { HabitQuickCreateDialog } from "./components/HabitQuickCreateDialog";
import { RoutineBottomNav } from "./components/RoutineBottomNav";
import type { RoutineMainTab } from "./context/RoutineCalendarContext";
import type { RoutineState } from "./lib/types";

export interface RoutineActionsProps {
  mainTab: RoutineMainTab;
  setMainTab: Dispatch<SetStateAction<RoutineMainTab>>;
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  quickAddHabitOpen: boolean;
  quickAddFocusTick: number;
  /** True only when the dialog was auto-opened on the user's first Routine entry. */
  quickAddFirstRunHint: boolean;
  /** Acknowledge the first-run hint banner inside the dialog. */
  onDismissQuickAddFirstRunHint: () => void;
  onOpenQuickAddHabit: () => void;
  onCloseQuickAddHabit: () => void;
}

export function RoutineActions({
  mainTab,
  setMainTab,
  routine,
  setRoutine,
  quickAddHabitOpen,
  quickAddFocusTick,
  quickAddFirstRunHint,
  onDismissQuickAddFirstRunHint,
  onOpenQuickAddHabit,
  onCloseQuickAddHabit,
}: RoutineActionsProps) {
  return (
    <>
      {/* fab-and-manual-income spec §5-6: replaces the old center-docked
          nav FAB with the shared component, placed/styled identically to
          the other 3 modules. */}
      <FloatingActionButton
        variant="v2-routine"
        icon="plus"
        onClick={onOpenQuickAddHabit}
        aria-label={messages.routine.addHabitFab}
      />
      <RoutineBottomNav mainTab={mainTab} onSelectTab={setMainTab} />
      <HabitQuickCreateDialog
        open={quickAddHabitOpen}
        routine={routine}
        setRoutine={setRoutine}
        onClose={onCloseQuickAddHabit}
        focusTick={quickAddFocusTick}
        firstRunHint={quickAddFirstRunHint}
        onDismissFirstRunHint={onDismissQuickAddFirstRunHint}
      />
    </>
  );
}
