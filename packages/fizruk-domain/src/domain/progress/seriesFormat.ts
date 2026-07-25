/**
 * Leaf helpers shared by the measurement-series builders.
 *
 * Extracted out of `measurementSeries.ts` so the cross-store body-weight
 * union (`../body/bodyWeight.ts`) can reuse the exact same tick label and
 * window size without importing `measurementSeries.ts` — which itself
 * imports the union helpers. Keeping this file dependency-free is what
 * makes that layering acyclic.
 */

/** Default number of points kept in a trend (matches web "last 8" window). */
export const MEASUREMENT_TREND_WINDOW = 8;

/** Short locale tick label ("12 кві") for an ISO timestamp. */
export function formatTickLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
}
