import { useCallback } from "react";
import { currentExerciseMeasurePrefs } from "../lib/exerciseMeasurePrefsCache";
import {
  ACTIVE_WORKOUT_KEY,
  buildPlannedSets,
  collectStrengthSessionPoints,
  computeNextSetAging,
  latestClearedInjuryAtForExercise,
  normalizeWorkoutProgramRef,
  programExercisePlan,
  measureToItemType,
  resolveExerciseMeasure,
  progressionTopSet,
  recoveryConflictsForExercise,
  suggestNextSet,
  uncappedEpley1rm,
  type InjuryMark,
  type ProgramSessionPlan,
  type WorkoutProgramRef,
} from "@sergeant/fizruk-domain";
import {
  collectExerciseHistory,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import {
  findExerciseById,
  type InjurySiteId,
} from "@sergeant/fizruk-domain/data";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { trackFizrukWorkoutStarted } from "../lib/workoutTelemetry";

interface Exercise {
  id: string;
  name?: { uk?: string; en?: string };
  primaryGroup?: string;
  muscles?: { primary?: string[]; secondary?: string[] };
}

interface Session {
  exerciseIds?: readonly string[];
  progressionKg?: number;
  plan?: ProgramSessionPlan;
}

type RecoveryBy = Parameters<typeof recoveryConflictsForExercise>[1];

interface WorkoutsApi {
  workouts: readonly Workout[];
  createWorkout: (init?: { programRef?: WorkoutProgramRef }) => {
    id: string;
  };
  addItem: (workoutId: string, item: Partial<WorkoutItem>) => string;
}

/**
 * Вага першого підходу вправи програми.
 *
 * Без режиму повернення — як і раніше: максимум останньої сесії + крок
 * програми. У режимі повернення (пауза понад поріг або свіже зняття
 * позначки травми) крок програми НЕ додається, а вага береться з тієї самої
 * підказки, що й у тренуванні (`computeNextSetAging` + `suggestNextSet`):
 * канон §6 і журнал 2026-08-31 — «у режимі повернення вагу не підвищує».
 * Раніше старт програми додавав крок до старого максимуму навіть після
 * пів року паузи (аудит 2026-11-17, §3.4).
 */
function programStartWeightKg(
  ex: Exercise,
  workouts: readonly Workout[],
  progressionKg: number,
  injuryMarks: readonly InjuryMark[],
): number {
  if (progressionKg <= 0) return 0;
  const lastWorkoutWithEx = workouts.find((wo) =>
    (wo.items || []).some((it) => it.exerciseId === ex.id),
  );
  if (!lastWorkoutWithEx) return 0;
  const item = lastWorkoutWithEx.items?.find((it) => it.exerciseId === ex.id);
  const maxWeight = Math.max(
    0,
    ...(item?.sets || []).map((s) => s.weightKg || 0),
  );
  if (maxWeight <= 0) return 0;

  const top = progressionTopSet(item?.sets);
  if (top) {
    const aging = computeNextSetAging({
      lastBest1rm: uncappedEpley1rm(top),
      lastSessionAt: lastWorkoutWithEx.startedAt ?? null,
      sessions: collectStrengthSessionPoints(
        collectExerciseHistory(workouts, ex.id),
      ),
      injuryClearedAt: latestClearedInjuryAtForExercise(ex, injuryMarks),
    });
    if (aging.returnMode) {
      const soft = suggestNextSet(top, {
        exercise: findExerciseById(ex.id) ?? ex,
        aging,
      });
      return soft ? Math.min(soft.weightKg, maxWeight) : maxWeight;
    }
  }
  return Math.round((maxWeight + progressionKg) * 2) / 2;
}

/**
 * Factory hook for the "start today's program workout" button. Encodes
 * the progression + last-weight logic previously inlined in FizrukApp so
 * the main orchestrator doesn't need to know about `primaryGroup`,
 * `progressionKg`, or the `ACTIVE_WORKOUT_KEY` session handoff.
 *
 * AI-DANGER: старт програми проходить ту саму перевірку, що й старт
 * шаблону (`useWorkoutsOrchestrator.startWorkoutFromTemplate`): жорстке
 * застереження (`hasHardBlock` — червоний мʼяз або активна позначка травми,
 * ADR-0083) спершу питає підтвердження через `onRecoveryConflict`, і лише
 * потім іде конфлікт з активним тренуванням. `recoveryBy` / `injurySites`
 * обовʼязкові: без них домен мовчки вважає, що застережень немає.
 */
export function useFizrukProgramStart({
  workouts,
  createWorkout,
  addItem,
  exercises,
  navigate,
  onConflict,
  recoveryBy,
  injurySites,
  injuryMarks,
  onRecoveryConflict,
}: WorkoutsApi & {
  exercises: readonly Exercise[];
  navigate: (next: string) => void;
  onConflict?: ((start: () => void) => void) | undefined;
  /** `useRecovery().by` — карта втоми мʼязів. */
  recoveryBy: RecoveryBy;
  /** `useRecovery().injurySites` — активні позначки травми. */
  injurySites: ReadonlySet<InjurySiteId>;
  /** `useInjuries().all` — усі позначки, для режиму повернення після травми. */
  injuryMarks: readonly InjuryMark[];
  /** Показати підтвердження жорсткого застереження; `start` — продовжити. */
  onRecoveryConflict: (start: () => void) => void;
}) {
  return useCallback(
    (
      session: Session | undefined | null,
      programRef?: WorkoutProgramRef | null,
    ) => {
      if (!session) return;
      const exIds = session.exerciseIds || [];
      const picks = exIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => Boolean(e));
      if (picks.length === 0) return;
      const start = () => {
        const progressionKg = session.progressionKg ?? 0;
        // Слот програми — у тренування (П-10): курсор рухає лише повноцінне
        // тренування з цією привʼязкою.
        // Невалідна пара (слот <0) не пишеться: сервер відхилив би рядок
        // тренування цілком (`invalid_program_ref`).
        const ref = programRef
          ? normalizeWorkoutProgramRef(programRef.programId, programRef.slot)
          : null;
        const w =
          ref && ref !== "invalid"
            ? createWorkout({ programRef: ref })
            : createWorkout();
        for (const ex of picks) {
          const catalogEx = findExerciseById(ex.id) ?? ex;
          // Тип виміру (спека fizruk-exercise-measure-type): памʼять людини →
          // дефолт каталогу (утримання й переноски на час, кардіо
          // дистанцією). План програми підлаштовується під тип, а не
          // навпаки: памʼять сильніша за план (Р-2).
          const measure = resolveExerciseMeasure(
            catalogEx,
            currentExerciseMeasurePrefs(),
          );
          const type = measureToItemType(measure);
          const isStrength = type === "strength";
          const plan = programExercisePlan(session, catalogEx, measure);
          const suggestedWeight = isStrength
            ? programStartWeightKg(ex, workouts, progressionKg, injuryMarks)
            : 0;
          addItem(w.id, {
            exerciseId: ex.id,
            nameUk: ex?.name?.uk || ex?.name?.en || ex.id,
            primaryGroup: ex.primaryGroup || "",
            musclesPrimary: ex?.muscles?.primary || [],
            musclesSecondary: ex?.muscles?.secondary || [],
            measure,
            type,
            // План сесії як порожні рядки (П-9, OD-32): лічильник одразу
            // «0 з N», зарахованим рядок стає лише з лічильною величиною
            // (повтори, секунди, метри). Утримання — N рядків секунд
            // (плейсхолдер — діапазон плану в рядку), кардіо — один рядок
            // (спека типу виміру, зріз 4).
            sets: buildPlannedSets(
              isStrength || plan.kind === "time" ? plan.sets : 1,
              suggestedWeight,
            ),
            durationSec: 0,
            ...(type === "distance" ? { distanceM: 0 } : {}),
          });
        }
        safeWriteLS(ACTIVE_WORKOUT_KEY, w.id);
        trackFizrukWorkoutStarted(w.id, "template");
        navigate(`workout/${w.id}`);
      };
      const proceed = () => {
        if (workouts.some((workout) => !workout.endedAt) && onConflict) {
          onConflict(start);
          return;
        }
        start();
      };
      const risky = picks.some(
        (ex) =>
          recoveryConflictsForExercise(ex, recoveryBy, injurySites)
            .hasHardBlock,
      );
      if (risky) {
        onRecoveryConflict(proceed);
        return;
      }
      proceed();
    },
    [
      workouts,
      createWorkout,
      addItem,
      exercises,
      navigate,
      onConflict,
      recoveryBy,
      injurySites,
      injuryMarks,
      onRecoveryConflict,
    ],
  );
}
