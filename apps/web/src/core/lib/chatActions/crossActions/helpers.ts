import { getWeekKey } from "../../../insights/useWeeklyDigest";
import { addDays, dateKeyFromDate } from "@sergeant/routine-domain";
import { formatDayRangeUk } from "@shared/lib/time/dayKeyLabel";

/**
 * Convert an ISO-8601 week label `YYYY-Www` (e.g. `2026-W17`) to the
 * `YYYY-MM-DD` of that week's Monday — the format `aggregate*` functions
 * expect. Also accepts a bare `YYYY-MM-DD` for resilience: when the model
 * "guesses" today's day key instead of the week key, we still do the right
 * thing by snapping to that week's Monday.
 *
 * Returns `null` if the input cannot be parsed.
 */
export function weekLabelToMondayKey(input: string): string | null {
  const wwwMatch = /^(\d{4})-W(\d{1,2})$/.exec(input.trim());
  if (wwwMatch) {
    const year = Number(wwwMatch[1]);
    const week = Number(wwwMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
    if (week < 1 || week > 53) return null;
    // Symbolic ISO-8601 week-number arithmetic on caller-supplied year/week,
    // not a today/now read; local getters pair with the local Date
    // constructor above them (ADR-0078 does not apply to parsed input math).
    const jan4 = new Date(year, 0, 4);
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
    const target = new Date(week1Monday);
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    target.setDate(week1Monday.getDate() + (week - 1) * 7);
    return [
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
      target.getFullYear(),
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
      String(target.getMonth() + 1).padStart(2, "0"),
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
      String(target.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (dayMatch) {
    const d = new Date(`${input.trim()}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return getWeekKey(d);
  }
  return null;
}

export function previousWeekKey(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  // weekKey is symbolic (device-local, see getWeekKey), not a today/now
  // read; local getters mirror the local Date constructed above (ADR-0078
  // does not apply to parsed input math).
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
  monday.setDate(monday.getDate() - 7);
  return [
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    monday.getFullYear(),
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    String(monday.getMonth() + 1).padStart(2, "0"),
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: see comment above
    String(monday.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatWeekRangeLabel(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = addDays(monday, 6);
  return formatDayRangeUk(weekKey, dateKeyFromDate(sunday), {
    relative: false,
  });
}

export function diffLine(
  label: string,
  a: number,
  b: number,
  unit: string,
): string {
  const delta = a - b;
  const sign = delta > 0 ? "+" : "";
  return `${label}: ${a}${unit} vs ${b}${unit} (${sign}${delta}${unit})`;
}
