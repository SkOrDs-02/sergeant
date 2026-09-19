/**
 * Вага одиниці активності: «повноцінне тренування» ≠ «легка активність» —
 * pure.
 *
 * AI-CONTEXT: канон [`fizruk.md §8`] дослівно: **«Не рівні — типи матимуть
 * вагу»**, і семантику треба закласти ДО розширення на не-силові типи, а не
 * патчити після. До цього файлу код був нерівним стихійно: для стріку
 * будь-яке завершене тренування важило однаково (`isCompletedWorkout`), тож
 * дві хвилини відтискань і півтори години ніг рухали серію на один і той
 * самий крок. Це та сама помилка, яку §7 називає для щоденного стріку:
 * метрика, що нічого не розрізняє, нічого й не каже.
 *
 * Рішення власника 2026-09-15: **легка активність не продовжує стрік, але
 * лишається видимою на дні.** Тобто вага впливає рівно на стрік (і на те, що
 * з нього похідне — Hub-картка, digest); у журнал, відновлення й калорії
 * легкий запис іде без знижок — він відбувся, і тіло це відчуло.
 *
 * Поріг «повноцінного» — **одне з двох**: тривалість від 20 хвилин АБО
 * силова частина від трьох зарахованих підходів. Тривалість покриває
 * заняття за часом (біг, йога, групове), підходи — детальні силові: коротке
 * силове на три підходи не зобовʼязане тягнути 20 хвилин по годиннику, а
 * швидкий запис «+20 відтискань» (один підхід, пів хвилини) свідомо лишається
 * легким. Той самий поріг закриває розвилку Strava-спеки про імпортовані
 * активності — ще одна причина не ховати його в стріку, а винести сюди.
 *
 * ⚠️ Числа — інженерний дефолт із ратифікованою ФОРМОЮ (власник обрав саме
 * «легка не продовжує стрік»; 20 хв і 3 підходи — пропозиція з того ж
 * рішення). Зміна порогів рухає видиме число серії і йде разом із бампом
 * `METRICS_VERSION`.
 */

import {
  computeWorkoutDurationSec,
  computeWorkoutSetCount,
} from "./journal.js";
import type { WorkoutSummaryInput } from "./types.js";

/**
 * Вхід ширший за `WorkoutSummaryInput` рівно на `startedAt: null`: стрік
 * годує сюди `DashboardWorkoutInput`, чиї мітки часу nullable. Один тип на
 * обох споживачів — щоб предикат не мав двох копій під різні nullability.
 */
export interface WorkoutWeightInput {
  startedAt?: string | null | undefined;
  endedAt?: string | null | undefined;
  items?: WorkoutSummaryInput["items"];
}

function toSummaryInput(w: WorkoutWeightInput): WorkoutSummaryInput {
  return {
    startedAt: w.startedAt ?? undefined,
    endedAt: w.endedAt ?? null,
    items: w.items,
  };
}

/** Від скількох секунд заняття рахується повноцінним за тривалістю. */
export const FULL_WORKOUT_MIN_DURATION_SEC = 20 * 60;

/** Від скількох зарахованих силових підходів — повноцінним за обʼємом. */
export const FULL_WORKOUT_MIN_STRENGTH_SETS = 3;

/**
 * Вага запису. `full` рухає стрік; `light` — лише факт на дні.
 *
 * Незавершене тренування ваги не має (`null`): рахувати його ні в стрік, ні
 * в «легке» нема підстав, доки воно триває.
 */
export type WorkoutWeight = "full" | "light";

export function classifyWorkoutWeight(
  w: WorkoutWeightInput | null | undefined,
): WorkoutWeight | null {
  if (!w?.endedAt) return null;
  const input = toSummaryInput(w);
  const durationSec = computeWorkoutDurationSec(input) ?? 0;
  if (durationSec >= FULL_WORKOUT_MIN_DURATION_SEC) return "full";
  if (computeWorkoutSetCount(input) >= FULL_WORKOUT_MIN_STRENGTH_SETS) {
    return "full";
  }
  return "light";
}

/** Завершене І повноцінне — саме те, що продовжує стрік. */
export function isFullWorkout(
  w: WorkoutWeightInput | null | undefined,
): boolean {
  return classifyWorkoutWeight(w) === "full";
}

/** Завершене, але легке — видиме на дні, стрік не рухає. */
export function isLightWorkout(
  w: WorkoutWeightInput | null | undefined,
): boolean {
  return classifyWorkoutWeight(w) === "light";
}
