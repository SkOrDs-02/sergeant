/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Fizruk insight trigger: `fizruk-rest-day-overdue`.
 *
 * Fires when the user has not logged a completed workout for
 * REST_DAY_THRESHOLD or more consecutive days. Returns `null` when
 * the condition is not met or data has not loaded yet (so callers
 * can render nothing safely while the SQLite boot is in flight).
 */

import { useMemo } from "react";
import { pluralDays } from "@sergeant/shared";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import type { Insight } from "@shared/lib/insights/types";

/** Minimum gap (days) before the insight fires. Tune here, not inline. */
const REST_DAY_THRESHOLD = 3;

/**
 * Returns the number of whole calendar days between the most-recent
 * completed workout's `endedAt` timestamp and now. Computed using local
 * time so the day boundary follows the device clock (Europe/Kyiv for
 * most users — satisfies the Hard Rule on day boundaries for client-only
 * detection; server-authoritative streaks use a dedicated domain fn).
 */
function daysSinceLastWorkout(workouts: readonly Workout[]): number {
  let latestMs = -Infinity;
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const ms = Date.parse(w.endedAt);
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }
  if (!Number.isFinite(latestMs)) return Infinity;

  // Truncate both sides to local-midnight so partial days don't inflate
  // the count (e.g. finished at 23:55 → next day at 00:05 ≠ 1 full day).
  // Intentionally the device-local instant: this is a client-only
  // re-engagement heuristic whose day boundary should follow the user's
  // own clock (see the function docblock), not the Kyiv server anchor.
  // eslint-disable-next-line no-restricted-syntax -- device-local day boundary by design
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const lastStart = new Date(latestMs);
  lastStart.setHours(0, 0, 0, 0);
  const diffMs = todayStart.getTime() - lastStart.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function useRestDayOverdueInsight(
  workouts: readonly Workout[],
  loaded: boolean,
): Insight | null {
  return useMemo(() => {
    // Suppress while SQLite boot is still in flight — avoids a false
    // "no workouts" state triggering the card on first render.
    if (!loaded) return null;

    const days = daysSinceLastWorkout(workouts);

    // Never-trained users have no completed workouts, so `days` is Infinity.
    // The empty-state UI already prompts them to start; showing "N днів без
    // тренування" would be nonsensical here.
    if (!Number.isFinite(days)) return null;

    if (days < REST_DAY_THRESHOLD) return null;

    return {
      id: "fizruk-rest-day-overdue",
      module: "fizruk",
      title: `${days} ${pluralDays(days)} без тренування`,
      subtitle: "Час повернутися?",
      action: { type: "navigate", path: "/fizruk/workouts" },
      // Hub surface promoted post-Phase 5e: rest-day overdue is the canonical
      // cross-module re-engagement signal — needs Hub visibility to actually
      // catch a user who is busy in finyk/routine/nutrition.
      showOn: "both",
    };
  }, [workouts, loaded]);
}
