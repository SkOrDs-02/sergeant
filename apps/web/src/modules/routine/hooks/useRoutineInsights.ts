/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Per-module insight wrapper for Routine.
 *
 * Calls `useRoutineState` internally — safe to call from any surface
 * because it reads from localStorage with cross-tab sync and has no
 * network dependencies.
 *
 * Returns up to 2 Insight objects in priority order:
 *   1. todo-evening            — actionable, time-gated (>= 20:00 Kyiv)
 *   2. streak-record-pending   — motivational, fires when 1 day from record
 */

import { useMemo } from "react";
import { useRoutineState } from "./useRoutineState";
import { useTodoEveningInsight } from "./useTodoEveningInsight";
import { useStreakRecordPendingInsight } from "./useStreakRecordPendingInsight";
import type { Insight } from "@shared/lib/insights/types";

/** Max insights this wrapper surfaces. */
const MAX_VISIBLE = 2;

export function useRoutineInsights(): Insight[] {
  const { routine } = useRoutineState();

  const todoInsight = useTodoEveningInsight(routine);
  const streakInsight = useStreakRecordPendingInsight(routine);

  return useMemo((): Insight[] => {
    const candidates: Array<Insight | null> = [todoInsight, streakInsight];
    return candidates
      .filter((i): i is Insight => i !== null)
      .slice(0, MAX_VISIBLE);
  }, [todoInsight, streakInsight]);
}
