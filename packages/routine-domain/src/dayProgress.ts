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

import { habitScheduledOnDate } from "./schedule.js";
import {
  completionRateForRange,
  type CompletionRateResult,
} from "./streaks.js";
import type { Habit, HabitSkip } from "./types.js";
import { isFlexibleHabit, weekDoneCountExcludingDate } from "./weeklyTarget.js";

export function calcRoutineDayProgress(
  habits: Habit[],
  completions: Record<string, string[]>,
  focusedDay: string,
  todayKey: string,
  skips: Record<string, Record<string, HabitSkip>> = {},
): CompletionRateResult {
  // Гнучка звичка («N разів на тиждень») — клас А спеки
  // `routine-flexible-weekly-frequency.md`: для одного дня питання те саме, що
  // у списку дня, — «чи треба її сьогодні?», з `weekDoneCount`. Через
  // `completionRateForRange` вона йшла б цільовою арифметикою ТИЖНЯ з
  // `weekDoneCount: 0`, тож однодневне вікно давало їй `min(1, ціль) = 1` у
  // знаменнику навіть після добраної цілі — кільце «2 з 3» при двох рядках
  // «Зроблено» (аудит 2026-10-01, logic-11). Тому її рахуємо окремо.
  const regular = habits.filter((h) => !isFlexibleHabit(h));
  const base = completionRateForRange(
    regular,
    completions,
    focusedDay,
    focusedDay,
    { pausedFrom: todayKey, skips, includeOnce: true },
  );

  let completed = base.completed;
  let scheduled = base.scheduled;
  for (const h of habits) {
    if (h.archived || !isFlexibleHabit(h)) continue;
    const doneList = completions[h.id];
    const isDone = Array.isArray(doneList) && doneList.includes(focusedDay);
    if (
      !habitScheduledOnDate(h, focusedDay, {
        pausedFrom: todayKey,
        weekDoneCount: weekDoneCountExcludingDate(doneList, focusedDay),
      })
    ) {
      continue;
    }
    // «Не зміг з причиною» виходить зі знаменника (канон §5) — як у решти.
    if (skips[h.id]?.[focusedDay] && !isDone) continue;
    scheduled += 1;
    if (isDone) completed += 1;
  }

  return {
    completed,
    scheduled,
    rate: scheduled > 0 ? completed / scheduled : 0,
  };
}
