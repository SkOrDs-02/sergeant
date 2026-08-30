/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Route-owned single-workout view (`/fizruk/workout/<id>`, rendered by
 * `pages/ActiveWorkout.tsx` → `pages/Workouts.tsx` in `activeOnly` mode).
 * Branches on the workout this route resolved to:
 *  - not found (deleted / bad id)      → dead-end card, no catalog tail;
 *  - found, still in flight            → editable `ActiveWorkoutPanel`
 *    (unchanged — this is the historical "journal" behaviour);
 *  - found, `endedAt` set              → read-only `WorkoutSummaryView`
 *    (02-A — replaces the old "Активне тренування не знайдено" dead-end
 *    that used to render after «Завершити»).
 *
 * The full "Останні тренування" list this component used to render in a
 * `!activeOnly` mode moved to `WorkoutHistoryList.tsx` / the dedicated
 * `/fizruk/history` route (03-A) — this component is now always
 * route-owned, single-workout.
 */
import { useRef } from "react";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { ActiveWorkoutPanel } from "../workouts/ActiveWorkoutPanel";
import { WorkoutSummaryView } from "../workouts/WorkoutSummaryView";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useToast } from "@shared/hooks/useToast";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../../core/observability/analytics";
import { readSignalContext } from "../../../../core/observability/valueSignalAttribution";
import {
  computeWorkoutSetCount,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import type { WorkoutFinishSummary } from "@sergeant/fizruk-domain";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { trackFizrukWorkoutDiscarded } from "../../lib/workoutTelemetry";

/**
 * Local view state used to drive the post-finish flash card. The shape merges
 * the pure-domain `WorkoutFinishSummary` with UI bookkeeping (current step,
 * collapsed flag, the workout id we are summarising, plus the wellbeing
 * snapshot the user is editing). Mirrors the inline state initialised in
 * `Workouts.tsx` and consumed by `WorkoutFinishSheets`.
 */
interface FinishFlashState extends WorkoutFinishSummary {
  step: "wellbeing" | "injury" | "summary";
  collapsed: boolean;
  workoutId: string;
  energy: number | null;
  mood: number | null;
  injurySites: string[];
  savedWellbeing?: { energy?: number | null; mood?: number | null } | null;
}

interface WorkoutJournalSectionProps {
  /** The workout this route resolved to — `null` means "not found". */
  activeWorkout: Workout | null;
  activeDuration: string | null;
  /** Введений у ретро-формі, але ще не записаний кінець — див. `pendingRetroEnd`. */
  pendingRetroEnd?: string | null | undefined;
  onPendingRetroEndChange?: ((iso: string) => void) | undefined;
  musclesUk: Record<string, string>;
  recBy: Record<string, unknown>;
  lastByExerciseId: Record<string, unknown>;
  setRestTimer: (s: RestTimerState | null) => void;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
  removeItem: (workoutId: string, itemId: string) => void;
  setFinishFlash: (
    f:
      | FinishFlashState
      | null
      | ((prev: FinishFlashState | null) => FinishFlashState | null),
  ) => void;
  endWorkout: (id: string) => Workout | null;
  summarizeWorkoutForFinish: (
    w: Workout | null | undefined,
  ) => WorkoutFinishSummary | null;
  deleteWorkout: (id: string) => void;
  restoreWorkout: (workout: Workout) => void;
  /** 02-A item 4 — starts a new session from the read-only summary. */
  onRepeatWorkout: (workout: Workout) => void;
  /** Navigates back to `/fizruk/workouts` (used by every exit path here). */
  onClose: () => void;
}

export function WorkoutJournalSection({
  activeWorkout,
  activeDuration,
  pendingRetroEnd,
  onPendingRetroEndChange,
  musclesUk,
  recBy,
  lastByExerciseId,
  setRestTimer,
  updateWorkout,
  updateItem,
  removeItem,
  setFinishFlash,
  endWorkout,
  summarizeWorkoutForFinish,
  deleteWorkout,
  restoreWorkout,
  onRepeatWorkout,
  onClose,
}: WorkoutJournalSectionProps) {
  const toast = useToast();
  const { announce } = useAnnounce();
  const celebration = useCelebration();
  const copy = messages.fizruk.workoutSummary;
  // Guard the finish flow against double-click re-entry — the state updates
  // inside onFinishClick are async, so React may still render the "Завершити"
  // button for one more frame while a second click is already queued.
  const finishingRef = useRef(false);

  if (!activeWorkout) {
    return (
      <Card radius="lg" padding="lg" className="text-center">
        <div className="text-style-label text-text">{copy.notFoundTitle}</div>
        <div className="text-style-caption text-subtle mt-1">
          {copy.notFoundDescription}
        </div>
        <div className="mt-3">
          <Button module="fizruk" className="w-full h-11" onClick={onClose}>
            {copy.backToWorkouts}
          </Button>
        </div>
      </Card>
    );
  }

  if (activeWorkout.endedAt) {
    return (
      <>
        {celebration.CelebrationComponent}
        <WorkoutSummaryView
          workout={activeWorkout}
          onRepeat={() => onRepeatWorkout(activeWorkout)}
        />
      </>
    );
  }

  return (
    <>
      {celebration.CelebrationComponent}
      <SectionErrorBoundary
        title="Помилка в активному тренуванні"
        resetLabel="Спробувати знову"
        onReset={() => {
          // Мінімальний безпечний reset: залишаємось на тому самому
          // тренуванні, просто перемонтовуємо панель.
        }}
      >
        <ActiveWorkoutPanel
          activeWorkout={activeWorkout}
          activeDuration={activeDuration}
          pendingRetroEnd={pendingRetroEnd}
          onPendingRetroEndChange={onPendingRetroEndChange}
          lastByExerciseId={lastByExerciseId}
          musclesUk={musclesUk}
          recBy={recBy}
          removeItem={removeItem}
          updateItem={updateItem}
          updateWorkout={updateWorkout}
          setRestTimer={setRestTimer}
          onFinishClick={() => {
            // Ignore re-entry from rapid double-clicks and from any stray
            // invocation on an already-ended workout — structurally
            // unreachable now that an ended workout renders
            // `WorkoutSummaryView` instead of this panel, but kept as a
            // cheap defensive guard.
            if (finishingRef.current) return;
            if (!activeWorkout || activeWorkout.endedAt) return;
            finishingRef.current = true;
            // Detect whether this is a real "Workout Win" — at least one
            // strength item has recorded sets, meaning the final set of a
            // substantive session was just saved. Non-strength items
            // (time/distance) are also counted to cover cardio sessions.
            const isWorkoutWin = (activeWorkout.items || []).some(
              (item) =>
                (item.type === "strength" && (item.sets?.length ?? 0) > 0) ||
                item.type === "time" ||
                item.type === "distance",
            );
            const sum = summarizeWorkoutForFinish(activeWorkout);
            const wid = activeWorkout.id;
            // Телеметрія (Хвиля 2, `fizruk_workout_finished`). Емісія
            // стоїть ПІСЛЯ re-entry-guard-а `finishingRef` вище, тож
            // подвійний клік дає одну подію. У payload — лише counts:
            // назв вправ, нотаток і тоннажу тут немає і бути не має
            // (Hard Rule #21 — `scrubPII` чистить за іменами ключів,
            // тож назва вправи в події не була б вирізана).
            // `sets`/`has_sets` use the same non-empty-set criterion as
            // the journal row pill (`computeWorkoutSetCount` — a set
            // counts only when `weightKg > 0 || reps > 0`), so the
            // event matches what the user sees in the журнал instead
            // of the raw `sets.length` (which also counts unfilled
            // `{weightKg:0, reps:0}` rows the user never touched).
            const setCount = computeWorkoutSetCount(activeWorkout);
            trackEvent(ANALYTICS_EVENTS.FIZRUK_WORKOUT_FINISHED, {
              items: sum?.items ?? (activeWorkout.items || []).length,
              sets: setCount,
              has_sets: setCount > 0,
              duration_min:
                sum === null ? null : Math.round(sum.durationSec / 60),
              ...readSignalContext("fizruk"),
            });
            endWorkout(wid);
            // Confirm the action visually + with haptic so the user does
            // not have to read the modal to know the session was saved.
            hapticSuccess();
            if (sum) {
              // Є що підсумувати → веде аркуш `WorkoutFinishSheets`:
              // «Самопочуття» → «Щось болить?» → підсумок із плитками
              // часу / вправ / обʼєму і кнопкою «Готово». Це і є
              // святкування — окремий трофей поверх нього зайвий.
              //
              // AI-DANGER: НЕ піднімай тут `celebration.achievement`.
              // `CelebrationModal` — це `fixed inset-0 z-9999` із
              // backdrop-ом, а аркуш живе на `z-100`, тож трофей накривав
              // крок «Самопочуття»: кнопка «Пропустити» лишалась видимою,
              // але кліки зʼїдав backdrop. І сам собою він не зникав —
              // focus-trap модала переводить фокус усередину, `focusin`
              // ставить `autoCloseMs` на паузу, і той уже не стартує.
              // Ловилось `fizruk-active-workout.spec.ts`.
              setFinishFlash({
                step: "wellbeing",
                collapsed: false,
                ...sum,
                workoutId: wid,
                energy: null,
                mood: null,
                injurySites: [],
              });
              // Аркуш «Самопочуття» — не live-region; без цього факт
              // збереження лишався б неозвученим.
              announce("Тренування завершено та збережено.");
            } else if (isWorkoutWin) {
              // Підсумку немає (порожня чи шаблонна сесія), але робота
              // була — тоді трофей нікого не перекриває й лишається
              // єдиним визнанням. W2: краще за мовчазний тост.
              celebration.achievement(
                "Тренування завершено!",
                "Відмінна робота, сесія збережена.",
              );
              // Модалка не має live-region — озвучуємо окремо.
              announce("Тренування завершено та збережено.");
            } else {
              // Empty or template-only workout: fall back to a plain toast
              // so the save is still acknowledged without a jarring modal.
              //
              // Окремого `announce()` тут НЕМА свідомо: тост уже несе
              // `role="status" aria-live="polite"` зі своїм текстом, і
              // дубль означав би, що незряча людина чує про одне
              // збереження двічі, різними словами.
              toast.success("Тренування збережено.");
            }
            // A dangling rest timer from the last set must not keep ticking
            // after finish — otherwise it eventually beeps/vibrates long
            // after the session is over.
            setRestTimer?.(null);
            // Release the guard on the next tick — by then React has
            // already committed the finish and any further clicks are
            // routed to the read-only summary instead.
            setTimeout(() => {
              finishingRef.current = false;
            }, 0);
          }}
          onDeleteWorkout={() => {
            // Unified undo: snapshot the active workout, run the
            // soft-delete immediately, then surface a 5 s undo toast
            // that re-inserts via `restoreWorkout`. Replaces the old
            // `ConfirmDialog` step — the toast is the only safety
            // net. Per the unified undo policy, `ConfirmDialog` is
            // reserved for non-reversible actions.
            const snapshot = activeWorkout;
            deleteWorkout(snapshot.id);
            trackFizrukWorkoutDiscarded();
            onClose();
            showUndoToast(toast, {
              msg: messages.fizruk.workoutHistory.deletedToast,
              onUndo: () => restoreWorkout(snapshot),
            });
          }}
          onCollapse={onClose}
        />
      </SectionErrorBoundary>
    </>
  );
}
