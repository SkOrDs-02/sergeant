/**
 * Pure types for the Habit Heatmap aggregation module.
 *
 * The heatmap renders a calendar-style matrix of habit completion
 * intensity per day for the last `HEATMAP_WEEKS` ISO weeks (Monday-first),
 * ending with the current day's week. Every cell carries the date, the
 * raw completion count, the active habit total, the normalised ratio and
 * a discrete `HeatmapIntensity` bucket so presentation layers only have
 * to pick a colour per bucket — no math in components.
 *
 * Consumed by `apps/web/src/modules/routine/components/HabitHeatmap.tsx`
 * and `apps/mobile/src/modules/routine/components/HabitHeatmap.tsx`.
 */

/** Number of ISO weeks rendered in the grid (matches web parity). */
export const HEATMAP_WEEKS = 53;

/** Days per week (Mon..Sun). */
export const HEATMAP_DAYS = 7;

/**
 * Discrete intensity bucket for a heatmap cell. Mapping is the same as
 * the web implementation (`apps/web/.../HabitHeatmap.tsx#cellBg`):
 *
 *   - `future` — day is beyond `today`; rendered as a disabled tile
 *   - `empty`  — no completions / no active habits (ratio === 0)
 *   - `l1`     — ratio < 0.34
 *   - `l2`     — ratio < 0.67
 *   - `l3`     — ratio >= 0.67
 */
export type HeatmapIntensity = "future" | "empty" | "l1" | "l2" | "l3";

/** Single day cell in the grid. */
export interface HeatmapCell {
  /** Stable React key — identical to `dateKey`. */
  key: string;
  /** Local-YYYY-MM-DD. */
  dateKey: string;
  /** Gregorian year of the cell. */
  year: number;
  /** Month index 0..11. */
  month: number;
  /** Day of month 1..31. */
  day: number;
  /** ISO weekday, Mon=0 … Sun=6. */
  weekday: number;
  /** True when `dateKey > todayKey`. */
  isFuture: boolean;
  /** True when `dateKey === todayKey`. */
  isToday: boolean;
  /**
   * Completion count that feeds `ratio` — i.e. the numerator of the
   * denominator mode the grid was built with (`"active"` → all
   * non-archived habits, `"scheduled"` → habits on the calendar that
   * day). Equals `scheduledCnt` in `"scheduled"` mode.
   */
  cnt: number;
  /**
   * Denominator this cell was scored against. Depends on the
   * `denominator` option `buildHeatmapGrid` was called with:
   *   - `"active"` (default) — number of non-archived habits at
   *     build-time, identical for every cell in the grid;
   *   - `"scheduled"` — number of habits actually scheduled on this
   *     date (`habitScheduledOnDate`), i.e. `scheduledTotal`.
   */
  total: number;
  /** `cnt / total` clamped to [0..1]; 0 when `total === 0` or future. */
  ratio: number;
  /**
   * Number of habits scheduled on this date per `habitScheduledOnDate`
   * (respects `archived`, `paused`, start/end bounds and the recurrence
   * rule). Always populated, regardless of the `denominator` mode — the
   * schedule-aware denominator the routine `rate`/streak already uses.
   */
  scheduledTotal: number;
  /**
   * Completions counted **only** among the habits scheduled on this date;
   * de-duplicated per habit, so `scheduledCnt <= scheduledTotal` always.
   */
  scheduledCnt: number;
  /** Pre-selected intensity bucket — use this for colour selection. */
  intensity: HeatmapIntensity;
}

/** Marks the first week of a given month inside the grid. */
export interface HeatmapMonthMarker {
  /** Zero-based week index (0..HEATMAP_WEEKS-1). */
  weekIdx: number;
  /** Month index 0..11. */
  monthIdx: number;
  /** Gregorian year. */
  year: number;
}

/**
 * Result of `buildHeatmapGrid` — everything the UI needs to render a
 * HEATMAP_WEEKS × HEATMAP_DAYS matrix plus month labels plus the
 * inclusive date range it spans.
 */
export interface HeatmapGrid {
  /** `HEATMAP_WEEKS` columns, each with `HEATMAP_DAYS` cells. */
  weeks: HeatmapCell[][];
  /** One marker per month that starts inside the grid (first cell of that month). */
  monthMarkers: HeatmapMonthMarker[];
  /** Date-key of the caller-supplied "today". */
  todayKey: string;
  /** Inclusive start date-key (top-left cell). */
  startKey: string;
  /** Inclusive end date-key (bottom-right cell). */
  endKey: string;
}
