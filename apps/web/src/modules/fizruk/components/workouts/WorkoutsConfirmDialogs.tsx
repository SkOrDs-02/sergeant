import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import type { WorkoutTemplate } from "../../hooks/useWorkoutTemplates";

export interface WorkoutsConfirmDialogsProps {
  /** Open flag for the "delete catalog exercise" confirm. */
  deleteExerciseConfirm: boolean;
  onDeleteExerciseConfirm: () => void;
  onDeleteExerciseCancel: () => void;

  /**
   * Holds the template to start when the user confirms the
   * "muscles still recovering" warning. `null` keeps the dialog
   * closed.
   */
  riskyTemplate: WorkoutTemplate | null;
  onRiskyTemplateConfirm: () => void;
  onRiskyTemplateCancel: () => void;
}

/**
 * Bottom-of-page confirmation dialogs for the Workouts page. The
 * "Delete active workout" `ConfirmDialog` was removed in favour of
 * the unified soft-delete flow (`onDeleteWorkout` in
 * `WorkoutJournalSection`) that calls `deleteWorkout` immediately
 * and surfaces a 5 s undo toast via `showUndoToast`. Per the
 * unified-undo policy, only non-reversible flows (e.g. exercise
 * removal that detaches the catalog entry) keep an explicit
 * confirmation step.
 */
export function WorkoutsConfirmDialogs({
  deleteExerciseConfirm,
  onDeleteExerciseConfirm,
  onDeleteExerciseCancel,
  riskyTemplate,
  onRiskyTemplateConfirm,
  onRiskyTemplateCancel,
}: WorkoutsConfirmDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={deleteExerciseConfirm}
        title="Видалити вправу?"
        description="Вправу буде видалено з каталогу. Записи в тренуваннях залишаться."
        confirmLabel="Видалити"
        onConfirm={onDeleteExerciseConfirm}
        onCancel={onDeleteExerciseCancel}
      />

      <ConfirmDialog
        open={!!riskyTemplate}
        title="М'язи ще відновлюються"
        description="У шаблоні є вправи на групи м'язів, які ще не відновились. Почати тренування все одно?"
        confirmLabel="Так, почати"
        cancelLabel="Скасувати"
        danger={false}
        onConfirm={onRiskyTemplateConfirm}
        onCancel={onRiskyTemplateCancel}
      />
    </>
  );
}
