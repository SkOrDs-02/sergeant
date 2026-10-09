/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Видалення ЗАВЕРШЕНОГО тренування з undo-тостом — спільний шлях для
 * свайпу в `WorkoutHistoryList` і кнопки «Видалити тренування» на
 * `WorkoutSummaryView` (ux-11, аудит 2026-10-01: свайп — touch-only жест,
 * мишею й клавіатурою завершене тренування видалити було неможливо,
 * WCAG 2.1.1 / 2.5.1). Один хелпер, щоб обидві точки входу не розійшлись
 * у тексті тосту чи в знімку для відновлення.
 *
 * Знімок береться ДО `deleteWorkout`: після нього запису в списку вже немає,
 * а `restoreWorkout` повертає саме його (з тим самим id).
 */
import type { ToastApi } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import type { Workout } from "@sergeant/fizruk-domain";

export interface DeleteWorkoutWithUndoArgs {
  toast: ToastApi;
  /** Знімок тренування, яке видаляємо — з нього працює undo. */
  workout: Workout;
  deleteWorkout: (id: string) => void;
  restoreWorkout: (workout: Workout) => void;
}

export function deleteWorkoutWithUndo({
  toast,
  workout,
  deleteWorkout,
  restoreWorkout,
}: DeleteWorkoutWithUndoArgs): void {
  deleteWorkout(workout.id);
  showUndoToast(toast, {
    msg: messages.fizruk.workoutHistory.deletedToast,
    onUndo: () => restoreWorkout(workout),
  });
}
