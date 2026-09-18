/**
 * Shared domain types for the Fizruk **Measurements** screen.
 *
 * Kept platform-neutral so `apps/web` and `apps/mobile` can consume
 * the same selectors, validators and reducers. The storage shape
 * mirrors the loose
 * {@link import("../types.js").MeasurementEntry} used across the web
 * module today (id + ISO `at` + arbitrary numeric fields) but narrows
 * the fields to the strict union understood by the mobile port.
 *
 * Phase 6 scope note: photo progress (`BodyPhoto`) is out of scope
 * per the migration plan — this module is **numeric data only**
 * (weight, body-part circumferences, wellbeing scores).
 */

/**
 * Strict union of the numeric fields a measurement entry can carry on
 * mobile. Web consumers (`useMeasurements`) use a wider union with
 * extra legacy fields (neck, bodyFat%, forearm/thigh/calf, left/right
 * biceps) that are not ported to mobile now — consumers that need
 * them should fall back to the loose `MeasurementEntry` type from
 * `../types.js`.
 */
export type MeasurementFieldId =
  | "weightKg"
  | "waistCm"
  | "chestCm"
  | "hipsCm"
  | "bicepCm"
  | "sleepHours"
  | "energyLevel"
  | "mood";

/**
 * Metadata describing a single measurement field — drives both the
 * form UI and the validator.
 */
export interface MeasurementFieldDef {
  readonly id: MeasurementFieldId;
  /** Ukrainian label shown in the form / list row. */
  readonly label: string;
  /** Short unit suffix (e.g. `"кг"`, `"см"`, empty for 1-5 scores). */
  readonly unit: string;
  /** Inclusive lower bound accepted by {@link validateMeasurementDraft}. */
  readonly min: number;
  /** Inclusive upper bound. */
  readonly max: number;
  /**
   * When `true` the parsed value must be an integer (used for the
   * 1-5 wellbeing scores).
   */
  readonly integer?: boolean;
}

/**
 * Canonical persisted shape for a single measurement entry on mobile.
 *
 * `at` is an ISO timestamp (`new Date().toISOString()`) so the
 * existing `buildWeightTrend` / `buildMeasurementSeries` selectors
 * from `@sergeant/fizruk-domain/domain/progress` can consume the list
 * directly with no adapter layer.
 */
export interface MobileMeasurementEntry {
  readonly id: string;
  readonly at: string;
  readonly weightKg?: number;
  readonly waistCm?: number;
  readonly chestCm?: number;
  readonly hipsCm?: number;
  readonly bicepCm?: number;
  readonly sleepHours?: number;
  readonly energyLevel?: number;
  readonly mood?: number;
}

/**
 * Partial map of raw user input — strings so an empty field is
 * distinguishable from `0`. Validation + normalisation turn this into
 * a {@link MobileMeasurementEntry}.
 */
export type MeasurementDraftValues = Partial<
  Record<MeasurementFieldId, string>
>;

/**
 * Form draft used by the mobile bottom-sheet. `at` is held as an ISO
 * string — the form surfaces a user-friendly label but we keep the
 * machine form to stay platform-neutral here.
 */
export interface MeasurementDraft {
  readonly at: string;
  readonly values: MeasurementDraftValues;
}

/** Per-field validation messages. */
export type MeasurementFieldErrors = Partial<
  Record<MeasurementFieldId, string>
>;

/** Aggregate validation output. */
export interface MeasurementDraftErrors {
  readonly at?: string;
  readonly values?: MeasurementFieldErrors;
  /** Form-level message (e.g. "Вкажи хоча б одне значення"). */
  readonly form?: string;
}
