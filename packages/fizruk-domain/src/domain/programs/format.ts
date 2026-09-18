/**
 * Locale-aware labels for training-program cards.
 *
 * Pure / string-only so they compile cleanly for RN + web with no
 * Intl dependencies. Ukrainian plural rules are hand-rolled (the
 * built-in `Intl.PluralRules` would work too but pulls in extra
 * polyfill weight on Hermes).
 */

import type { TrainingProgramDef } from "./types.js";

/**
 * Ukrainian plural category for a non-negative integer.
 * `one` → 1, 21, 31 …
 * `few` → 2–4, 22–24 …
 * `many` → everything else.
 */
export function ukPluralCategory(n: number): "one" | "few" | "many" {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

/** "1 тиждень" / "3 тижні" / "8 тижнів". Clamps non-finite input to 0. */
export function formatDurationWeeks(weeks: number): string {
  const safe = Number.isFinite(weeks) ? Math.max(0, Math.trunc(weeks)) : 0;
  const forms = { one: "тиждень", few: "тижні", many: "тижнів" } as const;
  return `${safe} ${forms[ukPluralCategory(safe)]}`;
}

/**
 * Frequency label — "6 дн/тиждень". Uses the program's `days`
 * directly (matches the web catalogue) so the card copy stays stable
 * across platforms.
 */
export function formatFrequency(program: TrainingProgramDef): string {
  const n = Number.isFinite(program.days) ? Math.max(0, program.days) : 0;
  return `${n} дн/тиждень`;
}

/**
 * Combined "частота · тривалість" line for the program card.
 * Example: `"6 дн/тиждень · 8 тижнів"`.
 */
export function formatProgramCadence(program: TrainingProgramDef): string {
  return `${formatFrequency(program)} · ${formatDurationWeeks(program.durationWeeks)}`;
}
