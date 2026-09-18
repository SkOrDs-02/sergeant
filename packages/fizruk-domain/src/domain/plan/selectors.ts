/**
 * Pure selectors over `MonthlyPlanState` + planned-workout lists.
 *
 * These mirror the `useMemo` bodies of the legacy web `PlanCalendar`
 * (aggregation of planned workouts by date, today's template lookup,
 * etc.) so both platforms stay byte-identical in their computed views.
 */

import { dateKeyFromYMD, todayDateKey } from "./calendar.js";
import type {
  MonthlyPlanState,
  PlannedByDate,
  PlannedWorkoutLike,
} from "./types.js";

/** Template id assigned to a given date (or `null` when unset). */
export function getTemplateForDate(
  state: MonthlyPlanState,
  dateKey: string,
): string | null {
  return state.days[dateKey]?.templateId ?? null;
}

/**
 * Template id assigned to today (or `null`). Accepts a `now` seam so
 * tests can freeze the clock without stubbing `Date` globally.
 */
export function getTodayTemplateId(
  state: MonthlyPlanState,
  now: Date = new Date(),
): string | null {
  return getTemplateForDate(state, todayDateKey(now));
}

/**
 * Bucket `workouts[]` into a `{ [dateKey]: Workout[] }` map keyed by
 * the local-date prefix of `startedAt`. Only `planned` workouts with
 * a non-empty `startedAt` contribute; order within a bucket follows
 * the input array so callers can sort upstream if they need to.
 *
 * Matches the web `plannedByDate` memo in
 * `apps/web/src/modules/fizruk/pages/PlanCalendar.tsx`.
 */
export function aggregatePlannedByDate(
  workouts: readonly PlannedWorkoutLike[] | null | undefined,
): PlannedByDate {
  const out: PlannedByDate = {};
  if (!workouts) return out;
  for (const w of workouts) {
    if (!w || w.planned !== true) continue;
    const started = typeof w.startedAt === "string" ? w.startedAt : "";
    if (started.length < 10) continue;
    const key = started.slice(0, 10);
    const list = out[key];
    if (list) list.push(w);
    else out[key] = [w];
  }
  return out;
}

/** Count of dates in `(year, monthIndex)` that have ≥1 planned workout. */
export function countPlannedDaysInMonth(
  plannedByDate: PlannedByDate,
  year: number,
  monthIndex: number,
): number {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const k = dateKeyFromYMD(year, monthIndex, d);
    const list = plannedByDate[k];
    if (list && list.length > 0) n++;
  }
  return n;
}

/** Count of dates in `(year, monthIndex)` that have a template assigned. */
export function countPlannedTemplatesInMonth(
  state: MonthlyPlanState,
  year: number,
  monthIndex: number,
): number {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const k = dateKeyFromYMD(year, monthIndex, d);
    if (state.days[k]?.templateId) n++;
  }
  return n;
}

/**
 * `true` when the month at `(year, monthIndex)` has no planned
 * workouts *and* no assigned templates — i.e. the calendar grid is
 * entirely empty and callers can render an empty-state CTA.
 */
export function monthIsEmpty(
  state: MonthlyPlanState,
  plannedByDate: PlannedByDate,
  year: number,
  monthIndex: number,
): boolean {
  return (
    countPlannedTemplatesInMonth(state, year, monthIndex) === 0 &&
    countPlannedDaysInMonth(plannedByDate, year, monthIndex) === 0
  );
}
