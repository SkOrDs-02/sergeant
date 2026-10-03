/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Length limits for free-text form fields (names, descriptions, notes).
 *
 * Enforced at two layers on purpose: `maxLength` on the input keeps a
 * pasted megabyte out of storage and the sync outbox, and `clampText` is
 * the belt-and-braces call on the write path for values that arrive from
 * voice dictation, AI suggestions or an import — none of which go through
 * a DOM input.
 */

/** Names and short descriptions. */
export const NAME_MAX_LEN = 200;
/** Longer free-form notes (workout notes, meal comments). */
export const NOTE_MAX_LEN = 1000;

/** Trim and hard-cut to `max` characters. */
export function clampText(value: string, max: number = NAME_MAX_LEN): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
