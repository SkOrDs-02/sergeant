import { useMemo } from "react";
import { maxActiveStreak, maxStreakAllTime } from "../lib/streaks";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import type { RoutineState } from "../lib/types";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Fires when the current cross-habit streak is exactly one day away from
 * the user's personal all-time record — i.e. `currentStreak === longestStreak - 1`.
 *
 * `currentStreak` = `maxActiveStreak` across all active habits (today's date
 * in Kyiv tz as anchor).
 * `longestStreak` = max of `maxStreakAllTime` per active habit — purely local,
 * derived from completion history.
 *
 * Returns `null` when the condition is not met, or when either value is 0.
 */
export function useStreakRecordPendingInsight(
  routine: RoutineState,
): Insight | null {
  const todayKey = getKyivDayKey();

  const currentStreak = useMemo(
    () => maxActiveStreak(routine.habits, routine.completions, todayKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routine.habits, routine.completions, todayKey],
  );

  const longestStreak = useMemo(() => {
    let best = 0;
    for (const h of routine.habits) {
      if (h.archived) continue;
      best = Math.max(best, maxStreakAllTime(h, routine.completions[h.id]));
    }
    return best;
  }, [routine.habits, routine.completions]);

  return useMemo((): Insight | null => {
    if (longestStreak <= 0) return null;
    if (currentStreak !== longestStreak - 1) return null;
    return {
      id: "routine-streak-record-pending",
      module: "routine",
      title: `Серія: ${currentStreak} днів`,
      subtitle: `Ще один — і рекорд ${longestStreak}`,
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    };
  }, [currentStreak, longestStreak]);
}
