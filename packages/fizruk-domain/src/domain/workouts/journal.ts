/**
 * Pure selectors over the persisted list of `Workout` entries.
 *
 * The mobile Workouts page uses these to build a newest-first journal
 * grouped by local calendar date, and to render per-row aggregate
 * summaries (item count, total sets, tonnage, duration). Keeping
 * them here lets vitest cover the reducer contract in isolation and
 * lets both platforms share the same counting rules.
 */

import { compareIsoDesc } from "../../lib/workoutStats.js";
import type {
  Workout,
  WorkoutForJournal,
  WorkoutSummary,
  WorkoutSummaryInput,
} from "./types.js";

/**
 * Local-date bucket key for a workout in `YYYY-MM-DD` form. Returns
 * `null` when the workout has no parseable `startedAt` — callers
 * drop such rows into a trailing "Без дати" bucket if they want to.
 */
export function workoutDateKey(w: Pick<Workout, "startedAt">): string | null {
  if (!w?.startedAt) return null;
  const t = Date.parse(w.startedAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Newest-first comparator. Workouts without a parseable `startedAt`
 * sink to the bottom so a single malformed entry never hides valid
 * rows. Generic over `W extends WorkoutForJournal` so mobile shape
 * variants pass through without `as unknown as Workout` casts.
 */
export function compareWorkoutsByStartedAtDesc<W extends WorkoutForJournal>(
  a: W,
  b: W,
): number {
  return compareIsoDesc(a?.startedAt, b?.startedAt);
}

/** Newest-first sort. Does not mutate `workouts`. */
export function sortWorkoutsByStartedAtDesc<W extends WorkoutForJournal>(
  workouts: readonly W[],
): W[] {
  const arr = workouts.slice();
  arr.sort(compareWorkoutsByStartedAtDesc);
  return arr;
}

/**
 * Group workouts by their local calendar-date prefix. Preserves the
 * inbound ordering inside each bucket so callers can pre-sort once
 * and trust the result.
 */
export function groupWorkoutsByDate<W extends WorkoutForJournal>(
  workouts: readonly W[],
): Record<string, W[]> {
  const out: Record<string, W[]> = {};
  for (const w of workouts) {
    const key = workoutDateKey(w) ?? "";
    const bucket = out[key] ?? [];
    bucket.push(w);
    out[key] = bucket;
  }
  return out;
}

/**
 * Ordered (newest-first) list of `[dateKey, workouts[]]` buckets for
 * the journal `SectionList`. Empty-key ("Без дати") bucket, if any,
 * is appended last. Generic so the caller's wider workout type
 * survives the round-trip.
 */
export function buildWorkoutJournalSections<W extends WorkoutForJournal>(
  workouts: readonly W[],
): { dateKey: string; workouts: W[] }[] {
  const sorted = sortWorkoutsByStartedAtDesc(workouts);
  const byKey = groupWorkoutsByDate(sorted);
  const keys = Object.keys(byKey).filter((k) => k !== "");
  // Descending by key — since keys are `YYYY-MM-DD`, a lexicographic
  // reverse sort equals the chronological newest-first order.
  keys.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const sections = keys.map((k) => ({ dateKey: k, workouts: byKey[k]! }));
  if (byKey[""]) {
    sections.push({ dateKey: "", workouts: byKey[""]! });
  }
  return sections;
}

/**
 * Total barbell tonnage (kg × reps, strength items only). Non-finite
 * / negative entries contribute `0`.
 */
export function computeWorkoutTonnageKg(
  w: WorkoutSummaryInput | null | undefined,
): number {
  if (!w) return 0;
  let total = 0;
  for (const it of w.items || []) {
    if (it?.type !== "strength") continue;
    for (const s of it.sets || []) {
      const wg = Number(s?.weightKg);
      const r = Number(s?.reps);
      if (!Number.isFinite(wg) || !Number.isFinite(r)) continue;
      if (wg <= 0 || r <= 0) continue;
      total += wg * r;
    }
  }
  return total;
}

/**
 * Total logged sets across strength items (non-zero reps OR weight
 * counted). Used by the journal row pill "N підходів".
 */
export function computeWorkoutSetCount(
  w: WorkoutSummaryInput | null | undefined,
): number {
  if (!w) return 0;
  let n = 0;
  for (const it of w.items || []) {
    if (it?.type !== "strength") continue;
    for (const s of it.sets || []) {
      const wg = Number(s?.weightKg) || 0;
      const r = Number(s?.reps) || 0;
      if (wg > 0 || r > 0) n += 1;
    }
  }
  return n;
}

/**
 * Duration in whole seconds between `startedAt` and `endedAt` (or
 * `null` if the workout is still in progress). Returns `0` when the
 * timestamps are malformed so UI formatters never emit `NaN`.
 */
export function computeWorkoutDurationSec(
  w: WorkoutSummaryInput | null | undefined,
): number | null {
  if (!w?.startedAt) return null;
  const start = Date.parse(w.startedAt);
  if (!Number.isFinite(start)) return null;
  if (!w.endedAt) return null;
  const end = Date.parse(w.endedAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Journal-row aggregate. Pure, cheap, safe on incomplete entries. */
export function computeWorkoutSummary(
  w: WorkoutSummaryInput | null | undefined,
): WorkoutSummary {
  return {
    itemCount: (w?.items || []).length,
    setCount: computeWorkoutSetCount(w),
    tonnageKg: computeWorkoutTonnageKg(w),
    durationSec: computeWorkoutDurationSec(w),
    isFinished: Boolean(w?.endedAt),
  };
}

/**
 * Human-readable local date label for a `YYYY-MM-DD` key. Falls back
 * to "Без дати" for the empty bucket.
 */
export function formatWorkoutDateLabel(
  dateKey: string,
  locale: string = "uk-UA",
): string {
  if (!dateKey) return "Без дати";
  const t = Date.parse(`${dateKey}T12:00:00`);
  if (!Number.isFinite(t)) return dateKey;
  return new Date(t).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
