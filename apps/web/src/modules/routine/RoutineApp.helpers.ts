/**
 * Pure helpers for the RoutineApp composition root.
 *
 * Split out as part of the Phase 2 decomposition (initiative 0001) so
 * the composition root in `RoutineApp.tsx` stays under the 600-LOC
 * lint guard. Nothing here depends on React — these are date math,
 * grouping, and constant utilities that can be unit-tested without
 * mounting a component tree.
 */

import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import {
  dateKeyFromDate,
  FIZRUK_GROUP_LABEL,
} from "./lib/hubCalendarAggregate";
import { FINYK_SUB_GROUP_LABEL } from "./lib/finykSubscriptionCalendar";
import type { HubCalendarEvent } from "./lib/types";

export interface MonthCursor {
  y: number;
  m: number;
}

export interface DateRange {
  startKey: string;
  endKey: string;
}

export const FIZRUK_PLAN_SYNC = "fizruk-storage-monthly-plan";

export const HABIT_TIME_GROUPS = ["Ранок", "День", "Вечір", "Будь-коли"];

export const GROUP_ORDER = [
  ...HABIT_TIME_GROUPS,
  FIZRUK_GROUP_LABEL,
  FINYK_SUB_GROUP_LABEL,
];

export function todayDate(): Date {
  // Returns a `Date` whose **local** year/month/day match Kyiv's, set at
  // local noon to keep `dateKeyFromDate()` (which uses local-TZ getters
  // by routine-domain contract) anchored on the correct calendar day for
  // users whose host clock is not in Europe/Kyiv (consolidated page-audit
  // § Theme 1 — 09 F3).
  const { year, month, day } = getKyivDateParts();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function monthBounds(y: number, m0: number): DateRange {
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  return {
    startKey: dateKeyFromDate(start),
    endKey: dateKeyFromDate(end),
  };
}

export function monthGrid(
  y: number,
  monthIndex: number,
): { cells: Array<number | null> } {
  // Civil-calendar arithmetic only: we want "how many days in month X of year Y"
  // and "what weekday is the 1st of X/Y" — both are timezone-independent for a
  // fixed (y, monthIndex) tuple, so UTC getters give the same answer as host-
  // local while satisfying sergeant-design/prefer-kyiv-time (Kyiv-tz routing is
  // for *current-time* boundaries, not abstract month skeletons).
  const last = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  const firstWd = (new Date(Date.UTC(y, monthIndex, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells };
}

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
  return [...map.entries()].sort(([aKey], [bKey]) => {
    const ai = GROUP_ORDER.indexOf(aKey);
    const bi = GROUP_ORDER.indexOf(bKey);
    if (ai === -1 && bi === -1) return aKey.localeCompare(bKey, "uk");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
