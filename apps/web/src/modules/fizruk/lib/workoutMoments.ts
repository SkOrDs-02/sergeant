import { deviceDayKey } from "@sergeant/shared";

import { parseFizrukWorkouts } from "../../../core/lib/insightsEngine";
import {
  detectWorkoutMoment,
  withWorkoutFinished,
} from "../../../core/insights/moments/workoutMoments";
import { applyMoment } from "../../../core/insights/moments/momentsStore";
import { loadNutritionLog } from "../../nutrition/lib/nutritionStorage";

/**
 * Момент завершення тренування (ADR-0096). Кличеться ДО `endWorkout`:
 * кеш тренувань ще тримає стан «до», а «після» будується з нього ж.
 */
export function recordWorkoutMoment(
  workoutId: string,
  startedAt: string,
): void {
  const before = parseFizrukWorkouts();
  const after = withWorkoutFinished(
    before,
    startedAt,
    // UTC-мітка `endedAt`, як і в самого `endWorkout`: межу доби вона не
    // задає, день тренування рахується від `startedAt`.
    // eslint-disable-next-line no-restricted-syntax
    new Date().toISOString(),
  );
  const moment = detectWorkoutMoment({
    before,
    after,
    log: loadNutritionLog(),
    target: workoutId,
  });
  if (moment) applyMoment(deviceDayKey(), "fizruk", moment);
}
