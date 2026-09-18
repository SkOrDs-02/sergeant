/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Per-module insight wrapper for Fizruk.
 *
 * Calls `useWorkouts` and `useActiveFizrukWorkout` internally — both are
 * safe to call from any surface because they read from the SQLite
 * warm-cache + localStorage respectively, with no network providers
 * required.
 *
 * Returns up to 2 Insight objects in priority order:
 *   1. pr-pending       — actionable (active/recent workout close to PR)
 *   2. rest-day-overdue — informational (3+ days without training)
 */

import { useMemo } from "react";
import { useWorkouts } from "./useWorkouts";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";
import { usePrPendingInsight } from "./usePrPendingInsight";
import { useRestDayOverdueInsight } from "./useRestDayOverdueInsight";
import type { Insight } from "@shared/lib/insights/types";

/** Max insights this wrapper surfaces. */
const MAX_VISIBLE = 2;

export function useFizrukInsights(): Insight[] {
  const { workouts, loaded } = useWorkouts();
  const activeWorkoutId = useActiveFizrukWorkout();

  const prPendingInsight = usePrPendingInsight({
    workouts,
    loaded,
    activeWorkoutId,
  });

  const restDayInsight = useRestDayOverdueInsight(workouts, loaded);

  return useMemo((): Insight[] => {
    const candidates: Array<Insight | null> = [
      prPendingInsight,
      restDayInsight,
    ];
    return candidates
      .filter((i): i is Insight => i !== null)
      .slice(0, MAX_VISIBLE);
  }, [prPendingInsight, restDayInsight]);
}
