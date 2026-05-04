/**
 * Pure helpers for the RoutineApp composition root.
 *
 * Split out as part of the Phase 2 decomposition (initiative 0001) so
 * the composition root in `RoutineApp.tsx` stays under the 600-LOC
 * lint guard. Nothing here depends on React — these are date math,
 * grouping, and constant utilities that can be unit-tested without
 * mounting a component tree.
 */

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
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
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
  const last = new Date(y, monthIndex + 1, 0).getDate();
  const firstWd = (new Date(y, monthIndex, 1).getDay() + 6) % 7;
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
  return [...map.entries()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a[0]);
    const bi = GROUP_ORDER.indexOf(b[0]);
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "uk");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
