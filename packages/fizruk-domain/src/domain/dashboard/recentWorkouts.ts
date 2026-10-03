/**
 * Pure aggregator for the Fizruk Dashboard "Recent workouts" list.
 *
 * Returns the last `limit` **completed** workouts sorted newest-first,
 * each annotated with duration (seconds), total tonnage (kg) and a
 * display label derived from the note or first strength exercise.
 */

import { finiteOrNull } from "@sergeant/shared";

import type { DashboardRecentWorkout, DashboardWorkoutInput } from "./types.js";

/** Default row count on the dashboard "Останні тренування" card. */
export const DEFAULT_RECENT_LIMIT = 3;

function computeDuration(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function computeTonnageKg(w: DashboardWorkoutInput): number {
  let total = 0;
  const items = w.items ?? [];
  for (const item of items) {
    if (item?.type !== "strength") continue;
    const sets = item.sets ?? [];
    for (const s of sets) {
      const weight = finiteOrNull(s?.weightKg);
      const reps = finiteOrNull(s?.reps);
      if (weight == null || reps == null) continue;
      if (weight <= 0 || reps <= 0) continue;
      total += weight * reps;
    }
  }
  return Math.round(total);
}

function resolveLabel(w: DashboardWorkoutInput): string {
  const note =
    typeof (w as { note?: unknown }).note === "string"
      ? (w as { note: string }).note.trim()
      : "";
  if (note.length > 0) return note;
  const items = w.items ?? [];
  for (const item of items) {
    const name =
      typeof (item as { nameUk?: unknown }).nameUk === "string"
        ? (item as { nameUk: string }).nameUk.trim()
        : "";
    if (name.length > 0) return name;
  }
  return "Тренування";
}

export interface ListRecentWorkoutsOptions {
  readonly limit?: number;
}

/**
 * Newest-first list of the last N completed workouts, each augmented
 * with duration / tonnage / label so the UI card can render without
 * re-computing totals.
 */
export function listRecentCompletedWorkouts(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: ListRecentWorkoutsOptions = {},
): DashboardRecentWorkout[] {
  const { limit = DEFAULT_RECENT_LIMIT } = options;
  const list = Array.isArray(workouts) ? workouts : [];
  if (list.length === 0 || limit <= 0) return [];

  const completed: DashboardRecentWorkout[] = [];
  for (const w of list) {
    const endedAt =
      typeof w?.endedAt === "string" && w.endedAt ? w.endedAt : null;
    if (!endedAt) continue;
    const startedAt =
      typeof w?.startedAt === "string" && w.startedAt ? w.startedAt : null;
    if (!startedAt) continue;
    const durationSec = computeDuration(startedAt, endedAt);
    completed.push({
      startedAt,
      endedAt,
      durationSec,
      itemsCount: Array.isArray(w.items) ? w.items.length : 0,
      tonnageKg: computeTonnageKg(w),
      label: resolveLabel(w),
    });
  }

  return completed
    .sort((a, b) => {
      const aMs = Date.parse(a.endedAt ?? "");
      const bMs = Date.parse(b.endedAt ?? "");
      return (
        (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
      );
    })
    .slice(0, Math.max(0, limit));
}
