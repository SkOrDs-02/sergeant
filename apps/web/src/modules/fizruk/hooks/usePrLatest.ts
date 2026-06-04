/**
 * Last validated: 2026-05-21
 * Status: Active
 *
 * Phase 6.7 — persistent PR summary for the Fizruk Dashboard hero badge.
 *
 * Returns the most-recent personal record (max raw `weightKg` per
 * `exerciseId`) across all completed workouts within the last
 * {@link PR_WINDOW_DAYS} days. The companion to
 * `usePrPendingInsight` — that hook fires *during/after* a session
 * when the user is *close* to a PR, this one persists a small badge
 * on the hero that says "PR · {exercise} · {weightKg} кг" after the
 * fact so the achievement stays visible until it goes stale.
 *
 * Why this lives next to `usePrPendingInsight` (and not as a reuse of
 * it): they answer different questions. `usePrPendingInsight` looks at
 * the *current/last* session and a proximity threshold to drive a
 * nudge; this hook scans *all* sessions in the window for the actual
 * date a PR was set. The two pieces of data don't compose cleanly, so
 * a small dedicated derivation reads better than overloading the
 * insight hook.
 *
 * Uses Kyiv-local day boundaries via `getKyivDayKey` so "сьогодні / 2
 * дні тому" matches the user's calendar even on a phone roaming
 * abroad with the wrong system timezone.
 */

import { useMemo } from "react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * Cap the lookback window so a 6-month-old PR doesn't sit on the hero
 * forever. Anything older than 30 days fades from the recency cache
 * entirely (the consumer additionally hides the badge past 14 days to
 * keep the surface fresh; the larger 30-day store leaves room for a
 * future "PR history" view without a second pass over the data).
 */
const PR_WINDOW_DAYS = 30;

export interface PrLatest {
  /** Display name (Ukrainian), e.g. "Жим лежачи". */
  readonly exerciseName: string;
  /** Raw weight in kilograms — already validated finite and > 0. */
  readonly weightKg: number;
  /** Whole days between the PR's Kyiv-local day and today (Kyiv). */
  readonly daysAgo: number;
}

/**
 * Difference in whole days between two `YYYY-MM-DD` Kyiv day keys.
 * Returns `0` when both keys are the same day, positive when `b` is
 * older. Falls back to `Number.POSITIVE_INFINITY` on malformed input so
 * the caller's window check still filters the entry out.
 */
function diffDaysKyiv(today: string, past: string): number {
  // `YYYY-MM-DD` parses safely at noon UTC to dodge DST edge cases; we
  // only care about whole-day deltas so the small UTC drift never
  // crosses a day boundary.
  const a = Date.parse(`${today}T12:00:00Z`);
  const b = Date.parse(`${past}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round((a - b) / 86_400_000);
}

interface PrCandidate {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly weightKg: number;
  readonly dayKey: string;
  readonly endedAtMs: number;
}

/**
 * Walk completed workouts once, return the PR-setting set per exercise
 * (the first time the all-time max was reached). Iterating from oldest
 * to newest means we keep the *original* PR date, not a later session
 * that merely matched the same weight — that's the moment worth
 * celebrating.
 */
function collectPrSets(workouts: readonly Workout[]): PrCandidate[] {
  // Sort oldest → newest so the first time a weight is set wins ties.
  const sorted = [...workouts]
    .filter((w) => !!w.endedAt)
    .sort((a, b) => {
      const ta = Date.parse(a.endedAt ?? "");
      const tb = Date.parse(b.endedAt ?? "");
      const sa = Number.isFinite(ta) ? ta : 0;
      const sb = Number.isFinite(tb) ? tb : 0;
      return sa - sb;
    });

  const byExercise = new Map<string, PrCandidate>();
  for (const w of sorted) {
    const endedAtMs = Date.parse(w.endedAt ?? "");
    if (!Number.isFinite(endedAtMs)) continue;
    const dayKey = getKyivDayKey(new Date(endedAtMs));
    for (const item of w.items ?? []) {
      if (item.type !== "strength" || !item.exerciseId) continue;
      const nameUk =
        typeof (item as { nameUk?: unknown }).nameUk === "string"
          ? (item as { nameUk: string }).nameUk
          : null;
      const exerciseName = nameUk ?? item.exerciseId;
      let bestThisSession: number | null = null;
      for (const s of item.sets ?? []) {
        const kg = Number(s.weightKg);
        if (!Number.isFinite(kg) || kg <= 0) continue;
        if (bestThisSession === null || kg > bestThisSession) {
          bestThisSession = kg;
        }
      }
      if (bestThisSession === null) continue;
      const prev = byExercise.get(item.exerciseId);
      if (!prev || bestThisSession > prev.weightKg) {
        byExercise.set(item.exerciseId, {
          exerciseId: item.exerciseId,
          exerciseName,
          weightKg: bestThisSession,
          dayKey,
          endedAtMs,
        });
      }
    }
  }
  return [...byExercise.values()];
}

export interface UsePrLatestOptions {
  readonly workouts: readonly Workout[];
  readonly loaded: boolean;
}

/**
 * Most-recent PR summary for the hero badge, or `null` when the user
 * has no qualifying lifts in the lookback window. The hook is read-only
 * — it never mutates storage, never schedules effects; pure derivation
 * memoized on the input list.
 */
export function usePrLatest({
  workouts,
  loaded,
}: UsePrLatestOptions): PrLatest | null {
  return useMemo(() => {
    if (!loaded) return null;
    if (!workouts.length) return null;

    const today = getKyivDayKey();
    const candidates = collectPrSets(workouts);
    if (candidates.length === 0) return null;

    // Most-recent first; tie-break on weight to surface the bigger lift
    // when two PRs landed the same day.
    candidates.sort((a, b) => {
      if (b.endedAtMs !== a.endedAtMs) return b.endedAtMs - a.endedAtMs;
      return b.weightKg - a.weightKg;
    });

    for (const c of candidates) {
      const daysAgo = diffDaysKyiv(today, c.dayKey);
      if (daysAgo < 0) continue; // future-dated session → clock skew, skip
      if (daysAgo > PR_WINDOW_DAYS) continue;
      return {
        exerciseName: c.exerciseName,
        weightKg: c.weightKg,
        daysAgo,
      };
    }
    return null;
  }, [workouts, loaded]);
}
