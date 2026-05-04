/**
 * Pure calendar helpers for the Fizruk monthly-plan view.
 *
 * Deliberately self-contained (no `routine-domain` dep) so `fizruk-domain`
 * keeps a minimal footprint. Semantics match the web implementation in
 * `apps/web/src/modules/fizruk/pages/PlanCalendar.tsx` (Monday-first,
 * local-time `YYYY-MM-DD` keys, padded trailing cells up to a multiple
 * of 7 — *not* always 42). Callers that need a fixed 42-cell grid can
 * pad on top of this.
 */

import type { MonthCursor, MonthGridResult } from "./types.js";

/** Format a local-date `YYYY-MM-DD` key from `(year, monthIndex, day)`. */
export function dateKeyFromYMD(
  year: number,
  monthIndex: number,
  day: number,
): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Format a local-date `YYYY-MM-DD` key from a `Date`. */
export function dateKeyFromDate(d: Date): string {
  return dateKeyFromYMD(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Current local date as a `YYYY-MM-DD` key. The `now` seam makes
 * deterministic testing trivial (`todayDateKey(new Date("2025-03-15"))`).
 */
export function todayDateKey(now: Date = new Date()): string {
  return dateKeyFromDate(now);
}

/** Parse a `YYYY-MM-DD` key into a local-time `Date` (noon-anchored). */
export function parseDateKey(key: string): Date {
  // Під strict-index `arr[i]` дає `number | undefined`, тому збираємо
  // три позиції з явним fallback-ом, замість того щоб покладатись на
  // `Number.isFinite(undefined)` (false) і косу логіку «-1 з NaN».
  const parts = key.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const out = new Date(
    typeof y === "number" && Number.isFinite(y) ? y : 1970,
    (typeof m === "number" && Number.isFinite(m) ? m : 1) - 1,
    typeof d === "number" && Number.isFinite(d) ? d : 1,
  );
  out.setHours(12, 0, 0, 0);
  return out;
}

/** Build a `MonthCursor` from a `Date`. */
export function monthCursorFromDate(d: Date): MonthCursor {
  return { y: d.getFullYear(), m: d.getMonth() };
}

/**
 * Shift a `MonthCursor` by `delta` months, wrapping around year
 * boundaries. `delta` may be any integer.
 */
export function shiftMonthCursor(c: MonthCursor, delta: number): MonthCursor {
  const total = c.y * 12 + c.m + delta;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { y, m };
}

/**
 * Monday-first month grid. Padded with leading `null` cells to align
 * day-1 on its weekday column and trailing `null` cells to a multiple
 * of 7 so the final row is never short. Matches the legacy web
 * implementation exactly.
 */
export function monthGrid(year: number, monthIndex: number): MonthGridResult {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const firstWd = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells };
}
