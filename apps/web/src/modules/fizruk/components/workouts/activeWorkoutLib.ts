/**
 * Helpers shared across the ActiveWorkoutPanel and its sub-components.
 * Pure functions only — no React, no hooks, no DOM access.
 */

/** Generate a short collision-safe id for client-side groups / sets. */
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert an ISO timestamp into the value expected by an
 * `<input type="datetime-local">`. Returns "" on invalid input so the
 * input renders empty rather than `Invalid Date`.
 */
export function isoToDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Inverse of `isoToDatetimeLocalValue`. Returns null when the input is
 * empty or unparseable so callers can short-circuit and skip an update.
 */
export function datetimeLocalValueToIso(value: string | null | undefined) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Compute pace (min/km) and average speed (km/h) for a cardio item.
 * Returns null if either distance or duration is non-positive — the UI
 * relies on null to hide the metrics row.
 */
export function calcCardioMetrics(
  distanceM: number | null | undefined,
  durationSec: number | null | undefined,
) {
  const dist = Number(distanceM) || 0;
  const dur = Number(durationSec) || 0;
  if (dist <= 0 || dur <= 0) return null;
  const distKm = dist / 1000;
  const durMin = dur / 60;
  const paceMinKm = durMin / distKm;
  const speedKmh = distKm / (dur / 3600);
  let paceMin = Math.floor(paceMinKm);
  let paceSec = Math.round((paceMinKm - paceMin) * 60);
  if (paceSec >= 60) {
    paceMin += 1;
    paceSec = 0;
  }
  return {
    pace: `${paceMin}:${String(paceSec).padStart(2, "0")} хв/км`,
    speed: `${speedKmh.toFixed(1)} км/год`,
  };
}
