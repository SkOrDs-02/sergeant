import type { Workout } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import type { LastExerciseItem } from "./Workouts.types";

/**
 * Render order for primary muscle groups in the catalog browser.
 * Anything not in the list falls to the end alphabetically — see
 * `buildGroupedExercises` below.
 */
export const MUSCLE_GROUP_ORDER: readonly string[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "full_body",
  "cardio",
];

export interface GroupedExercises {
  id: string;
  label: string;
  items: RawExerciseDef[];
  total: number;
}

/**
 * Group an exercise list by `primaryGroup`, preserving the canonical
 * `MUSCLE_GROUP_ORDER`. Each bucket is capped at 80 items in the
 * rendered slice (the `total` count keeps the original size visible).
 */
export function buildGroupedExercises(
  list: readonly RawExerciseDef[],
  equipmentFilter: readonly string[],
  primaryGroupsUk: Record<string, string>,
): GroupedExercises[] {
  const eqSet = equipmentFilter.length > 0 ? new Set(equipmentFilter) : null;
  const pool = eqSet
    ? list.filter((ex) => (ex.equipment ?? []).some((e) => eqSet.has(e)))
    : list;
  const m = new Map<string, RawExerciseDef[]>();
  for (const ex of pool) {
    const gid = ex.primaryGroup || "full_body";
    const bucket = m.get(gid);
    if (bucket) bucket.push(ex);
    else m.set(gid, [ex]);
  }
  const entries = Array.from(m.entries()).sort((a, b) => {
    const ai = MUSCLE_GROUP_ORDER.indexOf(a[0]);
    const bi = MUSCLE_GROUP_ORDER.indexOf(b[0]);
    return (
      (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) ||
      a[0].localeCompare(b[0])
    );
  });
  return entries.map(([gid, items]) => ({
    id: gid,
    label: primaryGroupsUk[gid] || gid,
    items: items.slice(0, 80),
    total: items.length,
  }));
}

/**
 * Walk all completed (non-active) workouts and pick the most recent
 * occurrence of every exercise. The resulting map is keyed by
 * `exerciseId` and lets the catalog show "last weight × reps" hints.
 */
export function collectLastByExerciseId(
  workouts: readonly Workout[],
  activeWorkoutId: string | null,
): Record<string, LastExerciseItem> {
  const out: Record<string, LastExerciseItem> = {};
  for (const w of workouts || []) {
    if (w.id === activeWorkoutId) continue;
    for (const it of w.items || []) {
      const exId = it.exerciseId;
      if (!exId) continue;
      const existing = out[exId];
      if (
        !existing ||
        (w.startedAt || "").localeCompare(existing._startedAt || "") > 0
      ) {
        out[exId] = { ...it, _startedAt: w.startedAt };
      }
    }
  }
  return out;
}

/**
 * Format active-workout duration as `mm:ss`. Returns `null` when the
 * timestamps are missing/invalid (so the caller can render a blank
 * instead of `NaN:NaN`). `endedAt` is optional — when missing, `now`
 * (a live tick from `Date.now()`) is used so the UI keeps updating.
 */
export function formatActiveDuration(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  now: number,
): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return null;
  const sec = Math.floor((end - start) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Default retro-workout date — today's calendar date in `YYYY-MM-DD`
 * form, computed from the local time zone (Kyiv-day boundary follows
 * the device clock).
 */
export function todayLocalDateString(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
