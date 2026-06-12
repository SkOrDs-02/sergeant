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

const KYIV_TZ = "Europe/Kyiv";
const DAY_MS = 24 * 60 * 60 * 1000;

const KYIV_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: KYIV_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Kyiv wall clock at the given instant: Monday-first weekday index (0=Mon)
 *  and milliseconds elapsed on the wall clock since Kyiv midnight. */
function kyivClockOf(ms: number): {
  mondayIndex: number;
  wallMsSinceMidnight: number;
} {
  let weekday = 0;
  let h = 0;
  let m = 0;
  let s = 0;
  for (const p of KYIV_CLOCK_FORMATTER.formatToParts(new Date(ms))) {
    switch (p.type) {
      case "weekday":
        weekday = WEEKDAY_INDEX[p.value] ?? 0;
        break;
      case "hour":
        // Some ICU builds render midnight as "24".
        h = Number(p.value) % 24;
        break;
      case "minute":
        m = Number(p.value);
        break;
      case "second":
        s = Number(p.value);
        break;
      default:
        break;
    }
  }
  const subSecond = ((ms % 1000) + 1000) % 1000;
  return {
    mondayIndex: (weekday + 6) % 7,
    wallMsSinceMidnight: (h * 3600 + m * 60 + s) * 1000 + subSecond,
  };
}

function toMs(d: Date | number | string): number {
  return (d instanceof Date ? d : new Date(d)).getTime();
}

/**
 * Start of the **Europe/Kyiv** calendar day (00:00 Kyiv wall clock)
 * containing the given instant, as a Unix-epoch millisecond timestamp.
 *
 * DST-safe: subtracting the wall-clock time-of-day is only a first
 * approximation (on a DST-transition day wall time ≠ elapsed time), so the
 * candidate is re-checked against the Kyiv wall clock and corrected by the
 * residue. Returns `NaN` for unparseable input.
 */
export function kyivDayStartMs(d: Date | number | string = Date.now()): number {
  const ms = toMs(d);
  if (Number.isNaN(ms)) return NaN;
  let candidate = ms - kyivClockOf(ms).wallMsSinceMidnight;
  // Up to two correction passes: a DST shift between the candidate and the
  // original instant leaves the candidate slightly off midnight (±1h).
  for (let i = 0; i < 2; i += 1) {
    const wall = kyivClockOf(candidate).wallMsSinceMidnight;
    if (wall === 0) break;
    // Shortly after midnight → step back by the residue; shortly before
    // midnight of the target day (wall near 24h) → step forward.
    candidate -= wall <= DAY_MS / 2 ? wall : wall - DAY_MS;
  }
  return candidate;
}

/**
 * Start of the ISO week (Monday 00:00 **Europe/Kyiv**) containing the given
 * instant, as a Unix-epoch millisecond timestamp.
 *
 * Single source of truth for "this week" bucketing per the domain invariant
 * (AGENTS.md § Domain invariants): week boundaries are Kyiv-anchored and
 * Monday-first, never the runtime timezone. DST-safe — stepping back to
 * Monday goes through that day's local noon, which is immune to the ±1h
 * wobble of 23/25-hour DST days. Returns `NaN` for unparseable input.
 */
export function kyivMondayStartMs(
  d: Date | number | string = Date.now(),
): number {
  const ms = toMs(d);
  if (Number.isNaN(ms)) return NaN;
  const { mondayIndex } = kyivClockOf(ms);
  const dayStart = kyivDayStartMs(ms);
  if (mondayIndex === 0) return dayStart;
  const approxMondayNoon = dayStart - mondayIndex * DAY_MS + DAY_MS / 2;
  return kyivDayStartMs(approxMondayNoon);
}
