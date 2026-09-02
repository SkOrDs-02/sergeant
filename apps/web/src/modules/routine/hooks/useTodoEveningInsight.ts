import { useMemo } from "react";
import { habitScheduledOnDate } from "@sergeant/routine-domain";
import { anchoredTodayKey } from "../lib/dayAnchor";
import type { RoutineState } from "../lib/types";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Fires after 20:00 device-local time when 2+ habits are still pending today.
 *
 * Cutover 2026-09-01 (LOG-3, ADR-0078): the 20:00 threshold used to read
 * `getKyivDateParts().hour`, so a user abroad got the "evening" nudge at
 * their own local midday (whenever it was 20:00 in Kyiv) — the same class of
 * bug as the day-key regression. The threshold now reads the device's own
 * clock, matching `todayKey` (also device-local via `lib/dayAnchor.ts`).
 *
 * The hour value is memoised from a single `new Date()` sample taken during
 * render. Because we memoize on `[pendingCount, isEvening]`, re-renders
 * driven by routine state changes (habit toggles) naturally re-evaluate the
 * condition; we do NOT start a clock interval here to avoid spurious re-renders
 * between habit interactions.
 */
export function useTodoEveningInsight(routine: RoutineState): Insight | null {
  const todayKey = anchoredTodayKey();
  // ADR-0078: "evening" is the device's own clock, not Kyiv's — matches
  // `todayKey` above.
  // eslint-disable-next-line no-restricted-syntax, sergeant-design/prefer-kyiv-time -- див. коментар вище
  const deviceHour = new Date().getHours();
  const isEvening = deviceHour >= 20;

  const pendingNames = useMemo(() => {
    if (!isEvening) return [];
    const names: string[] = [];
    for (const h of routine.habits) {
      if (h.archived) continue;
      if (!habitScheduledOnDate(h, todayKey)) continue;
      const completions = routine.completions[h.id] ?? [];
      if (!completions.includes(todayKey)) names.push(h.name);
    }
    return names;
  }, [isEvening, routine.habits, routine.completions, todayKey]);

  return useMemo((): Insight | null => {
    if (!isEvening) return null;
    if (pendingNames.length < 2) return null;
    return {
      id: "routine-todo-evening",
      module: "routine",
      title: `${pendingNames.length} звичок чекають`,
      subtitle: "Закрити сьогоднішнє?",
      askAiPrompt: `Вечір, а зі звичок сьогодні не відмічені: ${pendingNames.join(", ")}. Допоможи вирішити, що з цього ще реально зробити, а що чесно перенести.`,
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    };
  }, [isEvening, pendingNames]);
}
