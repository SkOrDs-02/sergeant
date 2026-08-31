import { useMemo } from "react";
import { pluralDays } from "@sergeant/shared";
import { flexibleMaxActiveStreak, maxStreakAllTime } from "../lib/streaks";
import { anchoredTodayKey } from "../lib/dayAnchor";
import type { RoutineState } from "../lib/types";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Fires when the current cross-habit streak is exactly one day away from
 * the user's personal all-time record — i.e. `currentStreak === longestStreak - 1`.
 *
 * `currentStreak` = `flexibleMaxActiveStreak` across all active habits
 * (today's date in Kyiv tz as anchor) — гнучкий стрік, тож заявлена пауза
 * чи пропуск із причиною рекорд не обнуляють.
 * `longestStreak` = max of `maxStreakAllTime` per active habit — purely local,
 * derived from completion history.
 *
 * Returns `null` when the condition is not met, or when either value is 0.
 */
export function useStreakRecordPendingInsight(
  routine: RoutineState,
): Insight | null {
  const todayKey = anchoredTodayKey();

  const currentStreak = useMemo(
    () =>
      flexibleMaxActiveStreak(
        routine.habits,
        routine.completions,
        todayKey,
        routine.skips ?? {},
      ),
    [routine.habits, routine.completions, routine.skips, todayKey],
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
      title: `Серія: ${currentStreak} ${pluralDays(currentStreak)}`,
      subtitle: `Ще один, і рекорд ${longestStreak}`,
      // Стрік тут — cross-habit агрегат (flexibleMaxActiveStreak по ВСІХ
      // активних звичках разом), не конкретна звичка — те саме, що й title
      // вище, без назви. Founder-рішення 2026-08-30: без підстановки назви.
      askAiPrompt: `Сьогодні можу побити особистий рекорд стріку (${currentStreak} ${pluralDays(currentStreak)}). Дай коротку мотивацію і підкажи, як не зірватись завтра.`,
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    };
  }, [currentStreak, longestStreak]);
}
