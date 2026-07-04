/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Fizruk insight trigger: `fizruk-pr-pending`.
 *
 * Fires when the user has an active (in-progress) workout that includes
 * at least one strength exercise whose current set weight is within
 * PR_PROXIMITY_FACTOR of the all-time best weight for that exercise.
 *
 * ## Fallback strategy (documented)
 *
 * The spec calls for "current weight on next planned exercise". The
 * domain does not expose an explicit "next planned exercise" concept
 * independent of a monthly plan + template lookup — that would require
 * the full orchestrator context. Instead:
 *
 *   1. PRIMARY: active workout (started, not yet ended) — real-time
 *      check while the user is training. This is the highest-value
 *      moment to surface the nudge.
 *   2. FALLBACK: if no active workout, scan the most-recent completed
 *      workout for exercises whose best weight in that session is close
 *      to the all-time PR. This surfaces a retrospective "you almost
 *      hit a PR yesterday" prompt on the dashboard.
 *
 * All-time PR per exercise is derived from `computeTopPRs` (Epley 1RM)
 * but we compare raw weight (not estimated 1RM) so the copy can show a
 * concrete "спробуй X кг" target rather than an abstract 1RM number.
 * "Max-ever logged weight" == best approximation available in the local
 * data model; documented in PR body.
 */

import { useMemo } from "react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";
import type { Insight } from "@shared/lib/insights/types";

/** Within this factor of all-time best weight → fire the insight. */
const PR_PROXIMITY_FACTOR = 0.95; // 5 % below

/**
 * Compute per-exerciseId max-ever logged weight across all completed
 * workouts. Uses raw weight (not Epley 1RM) so the copy can quote a
 * concrete kilogram target.
 */
function buildMaxWeightByExercise(
  workouts: readonly Workout[],
): Map<string, { maxWeightKg: number; nameUk: string | null }> {
  const out = new Map<string, { maxWeightKg: number; nameUk: string | null }>();
  for (const w of workouts) {
    if (!w.endedAt) continue; // skip in-progress
    for (const item of w.items ?? []) {
      if (item.type !== "strength" || !item.exerciseId) continue;
      for (const s of item.sets ?? []) {
        const kg = Number(s.weightKg);
        if (!Number.isFinite(kg) || kg <= 0) continue;
        const prev = out.get(item.exerciseId);
        if (!prev || kg > prev.maxWeightKg) {
          out.set(item.exerciseId, {
            maxWeightKg: kg,
            nameUk:
              typeof (item as { nameUk?: unknown }).nameUk === "string"
                ? (item as { nameUk: string }).nameUk
                : null,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Return the highest weight logged across all sets in `item`, or `null`
 * when the item has no valid strength sets.
 */
function maxWeightInItem(item: WorkoutItem): number | null {
  if (item.type !== "strength") return null;
  let best: number | null = null;
  for (const s of item.sets ?? []) {
    const kg = Number(s.weightKg);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    if (best === null || kg > best) best = kg;
  }
  return best;
}

export interface PrPendingInsightOptions {
  workouts: readonly Workout[];
  loaded: boolean;
  /** id of the currently active (in-progress) workout, if any. */
  activeWorkoutId: string | null;
}

export function usePrPendingInsight({
  workouts,
  loaded,
  activeWorkoutId,
}: PrPendingInsightOptions): Insight | null {
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- React Compiler inlines this thin derivation hook and elects not to re-memoize the result ("memoized in source but not in compilation output"); the memo body is pure and its deps are exhaustive. Compiler is not enabled at runtime, so this useMemo genuinely caches an O(workouts) scan on every Dashboard render — removing it is a real perf regression.
  return useMemo(() => {
    if (!loaded) return null;

    const prMap = buildMaxWeightByExercise(workouts);
    if (prMap.size === 0) return null;

    // Prefer the active workout; fall back to the most-recent completed.
    const candidateWorkout =
      (activeWorkoutId
        ? workouts.find((w) => w.id === activeWorkoutId && !w.endedAt)
        : null) ??
      workouts.find((w) => !!w.endedAt) ?? // sorted desc in useWorkouts
      null;

    if (!candidateWorkout) return null;

    for (const item of candidateWorkout.items ?? []) {
      if (item.type !== "strength" || !item.exerciseId) continue;
      const pr = prMap.get(item.exerciseId);
      if (!pr) continue;

      const currentMax = maxWeightInItem(item);
      if (currentMax === null) continue;

      // Fire when current weight is within 5% below (or at/above) PR.
      // currentMax >= pr.maxWeightKg * PR_PROXIMITY_FACTOR
      if (currentMax < pr.maxWeightKg * PR_PROXIMITY_FACTOR) continue;

      const exerciseName = pr.nameUk ?? item.exerciseId;
      // Suggest the next 2.5 kg increment above their current max as
      // the concrete PR target, capped at +5 kg to stay motivational.
      const targetKg = Math.round((pr.maxWeightKg + 2.5) * 10) / 10;

      return {
        id: "fizruk-pr-pending",
        module: "fizruk",
        title: `PR близько на ${exerciseName}`,
        subtitle: `Спробуй ${targetKg} кг сьогодні?`,
        action: { type: "navigate", path: "/fizruk/workouts" },
        // Hub surface promoted post-Phase 5e: PR-close is motivational tickler,
        // works as a Hub re-engagement nudge even when user is in another module.
        showOn: "both",
      };
    }

    return null;
  }, [workouts, loaded, activeWorkoutId]);
}
