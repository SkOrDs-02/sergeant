/**
 * Format a Date as `YYYY-MM-DD` in the **Europe/Kyiv** timezone.
 *
 * Domain invariant (AGENTS.md): all day boundaries must use Kyiv local time,
 * never UTC and never the server's local zone.
 */
export function toLocalISODate(d: Date | number | string = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "1970-01-01";
  // en-CA gives YYYY-MM-DD; `timeZone` forces Europe/Kyiv regardless of
  // the runtime environment (server UTC, browser in another tz, etc.).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(
    dt,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** UTC midnight (ms) of the calendar date named by a `YYYY-MM-DD` key. */
function dayKeyToUtcMidnight(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * The UTC instant (ms) when the Kyiv calendar day `dayKey` begins.
 *
 * Kyiv is UTC+2 (winter) or UTC+3 (summer); Ukraine switches at 03:00
 * local, so midnight always exists and carries the pre-transition offset.
 * Probes the +3 candidate first and falls back to +2 — no DST tables.
 */
export function kyivDayStartMs(dayKey: string): number {
  const utcMidnight = dayKeyToUtcMidnight(dayKey);
  const summer = utcMidnight - 3 * HOUR_MS;
  return toLocalISODate(summer) === dayKey ? summer : utcMidnight - 2 * HOUR_MS;
}

/**
 * The last millisecond of the Kyiv calendar day `dayKey` (23:59:59.999
 * Kyiv local). DST-safe: derived from the start of the *next* Kyiv day,
 * so 23- and 25-hour transition days resolve correctly.
 */
export function kyivDayEndMs(dayKey: string): number {
  // +26h from day start always lands inside the next Kyiv day, whatever
  // the current day's length (23/24/25h).
  const nextKey = toLocalISODate(kyivDayStartMs(dayKey) + 26 * HOUR_MS);
  return kyivDayStartMs(nextKey) - 1;
}

/**
 * Whole Kyiv **calendar days** between two instants (`a - b`), signed.
 *
 * Unlike `floor(elapsedMs / DAY)`, this counts midnights crossed in
 * Europe/Kyiv: an event yesterday at 23:00 is 1 day ago at 09:00 today,
 * even though only 10 hours elapsed. Domain invariant (AGENTS.md): day
 * boundaries are Kyiv local, never raw 24-hour windows.
 */
export function kyivCalendarDaysBetween(aMs: number, bMs: number): number {
  const a = dayKeyToUtcMidnight(toLocalISODate(aMs));
  const b = dayKeyToUtcMidnight(toLocalISODate(bMs));
  return Math.round((a - b) / DAY_MS);
}
