/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Soft/hard bounds for user-entered calendar dates.
 *
 * Rationale: "yesterday's receipt" and "habit starting next month" are
 * legitimate; a typo in the year ("3025") is not. We therefore warn on the
 * unusual-but-plausible window and only hard-fail on the absurd one.
 */
import { getKyivDayKey, parseKyivDate } from "./kyivTime";

export type DateBound = "ok" | "warn" | "invalid";

/** Absolute accepted range — outside this a date is a validation error. */
export const HARD_MIN_DAY_KEY = "1970-01-01";
export const HARD_MAX_DAY_KEY = "2100-01-01";

/** Unusual-but-allowed window, relative to today in Kyiv. */
export const SOFT_PAST_YEARS = 5;
export const SOFT_FUTURE_YEARS = 1;

export const DATE_WARN_MESSAGE = "Незвична дата, перевір, чи не помилка в році";
export const DATE_INVALID_MESSAGE = "Дата поза допустимим діапазоном";

function shiftYears(dayKey: string, years: number): string {
  const [y, m, d] = dayKey.split("-");
  return `${String(Number(y) + years).padStart(4, "0")}-${m}-${d}`;
}

/**
 * Classify a `YYYY-MM-DD` day key against the soft and hard windows.
 * Malformed or impossible calendar dates (Feb 30, "not-a-date") are
 * `"invalid"`.
 *
 * @param dayKey  calendar day in `YYYY-MM-DD`
 * @param today   reference day key, defaults to today in Kyiv (test seam)
 */
export function classifyDateBound(
  dayKey: string,
  today: string = getKyivDayKey(),
): DateBound {
  if (!parseKyivDate(dayKey)) return "invalid";
  if (dayKey < HARD_MIN_DAY_KEY || dayKey > HARD_MAX_DAY_KEY) return "invalid";
  // String comparison is safe: both sides are zero-padded ISO calendar keys.
  if (dayKey < shiftYears(today, -SOFT_PAST_YEARS)) return "warn";
  if (dayKey > shiftYears(today, SOFT_FUTURE_YEARS)) return "warn";
  return "ok";
}

/** Convenience: the message to render for a classification, if any. */
export function dateBoundMessage(bound: DateBound): string | null {
  if (bound === "warn") return DATE_WARN_MESSAGE;
  if (bound === "invalid") return DATE_INVALID_MESSAGE;
  return null;
}
