/**
 * Моменти завершеного тренування (ADR-0096).
 *
 * Рушій інсайтів питається про список тренувань до і після завершення,
 * тож поріг береться з самого рушія, а не переписується тут.
 */

import {
  WORKOUT_INSIGHT_MIN_WORKOUTS,
  workoutDayInsight,
  workoutKcalInsight,
  type Workout,
} from "../../lib/insightsEngine";
import type { NutritionLog } from "../../../modules/nutrition/lib/nutritionStorage";
import { approachRemaining, pickRarest, type Moment } from "./moments";

/** Список «після»: те саме тренування, але вже завершене. */
export function withWorkoutFinished(
  workouts: readonly Workout[],
  startedAt: string,
  endedAt: string,
): Workout[] {
  return workouts.map((w) =>
    w.startedAt === startedAt && !w.endedAt ? { ...w, endedAt } : w,
  );
}

export interface WorkoutMomentInput {
  before: readonly Workout[];
  after: readonly Workout[];
  log: NutritionLog;
  /** Id тренування: рядок живе в його підсумку. */
  target: string;
}

export function detectWorkoutMoment({
  before,
  after,
  log,
  target,
}: WorkoutMomentInput): Moment | null {
  const candidates: Moment[] = [];

  const insights = [
    (w: Workout[]) => workoutDayInsight(w),
    (w: Workout[]) => workoutKcalInsight(w, log),
  ];
  for (const insight of insights) {
    const now = insight([...after]);
    if (now && !insight([...before])) {
      candidates.push({ kind: "threshold", target, detail: now.title });
    }
  }

  // Найкращий день тижня вимагає лише кількості: від 16 тренувань на сім
  // днів тижня якийсь день гарантовано має три, тож обіцянка чесна.
  const finished = after.filter((w) => w.endedAt).length;
  const remaining = approachRemaining(finished, WORKOUT_INSIGHT_MIN_WORKOUTS);
  if (remaining !== null) {
    candidates.push({ kind: "approach", target, value: remaining });
  }

  return pickRarest(candidates);
}
