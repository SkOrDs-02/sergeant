/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Route-owned single-workout view (`/fizruk/workout/<id>`, rendered by
 * `pages/ActiveWorkout.tsx` → `pages/Workouts.tsx` in `activeOnly` mode).
 * Branches on the workout this route resolved to:
 *  - not found (deleted / bad id)      → dead-end card, no catalog tail;
 *  - found, still in flight            → session mode `SessionView`
 *    (list of exercises → one exercise on its own screen, спека
 *    `fizruk-active-session.md`);
 *  - found, `endedAt` set              → read-only `WorkoutSummaryView`
 *    (02-A — replaces the old "Активне тренування не знайдено" dead-end
 *    that used to render after «Завершити»).
 *
 * The full "Останні тренування" list this component used to render in a
 * `!activeOnly` mode moved to `WorkoutHistoryList.tsx` / the dedicated
 * `/fizruk/history` route (03-A) — this component is now always
 * route-owned, single-workout.
 */
import { useEffect, useRef, useState } from "react";
import type { InjurySiteId } from "@sergeant/fizruk-domain/data";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { SessionView } from "../session/SessionView";
import { WorkoutSummaryView } from "../workouts/WorkoutSummaryView";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useToast } from "@shared/hooks/useToast";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import { UNDO_TOAST_DEFAULT_ERROR_MSG } from "@sergeant/shared";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../../core/observability/analytics";
import { readSignalContext } from "../../../../core/observability/valueSignalAttribution";
import {
  computeWorkoutDoneItemCount,
  computeWorkoutSetCount,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import type { WorkoutFinishSummary } from "@sergeant/fizruk-domain";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { trackFizrukWorkoutDiscarded } from "../../lib/workoutTelemetry";
import {
  clearWorkoutMoment,
  recordWorkoutMoment,
} from "../../lib/workoutMoments";
import { reopenWorkoutDetached } from "../../lib/reopenWorkoutDetached";
import { deleteWorkoutWithUndo } from "../../lib/deleteWorkoutWithUndo";
import { restoreWorkoutDetached } from "../../lib/restoreWorkoutDetached";
import { signalFinishedWorkoutForRoutine } from "../../lib/routineAutoMarkSignal";
import {
  clearPendingRetroEnd,
  peekPendingRetroEnd,
  setPendingRetroEnd,
} from "../../lib/pendingRetroEnd";
import { isImplausiblyLongSession } from "../../lib/sessionDuration";
import { LongSessionDialog } from "./LongSessionDialog";
import {
  FINISH_UNDO_WINDOW_MS,
  buildFinishConfirmSummary,
  finishUndoHint,
} from "./finishConfirm";

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
  /** `workout/<id>/<itemId>` — вправа, відкрита на весь екран. */
  focusItemId?: string | undefined;
  /** `null` — список, id — екран вправи (веде роут). */
  onOpenItem: (itemId: string | null) => void;
  /** «+ Вправа» — аркуш каталогу. */
  onAddExercise: () => void;
  onOpenExerciseInfo?: ((exerciseId: string) => void) | undefined;
  onOpenExerciseStats?: ((exerciseId: string) => void) | undefined;
  /** Введений у ретро-формі, але ще не записаний кінець — див. `pendingRetroEnd`. */
  pendingRetroEnd?: string | null | undefined;
  onPendingRetroEndChange?: ((iso: string) => void) | undefined;
  recBy: Record<string, unknown>;
  /** Активні позначки травми (ADR-0083) для чипа відновлення. */
  injurySites: ReadonlySet<InjurySiteId>;
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
  /** 02-A item 4 — starts a new session from the read-only summary. */
  onRepeatWorkout: (workout: Workout) => void;
  /** Navigates back to `/fizruk/workouts` (used by every exit path here). */
  onClose: () => void;
}

export function WorkoutJournalSection({
  activeWorkout,
  activeDuration,
  focusItemId,
  onOpenItem,
  onAddExercise,
  onOpenExerciseInfo,
  onOpenExerciseStats,
  pendingRetroEnd,
  onPendingRetroEndChange,
  recBy,
  injurySites,
  lastByExerciseId,
  setRestTimer,
  updateWorkout,
  updateItem,
  removeItem,
  setFinishFlash,
  endWorkout,
  summarizeWorkoutForFinish,
  deleteWorkout,
  onRepeatWorkout,
  onClose,
}: WorkoutJournalSectionProps) {
  const toast = useToast();
  const copy = messages.fizruk.workoutSummary;
  const finishCopy = messages.fizruk.finishConfirm;
  // Guard the finish flow against double-click re-entry — the state updates
  // inside onFinishClick are async, so React may still render the "Завершити"
  // button for one more frame while a second click is already queued.
  const finishingRef = useRef(false);
  // Кінець, що вийшов би неправдоподібно довгим: показуємо попередження.
  const [longSessionEnd, setLongSessionEnd] = useState<string | null>(null);
  // Фз-2: «Завершити» спершу питає «Завершити зараз?».
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Тост «Повернутись у сесію» щойно завершеного тренування: підсумок гасить
  // його, коли людина стартує нове чи видаляє це, інакше відкат воскресив би
  // видалене або дав би дві активні сесії.
  const finishUndoRef = useRef<{ workoutId: string; toastId: number } | null>(
    null,
  );
  // Відкат через хук сторінки, поки вона змонтована; після навігації хук
  // мертвий (setState розмонтованого не викликає dual-write), тоді детачено.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dismissFinishUndo = (workoutId: string) => {
    const pending = finishUndoRef.current;
    if (pending?.workoutId !== workoutId) return;
    toast.dismiss(pending.toastId);
    finishUndoRef.current = null;
  };

  if (!activeWorkout) {
    return (
      <Card padding="lg" className="text-center">
        <div className="text-style-label text-text">{copy.notFoundTitle}</div>
        <div className="text-style-caption text-subtle mt-1">
          {copy.notFoundDescription}
        </div>
        <div className="mt-3">
          <Button
            variant="solid"
            tone="neutral"
            className="w-full h-11"
            onClick={onClose}
          >
            {copy.backToWorkouts}
          </Button>
        </div>
      </Card>
    );
  }

  if (activeWorkout.endedAt) {
    return (
      <WorkoutSummaryView
        workout={activeWorkout}
        onRepeat={() => {
          dismissFinishUndo(activeWorkout.id);
          onRepeatWorkout(activeWorkout);
        }}
        onClose={onClose}
        onUpdateTimes={(patch) => updateWorkout(activeWorkout.id, patch)}
        // Фз-2 (б): правка підходів завершеного тренування — той самий
        // `updateItem`, що й у сесії (дзеркало типу виміру, dual-write);
        // `endedAt` не чіпається.
        onUpdateItemSets={(itemId, sets) =>
          updateItem(activeWorkout.id, itemId, { sets })
        }
        onDeleteSet={(itemId, snapshot) => {
          const wid = activeWorkout.id;
          showUndoToast(toast, {
            msg: messages.fizruk.editFinishedSets.setDeleted,
            onUndo: () => updateItem(wid, itemId, { sets: snapshot }),
          });
        }}
        onDelete={() => {
          // ux-11: той самий шлях, що й свайп в історії, — видалення з
          // undo-тостом; потім назад до списку (сторінки вже нема). Undo НЕ
          // через хук сесії: `onClose()` розмонтує його, а тост лишиться.
          dismissFinishUndo(activeWorkout.id);
          deleteWorkoutWithUndo({
            toast,
            workout: activeWorkout,
            deleteWorkout,
            restoreWorkout: restoreWorkoutDetached,
          });
          onClose();
        }}
      />
    );
  }

  /**
   * Тап «Завершити» (Фз-2, OD-28): нічого не зберігає, а питає. Забута сесія
   * (data-37) іде одразу в `LongSessionDialog` — він сам є підтвердженням, і
   * два діалоги поспіль були б зайвим кроком.
   */
  const requestFinish = () => {
    if (finishingRef.current) return;
    if (!activeWorkout || activeWorkout.endedAt) return;
    const plannedEnd =
      peekPendingRetroEnd(activeWorkout.id) ??
      // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для endedAt (не Kyiv-межа доби)
      new Date().toISOString();
    if (isImplausiblyLongSession(activeWorkout.startedAt, plannedEnd)) {
      setLongSessionEnd(plannedEnd);
      return;
    }
    setConfirmOpen(true);
  };

  const handleFinish = (opts?: { endIso?: string; acknowledged?: boolean }) => {
    // Ignore re-entry from rapid double-clicks and from any stray
    // invocation on an already-ended workout — structurally unreachable now
    // that an ended workout renders `WorkoutSummaryView`, but kept as a cheap
    // defensive guard.
    if (finishingRef.current) return;
    if (!activeWorkout || activeWorkout.endedAt) return;
    // data-37: забута (або з опискою в кінці) сесія не закривається мовчки.
    const plannedEnd =
      opts?.endIso ??
      peekPendingRetroEnd(activeWorkout.id) ??
      // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для endedAt (не Kyiv-межа доби)
      new Date().toISOString();
    if (
      !opts?.acknowledged &&
      !opts?.endIso &&
      isImplausiblyLongSession(activeWorkout.startedAt, plannedEnd)
    ) {
      setLongSessionEnd(plannedEnd);
      return;
    }
    // Ретро-кінець ДО цього завершення: «Повернутись у сесію» відновлює
    // саме його, а не виправлений у попередженні data-37.
    const retroEndBefore = peekPendingRetroEnd(activeWorkout.id);
    const beforeFinish = activeWorkout;
    if (opts?.endIso) setPendingRetroEnd(activeWorkout.id, opts.endIso);
    setLongSessionEnd(null);
    setConfirmOpen(false);
    finishingRef.current = true;
    const sum = summarizeWorkoutForFinish({
      ...activeWorkout,
      endedAt: opts?.endIso ?? peekPendingRetroEnd(activeWorkout.id),
    });
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
      duration_min: sum === null ? null : Math.round(sum.durationSec / 60),
      ...readSignalContext("fizruk"),
    });
    // До `endWorkout`: кеш ще тримає стан «до» (ADR-0096, момент).
    recordWorkoutMoment(wid, activeWorkout.startedAt);
    const ended = endWorkout(wid);
    const endedIso = ended?.endedAt ?? plannedEnd;
    // Автовідмітка Рутини (Р-1 (в)): лише повноцінне, раз на тренування.
    signalFinishedWorkoutForRoutine(ended ?? activeWorkout, endedIso);
    // Confirm the action visually + with haptic so the user does
    // not have to read the modal to know the session was saved.
    hapticSuccess();
    if (sum) {
      // Є що підсумувати → веде аркуш `WorkoutFinishSheets`:
      // «Самопочуття» → «Щось болить?» → підсумок із плитками
      // часу / вправ / обʼєму і кнопкою «Готово». Це і є
      // святкування — окремий трофей поверх нього зайвий.
      //
      // AI-DANGER: НЕ піднімай тут повноекранну celebration-модалку
      // (`CelebrationModal`/`useCelebration`). Вона — `fixed
      // inset-0 z-9999` із backdrop-ом, а аркуш живе на `z-100`,
      // тож трофей накривав крок «Самопочуття»: кнопка
      // «Пропустити» лишалась видимою, але кліки зʼїдав backdrop.
      // І сам собою він не зникав — focus-trap модала переводить
      // фокус усередину, `focusin` ставить `autoCloseMs` на паузу,
      // і той уже не стартує. Ловилось `fizruk-active-workout.spec.ts`.
      setFinishFlash({
        step: "wellbeing",
        collapsed: false,
        ...sum,
        workoutId: wid,
        energy: null,
        mood: null,
        injurySites: [],
      });
    }
    // Рішення власника 2026-09-11 (аудит O1): завершене тренування — часта
    // подія, тож celebration знижена до тихого тосту. Один короткий текст на
    // всі гілки: поруч стоїть довга дія «Повернутись у сесію», і на 390 px
    // довший рядок переносився на три (зйомка 2026-11-18).
    const savedMsg = "Тренування збережено.";
    // Фз-2 (OD-28): одне повідомлення про збереження, і воно ж несе
    // «Повернутись у сесію» на 10 с. Тост має `role="status"`, тож окремого
    // `announce()` немає: незряча людина почула б про збереження двічі.
    // Тост лишається поза inert-фоном аркуша самопочуття (Toast.tsx).
    //
    // AI-DANGER: коміт уже стався (`endWorkout` вище). Повернення — це
    // відкат до знімка ДО завершення, а не відкладений коміт: закрита
    // вкладка у вікні мусить лишити тренування завершеним.
    const reopenSession = () => {
      finishUndoRef.current = null;
      try {
        if (mountedRef.current) {
          updateWorkout(wid, {
            endedAt: null,
            wellbeing: beforeFinish.wellbeing ?? null,
          });
        } else {
          reopenWorkoutDetached(beforeFinish, endedIso);
        }
      } catch {
        // Тренування лишилось завершеним — кажемо про це і даємо повтор.
        toast.error(UNDO_TOAST_DEFAULT_ERROR_MSG, undefined, {
          label: messages.actions.retry,
          onClick: reopenSession,
        });
        return;
      }
      // Без хвостів: аркуш самопочуття, рядок моменту, ретро-кінець.
      // Рекорди, просування програми, інсайти й стрік рахуються з
      // журналу і з `endedAt = null` зникають самі.
      setFinishFlash(null);
      clearWorkoutMoment(wid);
      if (retroEndBefore) setPendingRetroEnd(wid, retroEndBefore);
      else clearPendingRetroEnd(wid);
    };
    const toastId = toast.show(savedMsg, "success", FINISH_UNDO_WINDOW_MS, {
      label: finishCopy.undoLabel,
      kind: "undo",
      onClick: reopenSession,
    });
    finishUndoRef.current = { workoutId: wid, toastId };
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
  };

  return (
    <>
      <SectionErrorBoundary
        title="Не вдалось показати активне тренування"
        resetLabel="Спробувати знову"
        onReset={() => {
          // Мінімальний безпечний reset: залишаємось на тому самому
          // тренуванні, просто перемонтовуємо панель.
        }}
      >
        <SessionView
          activeWorkout={activeWorkout}
          activeDuration={activeDuration}
          focusItemId={focusItemId}
          pendingRetroEnd={pendingRetroEnd}
          onPendingRetroEndChange={onPendingRetroEndChange}
          lastByExerciseId={lastByExerciseId}
          recBy={recBy}
          injurySites={injurySites}
          removeItem={removeItem}
          updateItem={updateItem}
          updateWorkout={updateWorkout}
          onOpenItem={onOpenItem}
          onAddExercise={onAddExercise}
          onOpenExerciseInfo={onOpenExerciseInfo}
          onOpenExerciseStats={onOpenExerciseStats}
          onFinishClick={requestFinish}
          onDeleteWorkout={() => {
            // Unified undo: snapshot the active workout, run the
            // soft-delete immediately, then surface a 5 s undo toast
            // that re-inserts via `restoreWorkoutDetached` (хук сесії
            // розмонтується разом із `onClose()`, тож його restore не годиться). Replaces the old
            // `ConfirmDialog` step — the toast is the only safety
            // net. Per the unified undo policy, `ConfirmDialog` is
            // reserved for non-reversible actions.
            const snapshot = activeWorkout;
            deleteWorkout(snapshot.id);
            trackFizrukWorkoutDiscarded();
            onClose();
            showUndoToast(toast, {
              msg: messages.fizruk.workoutHistory.deletedToast,
              onUndo: () => restoreWorkoutDetached(snapshot),
            });
          }}
          onCollapse={onClose}
        />
      </SectionErrorBoundary>
      <ConfirmDialog
        open={confirmOpen}
        title={finishCopy.title}
        description={
          <>
            {buildFinishConfirmSummary({
              ...(summarizeWorkoutForFinish({
                ...activeWorkout,
                endedAt: peekPendingRetroEnd(activeWorkout.id),
              }) ?? { durationSec: 0, items: 0, tonnageKg: 0 }),
              doneItems: computeWorkoutDoneItemCount(activeWorkout),
              sets: computeWorkoutSetCount(activeWorkout),
            })}
            . {finishUndoHint()}
          </>
        }
        // Завершення не деструктивне (його можна відкотити 10 с): основна
        // чорна кнопка, як на погодженому мокапі, а не червона.
        danger={false}
        confirmLabel={finishCopy.confirm}
        cancelLabel={finishCopy.cancel}
        onConfirm={() => handleFinish({ acknowledged: true })}
        onCancel={() => setConfirmOpen(false)}
      />
      {longSessionEnd ? (
        <LongSessionDialog
          open
          startedAt={activeWorkout.startedAt}
          plannedEndedAt={longSessionEnd}
          onConfirm={(endIso) => handleFinish({ endIso })}
          onKeepAsIs={() => handleFinish({ acknowledged: true })}
          onClose={() => setLongSessionEnd(null)}
        />
      ) : null}
    </>
  );
}
