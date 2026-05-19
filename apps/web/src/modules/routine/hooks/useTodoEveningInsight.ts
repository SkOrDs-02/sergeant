import { useMemo } from "react";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { habitScheduledOnDate } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Fires after 20:00 Europe/Kyiv when 2+ habits are still pending today.
 *
 * Time-of-day check uses `getKyivDateParts()` (not `new Date().getHours()`)
 * so the 20:00 threshold respects Kyiv local time for users abroad or with
 * a mismatched system clock (domain invariant — `Europe/Kyiv` for day
 * boundaries).
 *
 * The hour value is memoised from a single `new Date()` sample taken during
 * render. Because we memoize on `[pendingCount, isEvening]`, re-renders
 * driven by routine state changes (habit toggles) naturally re-evaluate the
 * condition; we do NOT start a clock interval here to avoid spurious re-renders
 * between habit interactions.
 */
export function useTodoEveningInsight(routine: RoutineState): Insight | null {
  const todayKey = getKyivDayKey();
  const kyivHour = getKyivDateParts().hour;
  const isEvening = kyivHour >= 20;

  const pendingCount = useMemo(() => {
    if (!isEvening) return 0;
    let pending = 0;
    for (const h of routine.habits) {
      if (h.archived) continue;
      if (!habitScheduledOnDate(h, todayKey)) continue;
      const completions = routine.completions[h.id] ?? [];
      if (!completions.includes(todayKey)) pending += 1;
    }
    return pending;
  }, [isEvening, routine.habits, routine.completions, todayKey]);

  return useMemo((): Insight | null => {
    if (!isEvening) return null;
    if (pendingCount < 2) return null;
    return {
      id: "routine-todo-evening",
      module: "routine",
      title: `${pendingCount} звичок чекають`,
      subtitle: "Закрити сьогоднішнє?",
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    };
  }, [isEvening, pendingCount]);
}
