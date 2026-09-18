/**
 * Pure helpers for turning measurement **drafts** (string-form) into
 * validated **entries** (numeric), and vice-versa for the edit flow.
 *
 * All helpers here are pure and side-effect-free — they live in the
 * domain package so both `apps/web` and `apps/mobile` can share them.
 */

import { MEASUREMENT_FIELDS, MEASUREMENT_FIELD_IDS } from "./fields.js";
import type {
  MeasurementDraft,
  MeasurementDraftValues,
  MeasurementFieldId,
  MobileMeasurementEntry,
} from "./types.js";

/**
 * Parse a raw form value into a finite number, or `null` when the
 * input is blank / non-numeric. Accepts `,` as a decimal separator
 * (common on Ukrainian keyboards — mirrors the `.replace(",", ".")`
 * trick used by the web `Measurements` page).
 *
 * @example
 *   parseMeasurementValue("80,5") // → 80.5
 *   parseMeasurementValue("")     // → null
 *   parseMeasurementValue("abc")  // → null
 */
export function parseMeasurementValue(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Empty draft for the form. `at` defaults to the current wall-clock
 * ISO — callers that want a deterministic value (tests, storybook)
 * can pass an explicit override.
 */
export function emptyMeasurementDraft(
  nowIso: string = new Date().toISOString(),
): MeasurementDraft {
  const values: MeasurementDraftValues = {};
  for (const id of MEASUREMENT_FIELD_IDS) values[id] = "";
  return { at: nowIso, values };
}

/**
 * Build a draft pre-populated from an existing persisted entry — used
 * when the user taps a list row to edit.
 */
export function entryToMeasurementDraft(
  entry: MobileMeasurementEntry,
): MeasurementDraft {
  const values: MeasurementDraftValues = {};
  for (const id of MEASUREMENT_FIELD_IDS) {
    const raw = entry[id];
    values[id] =
      typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
  }
  return { at: entry.at, values };
}

/**
 * Normalise a draft into a persisted entry. Empty / non-numeric
 * fields are **omitted** from the result (not written as `null`) so
 * downstream selectors (`buildWeightTrend`) see a stable shape.
 *
 * Callers should run {@link validateMeasurementDraft} first — this
 * function does not raise on out-of-range values, it just truncates
 * invalid inputs the same way the web page does.
 */
export function normaliseMeasurementDraft(
  draft: MeasurementDraft,
  id: string,
): MobileMeasurementEntry {
  const out: {
    -readonly [K in keyof MobileMeasurementEntry]: MobileMeasurementEntry[K];
  } = {
    id,
    at: draft.at,
  };
  for (const def of MEASUREMENT_FIELDS) {
    const raw = draft.values[def.id];
    const parsed = parseMeasurementValue(raw);
    if (parsed == null) continue;
    out[def.id] = def.integer ? Math.round(parsed) : parsed;
  }
  return out;
}

/**
 * True when the draft has at least one non-empty numeric field. The
 * form submit button disables itself while this returns `false`, so
 * callers can reuse it instead of re-parsing.
 */
export function hasAnyMeasurementValue(draft: MeasurementDraft): boolean {
  for (const id of MEASUREMENT_FIELD_IDS) {
    if (parseMeasurementValue(draft.values[id]) != null) return true;
  }
  return false;
}

/**
 * Overwrite a single field on a draft (pure). Kept here so the form
 * component stays presentational.
 */
export function setMeasurementField(
  draft: MeasurementDraft,
  id: MeasurementFieldId,
  value: string,
): MeasurementDraft {
  return { ...draft, values: { ...draft.values, [id]: value } };
}
