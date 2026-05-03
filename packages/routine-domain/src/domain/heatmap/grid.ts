/**
 * Pure aggregation helpers for the Habit Heatmap.
 *
 * Exported via `@sergeant/routine-domain` and consumed by the web
 * component (`apps/web/src/modules/routine/components/HabitHeatmap.tsx`)
 * and the mobile component
 * (`apps/mobile/src/modules/routine/components/HabitHeatmap.tsx`).
 *
 * Nothing here touches the DOM, `localStorage`, `window`, `Intl` or
 * any other platform API — the module runs under Node / vitest / React
 * Native / the web bundler with identical output, which keeps the
 * aggregation trivially testable.
 */

import { dateKeyFromDate, parseDateKey } from "../../dateKeys.js";
import type { Habit } from "../../types.js";
import {
  HEATMAP_DAYS,
  HEATMAP_WEEKS,
  type HeatmapCell,
  type HeatmapGrid,
  type HeatmapIntensity,
  type HeatmapMonthMarker,
} from "./types.js";

/**
 * Filter out archived habits. Kept as a tiny helper so presentation
 * code never has to re-derive the "active" list.
 */
export function activeHabits(
  habits: readonly Habit[] | null | undefined,
): Habit[] {
  if (!habits) return [];
  return habits.filter((h) => !h.archived);
}

/**
 * Sum completion counts across all *active* habits and bucket them
 * by local date-key. `completions` may legitimately contain entries
 * for archived or deleted habits — those are silently ignored, which
 * matches the web implementation.
 */
export function countHabitCompletionsByDay(
  habits: readonly Habit[] | null | undefined,
  completions: Record<string, readonly string[]> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!habits || !completions) return out;
  const active = activeHabits(habits);
  for (const h of active) {
    const keys = completions[h.id];
    if (!keys || keys.length === 0) continue;
    for (const dk of keys) {
      out[dk] = (out[dk] || 0) + 1;
    }
  }
  return out;
}

/**
 * Map a completion ratio + future flag to the discrete intensity
 * bucket. This is the single source of truth for colour selection —
 * presentation layers translate the bucket into a Tailwind class
 * (web) or a hex fill (mobile / SVG).
 *
 * Thresholds mirror `apps/web/.../HabitHeatmap.tsx#cellBg` verbatim:
 *   ratio === 0            → `empty`
 *   ratio <  0.34          → `l1`
 *   ratio <  0.67          → `l2`
 *   ratio >= 0.67          → `l3`
 *
 * A `NaN` / negative / non-finite ratio is treated as 0 so that garbage
 * input can never crash the renderer.
 */
export function heatmapIntensity(
  ratio: number,
  isFuture: boolean,
): HeatmapIntensity {
  if (isFuture) return "future";
  if (!Number.isFinite(ratio) || ratio <= 0) return "empty";
  if (ratio < 0.34) return "l1";
  if (ratio < 0.67) return "l2";
  return "l3";
}

/**
 * Compute the Monday of the week that contains `today`, snapped to
 * local noon (same convention as the rest of the routine module:
 * `12:00` avoids DST boundaries flipping the day).
 */
function mondayOfWeek(today: Date): Date {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  // Mon=0, Sun=6 — matches `isoWeekdayFromDateKey`.
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return d;
}

/**
 * Shift a `Date` by `days` and return a fresh instance snapped to noon.
 */
function addDaysAt12(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Build the rendered heatmap grid for the window ending at the week
 * containing `today` and spanning `weeks` ISO weeks back (default
 * `HEATMAP_WEEKS`).
 *
 * The grid has exactly `weeks × HEATMAP_DAYS` cells, each populated
 * with a pre-computed `intensity` bucket so components can render
 * without re-doing any math. Month markers flag the first week in
 * which a new month starts, in the order they appear inside the grid.
 */
export function buildHeatmapGrid(
  habits: readonly Habit[] | null | undefined,
  completions: Record<string, readonly string[]> | null | undefined,
  today: Date,
  weeks: number = HEATMAP_WEEKS,
): HeatmapGrid {
  const totalWeeks = Math.max(1, Math.floor(weeks));
  const totalActive = activeHabits(habits).length;
  const cntByDay = countHabitCompletionsByDay(habits, completions);

  const todayAtNoon = new Date(today);
  todayAtNoon.setHours(12, 0, 0, 0);
  const todayKey = dateKeyFromDate(todayAtNoon);

  const mondayThisWeek = mondayOfWeek(todayAtNoon);
  const startDate = addDaysAt12(
    mondayThisWeek,
    -(totalWeeks - 1) * HEATMAP_DAYS,
  );
  const startKey = dateKeyFromDate(startDate);
  const endDate = addDaysAt12(startDate, totalWeeks * HEATMAP_DAYS - 1);
  const endKey = dateKeyFromDate(endDate);

  const weeksOut: HeatmapCell[][] = [];
  const seenMonths = new Set<string>();
  const monthMarkers: HeatmapMonthMarker[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < HEATMAP_DAYS; d++) {
      const dt = addDaysAt12(startDate, w * HEATMAP_DAYS + d);
      const dateKey = dateKeyFromDate(dt);
      const isFuture = dateKey > todayKey;
      const isToday = dateKey === todayKey;
      const cnt = cntByDay[dateKey] || 0;
      const total = totalActive;
      const ratio = total > 0 && !isFuture ? cnt / total : 0;
      const intensity = heatmapIntensity(ratio, isFuture);

      week.push({
        key: dateKey,
        dateKey,
        year: dt.getFullYear(),
        month: dt.getMonth(),
        day: dt.getDate(),
        weekday: d,
        isFuture,
        isToday,
        cnt,
        total,
        ratio,
        intensity,
      });

      const mk = `${dt.getFullYear()}-${dt.getMonth()}`;
      if (!seenMonths.has(mk)) {
        seenMonths.add(mk);
        monthMarkers.push({
          weekIdx: w,
          monthIdx: dt.getMonth(),
          year: dt.getFullYear(),
        });
      }
    }
    weeksOut.push(week);
  }

  return {
    weeks: weeksOut,
    monthMarkers,
    todayKey,
    startKey,
    endKey,
  };
}

/**
 * Total number of days at or before `todayKey` that contain at least
 * one habit completion. Useful for empty-state heuristics ("user has
 * never completed anything yet") without allocating a second map.
 */
export function countActiveDays(grid: HeatmapGrid): number {
  let n = 0;
  for (const week of grid.weeks) {
    for (const cell of week) {
      if (!cell.isFuture && cell.cnt > 0) n += 1;
    }
  }
  return n;
}

/**
 * Longest run of consecutive *past-or-today* days inside the grid that
 * each contain at least one completion. Deterministic — depends only
 * on the grid content, not on wall-clock time.
 *
 * Future cells reset the run as the upper bound of the window, so the
 * result is always `<= (grid ending at today).lengthInDays`.
 */
export function longestCompletionStreak(grid: HeatmapGrid): number {
  let best = 0;
  let cur = 0;
  for (const week of grid.weeks) {
    for (const cell of week) {
      if (cell.isFuture) {
        cur = 0;
        continue;
      }
      if (cell.cnt > 0) {
        cur += 1;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
  }
  return best;
}

/**
 * Current streak ending at `todayKey`: walks backwards from today and
 * counts consecutive days that have at least one completion. Stops at
 * the first empty non-future day.
 *
 * Deterministic — operates on the flattened grid without consulting
 * `Date.now()` or reading the store.
 */
export function currentCompletionStreak(grid: HeatmapGrid): number {
  const flat: HeatmapCell[] = [];
  for (const week of grid.weeks) {
    for (const cell of week) flat.push(cell);
  }
  // Walk backwards from today.
  let streak = 0;
  for (let i = flat.length - 1; i >= 0; i--) {
    const cell = flat[i];
    if (!cell || cell.isFuture) continue;
    if (cell.cnt > 0) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Look up a cell by date-key in O(weeks*days). Returns `null` when the
 * date-key is outside the grid window.
 */
export function findCellByDateKey(
  grid: HeatmapGrid,
  dateKey: string,
): HeatmapCell | null {
  if (dateKey < grid.startKey || dateKey > grid.endKey) return null;
  for (const week of grid.weeks) {
    for (const cell of week) {
      if (cell.dateKey === dateKey) return cell;
    }
  }
  return null;
}

/**
 * Re-export helper used by tests to construct a Date from a date-key
 * without re-importing `parseDateKey`.
 */
export function dateFromHeatmapKey(dateKey: string): Date {
  return parseDateKey(dateKey);
}
