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
