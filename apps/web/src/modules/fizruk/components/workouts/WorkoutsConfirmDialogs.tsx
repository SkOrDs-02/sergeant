import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Modal } from "@shared/components/ui/Modal";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
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
  activeWorkoutConflictOpen: boolean;
  onFinishActiveAndContinue: () => void;
  onDiscardActiveAndContinue: () => void;
  onCancelActiveConflict: () => void;
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
  activeWorkoutConflictOpen,
  onFinishActiveAndContinue,
  onDiscardActiveAndContinue,
  onCancelActiveConflict,
}: WorkoutsConfirmDialogsProps) {
  const conflictCopy = messages.fizruk.activeWorkoutConflict;
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
        title="Є жорстке застереження"
        description="Ти позначив біль або ця група ще має червоний recovery-статус. Навантажувати її не раджу. Почати все одно?"
        confirmLabel="Так, почати"
        cancelLabel="Скасувати"
        danger={false}
        onConfirm={onRiskyTemplateConfirm}
        onCancel={onRiskyTemplateCancel}
      />

      <Modal
        open={activeWorkoutConflictOpen}
        onClose={onCancelActiveConflict}
        title={conflictCopy.title}
        description={conflictCopy.description}
        size="sm"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              module="fizruk"
              className="w-full h-12"
              onClick={onFinishActiveAndContinue}
            >
              {conflictCopy.finish}
            </Button>
            <Button
              variant="destructive"
              className="w-full h-12"
              onClick={onDiscardActiveAndContinue}
            >
              {conflictCopy.discard}
            </Button>
            <Button
              variant="secondary"
              className="w-full h-12"
              onClick={onCancelActiveConflict}
            >
              {messages.actions.cancel}
            </Button>
          </div>
        }
      />
    </>
  );
}
