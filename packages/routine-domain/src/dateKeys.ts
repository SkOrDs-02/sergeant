/**
 * Date-key helpers for the Routine module — pure, timezone-free.
 *
 * The routine module keys calendar data by local-YYYY-MM-DD strings
 * (never UTC) so that "today" on the user's phone always matches
 * "today" in the store, regardless of host OS tz settings. All helpers
 * here operate on those strings or on `Date` objects constructed from
 * them.
 *
 * Extracted from `apps/web/src/modules/routine/lib/hubCalendarAggregate.ts`
 * and `weekUtils.ts` (Phase 5 / PR 2). The web `hubCalendarAggregate.ts`
 * still owns the storage-bound `loadMonthlyPlanDays`
 * / `loadTemplateNameById` / `buildHubCalendarEvents` bits.
 */

export function dateKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, day || 1);
}

export function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const d = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  d.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  while (d <= end) {
    out.push(dateKeyFromDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday-first ISO week start (00:00 local); mutates a copy, not the arg. */
export function startOfIsoWeek(d: Date): Date {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  x.setHours(12, 0, 0, 0);
  return x;
}

/** Пн=0 … Нд=6 */
export function isoWeekdayFromDateKey(dateKey: string): number {
  const d = parseDateKey(dateKey);
  return (d.getDay() + 6) % 7;
}
