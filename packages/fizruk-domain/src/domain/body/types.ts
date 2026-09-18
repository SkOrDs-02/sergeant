/**
 * Shared domain types for the Fizruk **Body** dashboard
 * (Phase 6 · mobile port of `apps/web/src/modules/fizruk/pages/Body.tsx`).
 *
 * The body dashboard is a **read-only** view over the measurements
 * store: it derives summary cards and trend series but delegates all
 * create / edit / delete flows to the existing Measurements page. No
 * new persistence shape is introduced here — these types just narrow
 * the shapes the summary selectors accept from `useMeasurements()`.
 */

import type {
  MeasurementFieldId,
  MobileMeasurementEntry,
} from "../measurements/types.js";

/**
 * Direction of the latest numeric trend for a metric.
 *
 *  - `"up"`    — latest sample strictly greater than the window baseline.
 *  - `"down"`  — latest sample strictly smaller than the baseline.
 *  - `"flat"`  — numeric equality (within the configured tolerance).
 *  - `"none"`  — fewer than two comparable samples in the window.
 *
 * Callers map this directly onto the arrow glyph + colour shown in
 * the body summary cards, so the enum stays deliberately narrow.
 */
export type BodyTrendDirection = "up" | "down" | "flat" | "none";

/**
 * Single summary card payload — a latest numeric value plus an
 * optional trend arrow derived from the recent window.
 */
export interface BodyMetricSummary {
  readonly field: MeasurementFieldId;
  /** Latest finite value for the field (or `null` when none logged). */
  readonly latest: number | null;
  /** ISO timestamp of the entry `latest` was read from. */
  readonly latestAt: string | null;
  /** Signed delta (latest − baseline); `null` when not comparable. */
  readonly delta: number | null;
  /** Arrow direction for the summary card. */
  readonly direction: BodyTrendDirection;
  /** Window size (days) used to compute the delta. */
  readonly windowDays: number;
}

/**
 * Aggregated "latest + trend for last N days" card payloads keyed by
 * metric id. Built by {@link buildBodySummaries} below.
 */
export type BodySummariesByField = {
  readonly [K in MeasurementFieldId]?: BodyMetricSummary;
};

export type { MeasurementFieldId, MobileMeasurementEntry };
