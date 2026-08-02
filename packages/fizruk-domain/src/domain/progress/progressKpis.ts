/**
 * Pure KPI aggregator for the Fizruk Progress header.
 *
 * Mobile port of the `quickStats` + PR-count `useMemo`s that live at
 * the top of `apps/web/src/modules/fizruk/pages/Progress.tsx`. Keeping
 * the logic here (rather than inside the RN screen) means:
 *  - both web and mobile can share the numbers,
 *  - the numbers are covered by vitest unit tests,
 *  - the screen renders stay pure-presentational.
 */

import type { ProgressKpis, ProgressWorkoutInput } from "./types.js";

/** Sentinel used by the web copy when no completed workout exists. */
export const NO_LATEST_WORKOUT_LABEL = "—";

/**
 * Epley 1RM estimator, re-implemented locally with strict types so the
 * typed consumers (mobile, `strict: true`) don't pull in the loose
 * `lib/workoutStats.ts` surface. Mirrors the formula used by
 * `@sergeant/fizruk-domain/lib`'s `epley1rm`.
 */
function epley1rmStrict(
  weightKg: number | string | null | undefined,
  reps: number | string | null | undefined,
): number {
  const wg = Number(weightKg ?? 0);
  const r = Number(reps ?? 0);
  if (
    !Number.isFinite(wg) ||
    !Number.isFinite(r) ||
    wg <= 0 ||
    r <= 0 ||
    r > 10
  ) {
    return 0;
  }
  return wg * (1 + r / 30);
}

function parseStartedAtMs(workout: ProgressWorkoutInput): number | null {
  const ts = workout.startedAt ? Date.parse(workout.startedAt) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Count exercises with at least one positive Epley 1RM across all
 * workouts (completed or not — matches web behaviour which folds
 * in-progress sessions into the PR board until they are discarded).
 */
export function countExercisePRs(
  workouts: readonly ProgressWorkoutInput[] | null | undefined,
): number {
  const seen = new Set<string>();
  if (!Array.isArray(workouts)) return 0;
  for (const w of workouts) {
    for (const it of w.items ?? []) {
      if (!it.exerciseId || it.type !== "strength") continue;
      for (const s of it.sets ?? []) {
        if (epley1rmStrict(s.weightKg, s.reps) > 0) {
          seen.add(it.exerciseId);
          break;
        }
      }
    }
  }
  return seen.size;
}

/**
 * Compute the KPI strip shown above the charts.
 *
 * @param workouts       Raw workout sessions (completed or not).
 * @param entriesCount   Number of measurement entries the user has
 *                       logged. Passed in (rather than entries
 *                       themselves) because the caller already keeps
 *                       them memoised for the trend builders.
 */
export function computeProgressKpis(
  workouts: readonly ProgressWorkoutInput[] | null | undefined,
  entriesCount: number,
): ProgressKpis {
  const source = Array.isArray(workouts) ? workouts : [];
  const done = source.filter((w) => Boolean(w.endedAt));

  let latestWorkoutIso: string | null = null;
  let latestMs = -Infinity;
  for (const w of done) {
    const ts = parseStartedAtMs(w);
    if (ts == null) continue;
    if (ts > latestMs) {
      latestMs = ts;
      latestWorkoutIso = w.startedAt ?? null;
    }
  }

  return {
    doneCount: done.length,
    prsCount: countExercisePRs(source),
    entriesCount: Math.max(0, Math.floor(entriesCount)),
    latestWorkoutIso,
  };
}

/**
 * Format a KPI's latest-workout ISO into the short Ukrainian label
 * the header uses (e.g. "12 кві"). Returns {@link NO_LATEST_WORKOUT_LABEL}
 * for a null/invalid input.
 */
export function formatLatestWorkoutLabel(iso: string | null): string {
  if (!iso) return NO_LATEST_WORKOUT_LABEL;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return NO_LATEST_WORKOUT_LABEL;
  return new Date(ts).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
}
