/**
 * Kyiv-timezone helpers — canonical day/week/parts derivation.
 *
 * Sergeant treats `Europe/Kyiv` as the domain timezone for all
 * user-visible day boundaries (transactions, workouts, habits, chat
 * sessions, search results). The web bundle ships to users on a phone
 * roaming abroad, a desktop with the wrong system clock, or an iPad
 * still in "Cupertino" mode — using the host timezone for "today" /
 * "this week" derivation leaks those differences into the UI.
 *
 * This module is the single source of truth. Direct `new Date()` +
 * `getDate()` / `getMonth()` / `getHours()` is forbidden anywhere a
 * day boundary matters (consolidated page-audit 2026-05-13 § Theme 1
 * — Timezone correctness, 8 High-severity findings collapsed onto this
 * root cause).
 *
 * @lifecycle active
 * @owner @Skords-01
 * @see docs/audits/2026-05-13-consolidated-page-audit.md § Theme 1
 */

import { kyivMondayStartMs } from "@sergeant/shared/utils";

const KYIV_TZ = "Europe/Kyiv";

/**
 * Parts of a date in Kyiv local time. Numbers are 1-indexed where
 * humans expect that (month 1-12, day 1-31) and zero-indexed where the
 * stdlib does (weekday 0=Sunday … 6=Saturday — matches `Date.getDay()`).
 */
export interface KyivDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0=Sunday, 1=Monday … 6=Saturday — matches `Date.getDay()`. */
  weekday: number;
}

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: KYIV_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

function coerce(input?: Date | number): Date {
  if (input == null) return new Date();
  return typeof input === "number" ? new Date(input) : input;
}

/**
 * Decompose a `Date` into Kyiv-local calendar parts. Safe across DST
 * transitions because the underlying `Intl.DateTimeFormat` resolves
 * each part in the target zone for the given UTC instant.
 */
export function getKyivDateParts(input?: Date | number): KyivDateParts {
  const date = coerce(input);
  const parts: Partial<KyivDateParts> = {};
  for (const p of PARTS_FORMATTER.formatToParts(date)) {
    switch (p.type) {
      case "year":
        parts.year = Number(p.value);
        break;
      case "month":
        parts.month = Number(p.value);
        break;
      case "day":
        parts.day = Number(p.value);
        break;
      case "hour":
        parts.hour = Number(p.value) % 24;
        break;
      case "minute":
        parts.minute = Number(p.value);
        break;
      case "second":
        parts.second = Number(p.value);
        break;
      case "weekday":
        parts.weekday = WEEKDAY_INDEX[p.value] ?? 0;
        break;
      default:
        break;
    }
  }
  return parts as KyivDateParts;
}

/**
 * `YYYY-MM-DD` day key in Kyiv local time. Stable across `toLocaleString`
 * locales (always ISO-8601 calendar shape) and across host clock skew.
 *
 * @example
 *   getKyivDayKey(new Date("2026-05-16T23:00:00Z")); // → "2026-05-17"
 */
export function getKyivDayKey(input?: Date | number): string {
  const { year, month, day } = getKyivDateParts(input);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * `YYYY-MM-DD HH:mm` short stamp in Kyiv local time. Used for chat
 * history "today" / "yesterday" decisions where seconds aren't shown.
 */
export function getKyivShortStamp(input?: Date | number): string {
  const { hour, minute } = getKyivDateParts(input);
  return `${getKyivDayKey(input)} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Predicate: is `input` on the same Kyiv-local calendar day as `reference`?
 */
export function isSameKyivDay(
  input: Date | number,
  reference: Date | number = new Date(),
): boolean {
  return getKyivDayKey(input) === getKyivDayKey(reference);
}

/**
 * Parse an ISO calendar key `YYYY-MM-DD` as a Kyiv-local midnight
 * instant. Returns `null` on malformed input or impossible calendar
 * dates (Feb 30, month 13, etc.).
 *
 * The returned `Date` is at Kyiv midnight (00:00:00 local time) of the
 * given calendar day. Useful for "start of day" comparisons.
 */
export function parseKyivDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Construct an instant that's definitely on the target Kyiv day at
  // midday, then snap to midnight of that day. Using midday avoids
  // the DST-spring-forward 00:00–01:00 gap when Kyiv's local clock
  // skips an hour (2025-03-30, 2026-03-29, etc.).
  const middayUtc = Date.UTC(year, month - 1, day, 9, 0, 0);
  const probe = new Date(middayUtc);
  const probeParts = getKyivDateParts(probe);
  // If the UTC midday lands on a different Kyiv calendar day (shouldn't
  // happen for Kyiv since it's UTC+2/+3 — midday UTC is always after
  // local midnight), reject as invalid.
  if (
    probeParts.year !== year ||
    probeParts.month !== month ||
    probeParts.day !== day
  ) {
    return null;
  }
  // Find the Kyiv-local-midnight UTC offset by subtracting the
  // hour/minute/second parts from the probe instant.
  const localMillisSinceMidnight =
    (probeParts.hour * 60 * 60 + probeParts.minute * 60 + probeParts.second) *
    1000;
  return new Date(middayUtc - localMillisSinceMidnight);
}

/**
 * Monday-anchored week start (00:00 Kyiv local) for the week containing
 * `input`. Matches ISO-8601 week convention used by `date.getDay()`
 * with the Monday-first remapping `(getDay() + 6) % 7`.
 *
 * Delegates to the monorepo-wide `kyivMondayStartMs` so packages
 * (`fizruk-domain` weekly buckets) and web pages share one DST-safe
 * implementation — the previous local `dayStart − N×24h` step-back drifted
 * one hour on weeks containing a DST transition.
 */
export function getKyivWeekStart(input?: Date | number): Date {
  return new Date(kyivMondayStartMs(coerce(input)));
}

/**
 * Monday-anchored 0-indexed weekday for "today" in Kyiv local time.
 * Equivalent to the pattern `(new Date().getDay() + 6) % 7` but in the
 * Kyiv timezone.
 *
 * Returns 0=Monday, 1=Tuesday … 6=Sunday — matches typical schedule
 * indexing in fitness/habit modules where Monday is column 0.
 */
export function getKyivMondayIndex(input?: Date | number): number {
  return (getKyivDateParts(input).weekday + 6) % 7;
}

/**
 * Monday-anchored week start as `YYYY-MM-DD` string (Kyiv local).
 *
 * Equivalent to `getKyivDayKey(getKyivWeekStart(input))` — exposed as a
 * named helper so callers that only need the string key do not have to
 * compose two functions. The returned value matches the `weekStart` shape
 * used by the strategic-goals API (`StrategyPage`, WF-26 cron).
 *
 * @example
 *   getKyivWeekStartKey(); // → "2026-06-01" (Monday of current week)
 */
export function getKyivWeekStartKey(input?: Date | number): string {
  return getKyivDayKey(getKyivWeekStart(input));
}

/**
 * Format an ISO instant as a long human-readable date in Kyiv local time
 * using the given locale (default `"uk-UA"`). Returns `null` for `null`,
 * `undefined`, or unparseable input.
 *
 * Suitable for billing dates ("1 червня 2026 р.") and other display-only
 * contexts where the exact Kyiv civil date must be shown regardless of the
 * user's device timezone.
 *
 * @example
 *   formatKyivLongDate("2026-06-01T10:00:00Z"); // → "1 червня 2026 р."
 */
export function formatKyivLongDate(
  iso: string | null | undefined,
  locale = "uk-UA",
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    timeZone: KYIV_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
