/**
 * Canonical "day progress" selector — the "N of M" checklist count for a
 * SINGLE focused day, as opposed to `completionRateForRange`'s arbitrary
 * range.
 *
 * Web's hero (`useRoutineDerivedData.ts`) and mobile's calendar
 * (`apps/mobile/src/modules/routine/pages/Calendar/useCalendarAggregates.ts`)
 * both need this exact shape, but only web accepts `focusedDay` (the day
 * the user is actually looking at — "today", "tomorrow", or an arbitrary
 * picked date) and passes `skips`/`includeOnce` through; mobile pins the
 * count to the real "today" and drops both options. That divergence is
 * two bugs at once (unification audit 2026-08-31, finding 1.19): picking
 * "tomorrow" shows today's numbers under tomorrow's header, and a day
 * with a once-habit undercounts because `includeOnce` is missing.
 *
 * `pausedFrom` is always `todayKey`, never `focusedDay` — the freeze-past
 * semantics of ADR-0079 §2 anchor to "today", not to whichever day is on
 * screen, so a pause set today must not retroactively hide a habit from a
 * day the user is merely LOOKING at.
 */

import {
  completionRateForRange,
  type CompletionRateResult,
} from "./streaks.js";
import type { Habit, HabitSkip } from "./types.js";

export function calcRoutineDayProgress(
  habits: Habit[],
  completions: Record<string, string[]>,
  focusedDay: string,
  todayKey: string,
  skips: Record<string, Record<string, HabitSkip>> = {},
): CompletionRateResult {
  return completionRateForRange(habits, completions, focusedDay, focusedDay, {
    pausedFrom: todayKey,
    skips,
    includeOnce: true,
  });
}
