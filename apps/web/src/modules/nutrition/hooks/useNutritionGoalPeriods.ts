/**
 * Last validated: 2026-09-06
 * Status: Active
 *
 * Reactive access to the append-only Nutrition goal journal. Consumers must
 * resolve an effective goal for their own date range; this hook deliberately
 * returns history rather than a mutable "current goal" scalar.
 */
import { useMemo } from "react";
import type { GoalPeriod } from "@sergeant/nutrition-domain";

import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export function useNutritionGoalPeriods(): readonly GoalPeriod[] {
  const tick = useNutritionSqliteReadTick();

  return useMemo(() => {
    void tick;
    return getCachedNutritionSqliteState().goalPeriods;
  }, [tick]);
}
