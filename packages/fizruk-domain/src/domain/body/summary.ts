/**
 * Pure selectors for the Fizruk **Body** dashboard (web + mobile).
 *
 * Більшість хелперів працює над формою `MobileMeasurementEntry[]`, яку
 * віддає `useMeasurements()`. **Виняток — вага тіла:** припущення, що цей
 * масив і є повний набір ваги, хибне (див. `./bodyWeight.ts`) — половина
 * зважувань живе у `fizruk_daily_log`. Саме тут гинула daily_log-історія
 * на mobile Body. Для ваги використовуй union-варіанти нижче
 * ({@link buildBodyWeightSummary}, {@link buildBodySummariesWithWeightUnion}),
 * які приймають обидва джерела.
 *
 * The functions below deliberately do **not** assume any particular
 * ordering of the input array. They re-sort when needed so callers
 * can pass the list straight from the hook without adapter code.
 */

import type { MeasurementFieldId } from "../measurements/types.js";
import {
  selectBodyWeightSamples,
  toBodyWeightEntries,
  type BodyWeightRecordInput,
} from "./bodyWeight.js";
import type {
  BodyMetricSummary,
  BodySummariesByField,
  BodyTrendDirection,
  MobileMeasurementEntry,
} from "./types.js";

/** Default lookback window for the summary delta (mirrors web "week"). */
export const BODY_SUMMARY_WINDOW_DAYS = 7;

/**
 * Small epsilon so 0.0001-level floating-point drift doesn't flip a
 * `flat` metric to `up` / `down`. Weight is the most sensitive field
 * and is typically logged at 0.1 kg resolution, so this is plenty.
 */
const TREND_EPSILON = 1e-6;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  return null;
}

/**
 * Return the entries sorted newest-first by ISO `at`. Entries with
 * unparseable timestamps fall to the bottom so one bad row never
 * hides valid data.
 */
function sortDesc(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
): MobileMeasurementEntry[] {
  const arr = Array.isArray(entries) ? entries.slice() : [];
  arr.sort((a, b) => {
    const at = Date.parse(a.at);
    const bt = Date.parse(b.at);
    const aOk = Number.isFinite(at);
    const bOk = Number.isFinite(bt);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return bt - at;
  });
  return arr;
}

/**
 * Find the most recent entry that has a finite numeric value for
 * `field`, along with that value. Returns `null` when no such entry
 * exists.
 */
export function getLatestMeasurement(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  field: MeasurementFieldId,
): { entry: MobileMeasurementEntry; value: number } | null {
  const sorted = sortDesc(entries);
  for (const e of sorted) {
    const v = toFiniteNumber(e[field]);
    if (v != null) return { entry: e, value: v };
  }
  return null;
}

/**
 * Convenience wrapper over {@link getLatestMeasurement} returning
 * just the numeric value — handy for UI code that only needs the
 * cell value and not the source timestamp.
 */
export function getLatestMeasurementValue(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  field: MeasurementFieldId,
): number | null {
  return getLatestMeasurement(entries, field)?.value ?? null;
}

/**
 * Delta between the most-recent value for `field` and the oldest
 * value for `field` **inside the last `windowDays`** window ending at
 * `nowIso`. Returns `null` when the window has fewer than two
 * comparable samples.
 *
 * Note: using the oldest sample in the window as the baseline (rather
 * than the previous entry) gives a meaningful "this week" change
 * even when the user logs multiple measurements in a single day.
 */
export function getMeasurementDeltaWithinDays(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  field: MeasurementFieldId,
  windowDays: number = BODY_SUMMARY_WINDOW_DAYS,
  nowIso: string = new Date().toISOString(),
): number | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) return null;

  const cutoff = nowMs - windowDays * MS_PER_DAY;
  const sorted = sortDesc(entries);

  let latest: number | null = null;
  let oldestInWindow: number | null = null;
  let sampleCount = 0;

  for (const e of sorted) {
    const v = toFiniteNumber(e[field]);
    if (v == null) continue;
    const t = Date.parse(e.at);
    if (!Number.isFinite(t) || t < cutoff || t > nowMs) continue;
    if (latest == null) latest = v;
    oldestInWindow = v;
    sampleCount += 1;
  }

  if (latest == null || oldestInWindow == null || sampleCount < 2) return null;
  return latest - oldestInWindow;
}

/**
 * Translate a signed delta into a {@link BodyTrendDirection}. `null`
 * collapses to `"none"` so call-sites can map directly without a
 * branch.
 */
export function directionFromDelta(
  delta: number | null,
  epsilon: number = TREND_EPSILON,
): BodyTrendDirection {
  if (delta == null) return "none";
  if (Math.abs(delta) < epsilon) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * Build a single summary-card payload for one field. Combines the
 * latest-value lookup with the windowed delta + direction so the UI
 * can render a card from a single object.
 */
export function buildBodySummary(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  field: MeasurementFieldId,
  windowDays: number = BODY_SUMMARY_WINDOW_DAYS,
  nowIso: string = new Date().toISOString(),
): BodyMetricSummary {
  const latestEntry = getLatestMeasurement(entries, field);
  const delta = getMeasurementDeltaWithinDays(
    entries,
    field,
    windowDays,
    nowIso,
  );
  return {
    field,
    latest: latestEntry?.value ?? null,
    latestAt: latestEntry?.entry.at ?? null,
    delta,
    direction: directionFromDelta(delta),
    windowDays,
  };
}

/**
 * Build summaries for every requested field at once. Fields with no
 * data are still included (with `latest: null`, `direction: "none"`)
 * so the UI can render a consistent grid without extra null-guards.
 */
export function buildBodySummaries(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  fields: readonly MeasurementFieldId[],
  windowDays: number = BODY_SUMMARY_WINDOW_DAYS,
  nowIso: string = new Date().toISOString(),
): BodySummariesByField {
  const out: { [K in MeasurementFieldId]?: BodyMetricSummary } = {};
  for (const f of fields) {
    out[f] = buildBodySummary(entries, f, windowDays, nowIso);
  }
  return out;
}

/**
 * Union-варіант {@link buildBodySummary} для поля `weightKg`: бере вагу з
 * обох сховищ (`fizruk_daily_log` + `fizruk_measurements`) через
 * {@link selectBodyWeightSamples}, а не тільки з переданого масиву замірів.
 *
 * ADDITIVE: старий `buildBodySummary(entries, "weightKg")` лишається
 * робочим — просто показує підмножину історії.
 */
export function buildBodyWeightSummary(
  dailyLog: readonly BodyWeightRecordInput[] | null | undefined,
  measurements: readonly BodyWeightRecordInput[] | null | undefined,
  windowDays: number = BODY_SUMMARY_WINDOW_DAYS,
  nowIso: string = new Date().toISOString(),
): BodyMetricSummary {
  const entries = toBodyWeightEntries(
    selectBodyWeightSamples(dailyLog, measurements),
  );
  return buildBodySummary(entries, "weightKg", windowDays, nowIso);
}

/**
 * Union-варіант {@link buildBodySummaries}: усі поля рахуються як раніше,
 * але `weightKg` (якщо він серед `fields`) підміняється на union обох
 * сховищ ваги. Це те, що робить mobile Body й web Body однаковими числами.
 *
 * ADDITIVE: `buildBodySummaries` не змінився й лишається публічним.
 */
export function buildBodySummariesWithWeightUnion(
  dailyLog: readonly BodyWeightRecordInput[] | null | undefined,
  measurements: readonly MobileMeasurementEntry[] | null | undefined,
  fields: readonly MeasurementFieldId[],
  windowDays: number = BODY_SUMMARY_WINDOW_DAYS,
  nowIso: string = new Date().toISOString(),
): BodySummariesByField {
  const base = buildBodySummaries(measurements, fields, windowDays, nowIso);
  if (!fields.includes("weightKg")) return base;
  return {
    ...base,
    weightKg: buildBodyWeightSummary(
      dailyLog,
      measurements as readonly BodyWeightRecordInput[] | null | undefined,
      windowDays,
      nowIso,
    ),
  };
}

/**
 * Whether there is at least one entry with a finite value for `field`.
 * Used to gate trend charts (Body page hides a card entirely when the
 * store has no data for the metric).
 */
export function hasAnyMeasurementFor(
  entries: readonly MobileMeasurementEntry[] | null | undefined,
  field: MeasurementFieldId,
): boolean {
  if (!Array.isArray(entries)) return false;
  for (const e of entries) {
    if (toFiniteNumber(e[field]) != null) return true;
  }
  return false;
}
