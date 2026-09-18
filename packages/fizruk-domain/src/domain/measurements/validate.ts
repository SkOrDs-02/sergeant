/**
 * Pure validator for the Fizruk measurement form draft.
 *
 * Shared across web + mobile so the same rules apply everywhere.
 * Returned errors map 1:1 to the form slots the UI renders
 * (per-field + form-level).
 */

import { MEASUREMENT_FIELDS } from "./fields.js";
import { parseMeasurementValue } from "./normalise.js";
import type {
  MeasurementDraft,
  MeasurementDraftErrors,
  MeasurementFieldDef,
  MeasurementFieldErrors,
} from "./types.js";

/** True when the value is strictly an integer (not just finite). */
function isInteger(n: number): boolean {
  return Number.isFinite(n) && Math.trunc(n) === n;
}

function validateField(
  def: MeasurementFieldDef,
  raw: string | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null; // empty = not provided = OK
  const parsed = parseMeasurementValue(trimmed);
  if (parsed == null) return `Не число`;
  if (def.integer && !isInteger(parsed)) return `Ціле число`;
  if (parsed < def.min) return `≥ ${def.min} ${def.unit}`.trim();
  if (parsed > def.max) return `≤ ${def.max} ${def.unit}`.trim();
  return null;
}

/**
 * Validate a draft. Returns an empty `{}` object when the draft is
 * submission-ready. At least one non-empty numeric field is required
 * — otherwise we emit a form-level error.
 *
 * @param draft   The form state.
 * @param fields  Optional override of the field catalogue — tests can
 *                inject a narrower set to exercise branches in
 *                isolation. Defaults to the canonical
 *                {@link MEASUREMENT_FIELDS}.
 */
export function validateMeasurementDraft(
  draft: MeasurementDraft,
  fields: readonly MeasurementFieldDef[] = MEASUREMENT_FIELDS,
): MeasurementDraftErrors {
  const out: {
    at?: string;
    values?: MeasurementFieldErrors;
    form?: string;
  } = {};

  // --- `at` timestamp -----------------------------------------------
  const atParsed = Date.parse(draft.at);
  if (!draft.at || !Number.isFinite(atParsed)) {
    out.at = "Некоректна дата";
  }

  // --- per-field ranges ---------------------------------------------
  const perField: MeasurementFieldErrors = {};
  let anyProvided = false;
  for (const def of fields) {
    const raw = draft.values[def.id];
    const err = validateField(def, raw);
    if (err) perField[def.id] = err;
    if (parseMeasurementValue(raw) != null) anyProvided = true;
  }
  if (Object.keys(perField).length > 0) out.values = perField;

  // --- form-level: at least one field must be provided --------------
  if (!anyProvided) {
    out.form = "Вкажи хоча б одне значення";
  }

  return out;
}

/** True when the validator returned no errors of any kind. */
export function isMeasurementDraftValid(
  errors: MeasurementDraftErrors,
): boolean {
  if (errors.at) return false;
  if (errors.form) return false;
  if (errors.values && Object.keys(errors.values).length > 0) return false;
  return true;
}
