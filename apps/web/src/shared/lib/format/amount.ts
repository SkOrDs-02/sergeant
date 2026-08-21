/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Canonical money-input parser for apps/web forms.
 *
 * AI-CONTEXT: Sergeant currently carries two money units — banking
 * transactions in kopiykas, manual expenses in hryvnia (see
 * `docs/02-engineering/architecture/domain-invariants.md` § Money). This
 * module does NOT unify them. It only guarantees that *parsing and bound
 * checks* happen on integers, so a `12.345` or `1e9` never reaches a
 * storage layer. Callers convert back to whatever unit their wire format
 * already uses and must name the unit in the variable
 * (`amountMinor` / `amountHryvnia`).
 */

/** Minimum accepted amount — 0.01 ₴. Zero and negatives are invalid. */
export const MIN_AMOUNT_MINOR = 1;
/** Maximum accepted amount — 10 000 000.00 ₴. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;
/** Та сама стеля в гривнях — для полів, що зберігають major units. */
export const MAX_AMOUNT_HRYVNIA = MAX_AMOUNT_MINOR / 100;

export type AmountParseError =
  "empty" | "not-a-number" | "too-small" | "too-large";

export type AmountParseResult =
  { ok: true; minor: number } | { ok: false; error: AmountParseError };

/** User-facing Ukrainian message for each failure mode. */
export const AMOUNT_ERROR_MESSAGE: Record<AmountParseError, string> = {
  empty: "Вкажи суму",
  "not-a-number": "Сума має бути числом",
  "too-small": "Сума має бути більше 0",
  "too-large": "Максимальна сума: 10 000 000 ₴",
};

// Every space-ish separator a UA keyboard or a paste from a bank
// statement can inject between digit groups: plain space, nbsp,
// narrow nbsp, thin space, apostrophe.
const GROUP_SEPARATORS = /[\s\u00a0\u202f\u2009']/g;

/**
 * Normalise raw input to a canonical decimal string: trim, drop digit-group
 * separators, `,` → `.`. Does not validate — pair with `parseAmountToMinor`.
 */
export function normalizeAmountInput(raw: string): string {
  return raw.replace(GROUP_SEPARATORS, "").replace(",", ".").trim();
}

/**
 * Parse user input into whole minor units (kopiykas).
 *
 * Rejects `NaN`, `±Infinity`, exponential notation (`1e9`), negatives,
 * zero, and anything above `MAX_AMOUNT_MINOR`. More than two decimals are
 * rounded to the nearest kopiyka rather than rejected — a mobile keyboard
 * producing `12.345` is a slip, not an attack.
 */
export function parseAmountToMinor(raw: string): AmountParseResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "empty" };
  }
  const normalized = normalizeAmountInput(raw);
  if (normalized === "") return { ok: false, error: "empty" };
  // Exponential notation parses fine but reads as a typo to the user and
  // silently smuggles a billion past a `<= max` check on the raw string.
  if (/[eE]/.test(normalized)) return { ok: false, error: "not-a-number" };
  // Strict decimal shape — `Number()` alone would accept "0x10", " ", "1.".
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: "not-a-number" };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: "not-a-number" };
  // toFixed before rounding: `12.345 * 100` is 1234.4999… in binary float,
  // which would round *down* to 12.34.
  const minor = Math.round(Number((value * 100).toFixed(4)));
  if (minor < MIN_AMOUNT_MINOR) return { ok: false, error: "too-small" };
  if (minor > MAX_AMOUNT_MINOR) return { ok: false, error: "too-large" };
  return { ok: true, minor };
}

/**
 * Canonical input-field representation of a minor-unit amount. Whole
 * hryvnia render without decimals (`100`), fractional amounts always with
 * two (`12.50`) so the user sees exactly how the input was understood.
 */
export function formatMinorAsInput(minor: number): string {
  const abs = Math.round(minor);
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}

/**
 * Blur-time canonicalisation: returns the canonical string for valid
 * input, and the original (trimmed) string for invalid input so the user
 * keeps what they typed alongside the validation error.
 */
export function canonicalizeAmountInput(raw: string): string {
  const parsed = parseAmountToMinor(raw);
  return parsed.ok ? formatMinorAsInput(parsed.minor) : raw.trim();
}
