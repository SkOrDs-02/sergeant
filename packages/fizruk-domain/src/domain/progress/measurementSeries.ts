/**
 * Pure builders for measurement timeseries on the Progress page.
 *
 * Ported verbatim from the inline `useMemo`s inside
 * `apps/web/src/modules/fizruk/pages/Progress.tsx`:
 *  - `weightTrend`  — last N body-weight samples, sorted oldest-first.
 *  - `fatTrend`     — last N body-fat-% samples, sorted oldest-first.
 *
 * Both use the same shape so a single chart component can render
 * either series (mobile: `WeightChartSection` / `MeasurementsChartSection`).
 */

import { finiteOrNull } from "@sergeant/shared";

import {
  buildBodyWeightSeries,
  type BodyWeightRecordInput,
} from "../body/bodyWeight.js";
import { MEASUREMENT_TREND_WINDOW, formatTickLabel } from "./seriesFormat.js";
import type {
  MeasurementDelta,
  MeasurementPoint,
  ProgressMeasurementInput,
} from "./types.js";

/**
 * Default number of points kept in a trend (matches web "last 8" window).
 * Канонічне визначення живе в `./seriesFormat.ts` — тут re-export, щоб
 * публічна поверхня пакета не змінилась.
 */
export { MEASUREMENT_TREND_WINDOW };

/**
 * Build a timeseries of measurement values for a given numeric field.
 *
 * Entries are sorted by their ISO `at` ascending so the resulting
 * array reads left-to-right as "oldest → newest". The final `limit`
 * entries are kept, mirroring the web behaviour (`.slice(-8)`).
 *
 * @param entries Raw measurement records (any order; may contain
 *                strings or nulls in the measured field).
 * @param field   Name of the numeric field to extract (e.g.
 *                `"weightKg"` or `"bodyFatPct"`).
 * @param limit   How many of the most-recent entries to keep.
 */
export function buildMeasurementSeries(
  entries: readonly ProgressMeasurementInput[] | null | undefined,
  field: string,
  limit: number = MEASUREMENT_TREND_WINDOW,
): MeasurementPoint[] {
  const source = Array.isArray(entries) ? entries : [];
  const sorted = [...source].sort((a, b) => a.at.localeCompare(b.at));
  const windowed =
    limit > 0 && sorted.length > limit
      ? sorted.slice(sorted.length - limit)
      : sorted;

  return windowed.map((entry) => {
    const raw = entry[field];
    const value =
      typeof raw === "number" || typeof raw === "string"
        ? finiteOrNull(raw)
        : null;
    return {
      iso: entry.at,
      value,
      label: formatTickLabel(entry.at),
    };
  });
}

/**
 * Convenience: last-N body-weight series.
 *
 * ADDITIVE-перевантаження (W1-WEIGHT-SOT, стадія 1): якщо передати третім
 * аргументом записи `fizruk_daily_log`, серія будується як **union** обох
 * сховищ ваги через {@link buildBodyWeightSeries} — з дедупом за Kyiv-днем.
 * Без третього аргументу поведінка **байт-у-байт стара**: тільки `entries`,
 * без дедупу за днем. Тому наявні виклики (mobile Progress,
 * `MeasurementsTrendCard`) не міняються.
 *
 * @param entries   Записи `fizruk_measurements` (як і раніше).
 * @param limit     Скільки останніх точок лишити.
 * @param dailyLog  Опційне друге джерело ваги — `fizruk_daily_log`.
 */
export function buildWeightTrend(
  entries: readonly ProgressMeasurementInput[] | null | undefined,
  limit: number = MEASUREMENT_TREND_WINDOW,
  dailyLog?: readonly BodyWeightRecordInput[] | null,
): MeasurementPoint[] {
  if (dailyLog === undefined) {
    return buildMeasurementSeries(entries, "weightKg", limit);
  }
  return buildBodyWeightSeries(
    dailyLog,
    entries as readonly BodyWeightRecordInput[] | null | undefined,
    limit,
  );
}

/** Convenience: last-N body-fat-% series. */
export function buildBodyFatTrend(
  entries: readonly ProgressMeasurementInput[] | null | undefined,
  limit: number = MEASUREMENT_TREND_WINDOW,
): MeasurementPoint[] {
  return buildMeasurementSeries(entries, "bodyFatPct", limit);
}

/**
 * Count how many points in a series have a finite numeric value.
 * Mirrors the web `trend.filter((d) => d.value != null).length`
 * guard used to decide whether to render a chart at all.
 */
export function countValidPoints(series: readonly MeasurementPoint[]): number {
  let n = 0;
  for (const p of series) if (p.value != null) n += 1;
  return n;
}

/**
 * Signed delta between the two most recent entries for a field.
 *
 * Follows the web implementation: entries are assumed to be ordered
 * newest-first (matching the `useMeasurements()` contract where the
 * hook sorts by `at desc`). Returns `null` when either side is
 * missing/non-numeric so the UI can show an em-dash instead of `0`.
 *
 * @param entries Newest-first measurement entries.
 * @param field   Numeric field to diff (e.g. `"weightKg"`).
 */
export function computeMeasurementDelta(
  entries: readonly ProgressMeasurementInput[] | null | undefined,
  field: string,
): MeasurementDelta {
  const source = Array.isArray(entries) ? entries : [];
  const latest = source[0] ?? null;
  const prev = source[1] ?? null;
  if (!latest || !prev) return null;
  const a = finiteOrNull(latest[field]);
  const b = finiteOrNull(prev[field]);
  if (a == null || b == null) return null;
  return a - b;
}
