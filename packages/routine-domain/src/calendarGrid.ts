/**
 * Pure calendar grid / day-bucket helpers shared by web + mobile.
 *
 * Extracted from `apps/web/src/modules/routine/RoutineApp.tsx` (Phase 5
 * / PR 2). Behaviour unchanged.
 */

import { dateKeyFromDate } from "./dateKeys.js";
import type { CalendarRange, HubCalendarEvent } from "./types.js";
import { FINYK_SUB_GROUP_LABEL, FIZRUK_GROUP_LABEL } from "./calendarEvents.js";

/**
 * Current local date snapped to 12:00 so day arithmetic never spills
 * across a DST boundary.
 */
export function todayDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

/** First + last date-key ("YYYY-MM-DD") of a given calendar month. */
export function monthBounds(y: number, m0: number): CalendarRange {
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  return {
    startKey: dateKeyFromDate(start),
    endKey: dateKeyFromDate(end),
  };
}

/**
 * 42-cell month-grid (6 rows × 7 cols, Monday-first). Leading /
 * trailing days outside the current month are rendered as `null`.
 */
export function monthGrid(
  y: number,
  monthIndex: number,
): { cells: Array<number | null> } {
  const last = new Date(y, monthIndex + 1, 0).getDate();
  const firstWd = (new Date(y, monthIndex, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells };
}

/** Habit-list grouping order for the day/week list. */
export const HABIT_TIME_GROUPS = [
  "Ранок",
  "День",
  "Вечір",
  "Будь-коли",
] as const;
export const GROUP_ORDER = [
  ...HABIT_TIME_GROUPS,
  FIZRUK_GROUP_LABEL,
  FINYK_SUB_GROUP_LABEL,
] as const;

/** Bucket an `HH:MM` time-of-day into one of the four habit groups. */
export function timeOfDayBucket(hhmm: string | null | undefined): string {
  const t = (hhmm || "").trim();
  if (!t) return "Будь-коли";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return "Будь-коли";
  const h = Number(m[1]);
  if (!Number.isFinite(h)) return "Будь-коли";
  if (h < 12) return "Ранок";
  if (h <= 18) return "День";
  return "Вечір";
}

/**
 * Group list events into ordered `[head, events[]]` tuples for the
 * Day/Week views. Fizruk/Finyk events bucket into their own groups;
 * routine habits bucket by `timeOfDay` fallback to "Будь-коли".
 */
export function groupEventsForList(
  events: HubCalendarEvent[],
): Array<[string, HubCalendarEvent[]]> {
  const map = new Map<string, HubCalendarEvent[]>();
  for (const e of events) {
    let head: string;
    if (e.fizruk) head = FIZRUK_GROUP_LABEL;
    else if (e.finykSub) head = FINYK_SUB_GROUP_LABEL;
    else if (e.sourceKind === "habit") head = timeOfDayBucket(e.timeOfDay);
    else head = e.tagLabels[0] || "Інше";
    const existing = map.get(head);
    if (existing) existing.push(e);
    else map.set(head, [e]);
  }
  return [...map.entries()].sort((a, b) => {
    const ai = (GROUP_ORDER as readonly string[]).indexOf(a[0]);
    const bi = (GROUP_ORDER as readonly string[]).indexOf(b[0]);
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "uk");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
