import { useCallback, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { ActiveWorkoutPanel } from "../workouts/ActiveWorkoutPanel";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { Card } from "@shared/components/ui/Card";
import { useToast } from "@shared/hooks/useToast";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";
import type { WorkoutFinishSummary } from "@sergeant/fizruk-domain";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";

/**
 * Local view state used to drive the post-finish flash card. The shape merges
 * the pure-domain `WorkoutFinishSummary` with UI bookkeeping (current step,
 * collapsed flag, the workout id we are summarising, plus the wellbeing
 * snapshot the user is editing). Mirrors the inline state initialised in
 * `Workouts.tsx` and consumed by `WorkoutFinishSheets`.
 */
interface FinishFlashState extends WorkoutFinishSummary {
  step: "wellbeing" | "summary";
  collapsed: boolean;
  workoutId: string;
  energy: number | null;
  mood: number | null;
  savedWellbeing?: { energy?: number | null; mood?: number | null } | null;
}

type WorkoutsView = "home" | "catalog" | "log" | "templates";

interface WorkoutRowProps {
  w: Workout;
  activeWorkoutId: string | null;
  setActiveWorkoutId: (id: string | null) => void;
}

interface WorkoutJournalSectionProps {
  activeWorkout: Workout | null;
  activeDuration: string | null;
  workouts: Workout[];
  activeWorkoutId: string | null;
  setActiveWorkoutId: (id: string | null) => void;
  retroOpen: boolean;
  setRetroOpen: (b: boolean) => void;
  retroDate: string;
  setRetroDate: (s: string) => void;
  retroTime: string;
  setRetroTime: (s: string) => void;
  createWorkout: () => Workout;
  setMode: (mode: WorkoutsView) => void;
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
  submitRetroWorkout: () => void;
  deleteWorkout: (id: string) => void;
  restoreWorkout: (workout: Workout) => void;
}

function WorkoutRow({
  w,
  activeWorkoutId,
  setActiveWorkoutId,
}: WorkoutRowProps) {
  // An ended workout is always "Завершене" — even if it happens to be the
  // currently-selected row — so it no longer looks like it's "hanging in
  // active" after the user pressed «Завершити».
  const isEnded = Boolean(w.endedAt);
  const isSelected = activeWorkoutId === w.id;
  const isActive = !isEnded && isSelected;
  return (
    <button
      key={w.id}
      onClick={() => setActiveWorkoutId(isSelected ? null : w.id)}
      aria-pressed={isSelected}
      className={`w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-panelHi transition-colors${isSelected ? " bg-text/5" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-style-label text-text">
          {new Date(w.startedAt).toLocaleDateString("uk-UA", {
            month: "short",
            day: "numeric",
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">
            {(w.items || []).length} вправ
          </span>
          {isEnded ? (
            <span className="text-2xs px-2 py-0.5 rounded-full bg-panelHi text-subtle border border-line">
              Завершене
            </span>
          ) : isActive ? (
            <span className="text-2xs px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20">
              Активне
            </span>
          ) : (
            <span className="text-2xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
              Чернетка
            </span>
          )}
        </div>
      </div>
      {w.note && (
        <div className="text-xs text-subtle mt-1 italic line-clamp-2">
          {w.note}
        </div>
      )}
    </button>
  );
}

const JOURNAL_ITEM_HEIGHT = 60;
const MAX_JOURNAL_HEIGHT = JOURNAL_ITEM_HEIGHT * 10;

export function WorkoutJournalSection({
  activeWorkout,
  activeDuration,
  workouts,
  activeWorkoutId,
  setActiveWorkoutId,
  retroOpen,
  setRetroOpen,
  retroDate,
  setRetroDate,
  retroTime,
  setRetroTime,
  createWorkout,
  setMode,
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
  submitRetroWorkout,
  deleteWorkout,
  restoreWorkout,
}: WorkoutJournalSectionProps) {
  const toast = useToast();
  const { announce } = useAnnounce();
  const workoutList = workouts || [];
  const handleSwipeDelete = useCallback(
    (id: string) => {
      const snapshot = (workouts || []).find((w: Workout) => w.id === id);
      if (!snapshot) return;
      deleteWorkout(id);
      showUndoToast(toast, {
        msg: "Тренування видалено",
        onUndo: () => restoreWorkout?.(snapshot),
      });
    },
    [workouts, deleteWorkout, restoreWorkout, toast],
  );
  const listHeight = Math.min(
    workoutList.length * JOURNAL_ITEM_HEIGHT,
    MAX_JOURNAL_HEIGHT,
  );
  // Guard the finish flow against double-click re-entry — the state updates
  // inside onFinishClick are async, so React may still render the "Завершити"
  // button for one more frame while a second click is already queued.
  const finishingRef = useRef(false);

  return (
    <div className="space-y-3">
      {!activeWorkout && (
        <Card radius="lg" padding="lg" className="text-center">
          <div className="text-style-label text-text">
            Немає активного тренування
          </div>
          <div className="text-xs text-subtle mt-1">
            Створи «+ Нове» або відкрий «Шаблони». Вправи з каталогу нижче
            додаються тапом по назві після цього.
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1 h-11"
              onClick={() => {
                const w = createWorkout();
                setActiveWorkoutId(w.id);
              }}
            >
              + Нове
            </Button>
            <Button
              variant="secondary"
              className="flex-1 h-11"
              onClick={() => setMode("templates")}
            >
              Шаблони
            </Button>
          </div>
        </Card>
      )}

      {activeWorkout && (
        <SectionErrorBoundary
          title="Помилка в активному тренуванні"
          resetLabel="Спробувати знову"
          onReset={() => {
            // Мінімальний безпечний reset: вихід з активної вправи-секції в UI
            setActiveWorkoutId?.(activeWorkout?.id || null);
          }}
        >
          <ActiveWorkoutPanel
            activeWorkout={activeWorkout}
            activeDuration={activeDuration}
            lastByExerciseId={lastByExerciseId}
            musclesUk={musclesUk}
            recBy={recBy}
            removeItem={removeItem}
            updateItem={updateItem}
            updateWorkout={updateWorkout}
            setRestTimer={setRestTimer}
            onFinishClick={() => {
              // Ignore re-entry from rapid double-clicks and from any stray
              // invocation on an already-ended workout (e.g. when viewing
              // a finished session from the history list).
              if (finishingRef.current) return;
              if (!activeWorkout || activeWorkout.endedAt) return;
              finishingRef.current = true;
              const sum = summarizeWorkoutForFinish(activeWorkout);
              const wid = activeWorkout.id;
              endWorkout(wid);
              // Confirm the action visually + with haptic so the user does
              // not have to read the modal to know the session was saved.
              // Mirrors success pattern used in Routine (habit save) and
              // Nutrition (meal save).
              hapticSuccess();
              toast.success("Тренування збережено.");
              // Mirror the visible toast for screen-reader users — the
              // toast queue uses an `aria-live` region too but only for
              // the toast text region, which AT may filter as cosmetic.
              // A polite announce() here is short and high-signal.
              announce("Тренування завершено та збережено.");
              // Collapse the expanded active workout panel immediately —
              // a finished session should live on in the history list as a
              // "Завершене" entry, not keep occupying the "Активне" slot.
              // The workout itself is not deleted: it can only be removed
              // via explicit delete (swipe / "Видалити" confirm dialog).
              setActiveWorkoutId(null);
              // A dangling rest timer from the last set must not keep ticking
              // after finish — otherwise it eventually beeps/vibrates long
              // after the session is over.
              setRestTimer?.(null);
              if (sum) {
                setFinishFlash({
                  step: "wellbeing",
                  collapsed: false,
                  ...sum,
                  workoutId: wid,
                  energy: null,
                  mood: null,
                });
              }
              // Release the guard on the next tick — by then React has
              // already committed `activeWorkoutId = null` and the button
              // is unmounted, so any further clicks are impossible anyway.
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
              if (!activeWorkout) return;
              const snapshot = activeWorkout;
              deleteWorkout(snapshot.id);
              setActiveWorkoutId?.(null);
              showUndoToast(toast, {
                msg: "Тренування видалено",
                onUndo: () => restoreWorkout(snapshot),
              });
            }}
            onCollapse={() => setActiveWorkoutId(null)}
          />
        </SectionErrorBoundary>
      )}

      <Card radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 bg-panelHi/60 border-b border-line flex items-center justify-between gap-2">
          <SectionHeading as="div" size="sm">
            Останні тренування
          </SectionHeading>
        </div>

        {retroOpen && (
          <div className="px-4 py-3 border-b border-line bg-bg space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-text">
                Записати тренування заднім числом
              </p>
              <Button
                variant="secondary"
                size="xs"
                iconOnly
                onClick={() => setRetroOpen(false)}
                aria-label="Закрити"
                title="Закрити"
                className="h-8 w-8 rounded-xl text-xs text-subtle hover:text-text"
              >
                ×
              </Button>
            </div>
            <p className="text-xs text-subtle leading-relaxed">
              Вкажи, коли було тренування, потім додай вправи та заповни
              кг/повтори.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <SectionHeading
                  as="div"
                  size="xs"
                  variant="fizruk"
                  className="mb-1"
                >
                  Дата
                </SectionHeading>
                <input
                  type="date"
                  className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                  value={retroDate}
                  onChange={(e) => setRetroDate(e.target.value)}
                />
              </div>
              <div>
                <SectionHeading
                  as="div"
                  size="xs"
                  variant="fizruk"
                  className="mb-1"
                >
                  Час початку
                </SectionHeading>
                <input
                  type="time"
                  className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                  value={retroTime}
                  onChange={(e) => setRetroTime(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="w-full h-11"
              onClick={submitRetroWorkout}
            >
              Створити й заповнити
            </Button>
          </div>
        )}

        {workoutList.length === 0 && (
          <EmptyState
            compact
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" />
              </svg>
            }
            title="Поки немає тренувань"
            description="Натисни «+ Нове тренування» щоб почати"
          />
        )}

        {workoutList.length > 0 && (
          <Virtuoso
            style={{ height: listHeight }}
            data={workoutList}
            itemContent={(_, w) => (
              <SwipeToAction
                key={w.id}
                onSwipeLeft={
                  w.id !== activeWorkoutId
                    ? () => handleSwipeDelete(w.id)
                    : undefined
                }
                rightLabel="🗑 Видалити"
                rightColor="bg-danger"
              >
                <WorkoutRow
                  w={w}
                  activeWorkoutId={activeWorkoutId}
                  setActiveWorkoutId={setActiveWorkoutId}
                />
              </SwipeToAction>
            )}
          />
        )}
      </Card>
    </div>
  );
}
