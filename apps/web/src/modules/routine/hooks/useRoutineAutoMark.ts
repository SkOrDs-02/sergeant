/**
 * Автовідмітка звичок із подій інших модулів (Р-1 (в), рішення founder-а
 * 2026-11-18). Змонтовано в `RoutineBootCluster`, тож слухає всю сесію, а
 * не лише коли відкрито Рутину.
 *
 * Подія приходить шиною `hubBus` `routineAutoMark` від модуля-власника на
 * цьому пристрої. Правила (лише сьогодні, знята сьогодні відмітка не
 * повертається, «не зміг» не перебивається) — у домені `applyAutoMarkSignal`;
 * памʼять «знято сьогодні» — `routineCounterStorage.ts`.
 *
 * Винагорода та сама, що в тапу: рядок моменту через `recordRoutineMoment`.
 * Подія `routine_habit_checked` іде з `source: "auto"`: це не мотивований
 * чекін, дашборд петлі виключає його так само, як `bulk` і `chat`.
 */
import { useEffect } from "react";
import { onHubBus } from "@shared/lib/modules/hubBus";

import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { applyAutoMarkFromSignal } from "../lib/routineCounterStorage";
import { recordRoutineMoment } from "../lib/routineMoments";

export function handleRoutineAutoMarkSignal(detail: {
  source: "fizruk_workout" | "nutrition_water_goal" | "finyk_expense";
  dayKey: string;
}): string[] {
  const { prev, next, markedHabitIds } = applyAutoMarkFromSignal(
    detail.source,
    detail.dayKey,
  );
  for (const habitId of markedHabitIds) {
    recordRoutineMoment(prev, next, habitId, detail.dayKey);
    trackEvent(ANALYTICS_EVENTS.ROUTINE_HABIT_CHECKED, {
      state: "done",
      source: "auto",
      auto_source: detail.source,
      day_key: detail.dayKey,
      scope: "max_across_habits",
      saw_streak_surface: null,
      streak_days_at_checkin: null,
      ms_since_streak_shown: null,
    });
  }
  return markedHabitIds;
}

export function useRoutineAutoMark(): void {
  useEffect(() => onHubBus("routineAutoMark", handleRoutineAutoMarkSignal), []);
}
