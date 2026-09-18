/**
 * Pure reducers + selectors over the persisted measurement list.
 *
 * The mobile `useMeasurements` hook is a thin wrapper that calls the
 * MMKV read / write helpers around these reducers, so all test-worthy
 * behaviour (ordering, upsert-by-id, safe-remove, summary strings)
 * lives here — shared by the web port when it eventually adopts the
 * same shape.
 */

import { MEASUREMENT_FIELDS } from "./fields.js";
import type { MeasurementFieldDef, MobileMeasurementEntry } from "./types.js";

/**
 * Newest-first sort by `at`, matching the contract the web
 * `useMeasurements()` hook exposes (and that
 * {@link import("../progress/measurementSeries.js").computeMeasurementDelta}
 * relies on). Entries with unparseable `at` fall to the bottom so a
 * single malformed row never hides valid ones at the top of the
 * list.
 */
export function sortMeasurementsDesc(
  entries: readonly MobileMeasurementEntry[],
): MobileMeasurementEntry[] {
  const arr = entries.slice();
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
 * Insert or replace an entry by id. Returns a new array; does not
 * mutate `entries`. When the id is new the entry is appended — callers
 * normally re-sort via {@link sortMeasurementsDesc} before rendering.
 */
export function upsertMeasurement(
  entries: readonly MobileMeasurementEntry[],
  next: MobileMeasurementEntry,
): MobileMeasurementEntry[] {
  const idx = entries.findIndex((e) => e.id === next.id);
  if (idx === -1) return [...entries, next];
  const out = entries.slice();
  out[idx] = next;
  return out;
}

/**
 * Remove the entry with the given id, returning a new array. Returns
 * the same reference when no entry matches so React can short-circuit
 * on `===` if it wants.
 */
export function removeMeasurement(
  entries: readonly MobileMeasurementEntry[],
  id: string,
): MobileMeasurementEntry[] {
  const next = entries.filter((e) => e.id !== id);
  return next.length === entries.length ? entries.slice() : next;
}

/**
 * Format a short "Вага: 80 кг · Талія: 82 см" summary for a list row.
 * Returns an em-dash when no numeric fields are set (shouldn't happen
 * for validated entries but the list renders defensively).
 *
 * @param entry   Persisted entry.
 * @param maxParts How many fields to include before truncating. The
 *                web list uses 4 — keep the same default so side-by-
 *                side diffs line up.
 * @param fields  Override for tests. Defaults to
 *                {@link MEASUREMENT_FIELDS}.
 */
export function summariseMeasurementEntry(
  entry: MobileMeasurementEntry,
  maxParts: number = 4,
  fields: readonly MeasurementFieldDef[] = MEASUREMENT_FIELDS,
): string {
  const parts: string[] = [];
  for (const def of fields) {
    const raw = entry[def.id];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const unit = def.unit ? ` ${def.unit}` : "";
    parts.push(`${def.label}: ${raw}${unit}`);
    if (parts.length >= maxParts) break;
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * Locale-formatted date string ("21 кві 2026") for list rows.
 * Falls back to the raw ISO when the input can't be parsed so the row
 * still renders something the user can see.
 */
export function formatMeasurementDate(
  iso: string,
  locale: string = "uk-UA",
): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
