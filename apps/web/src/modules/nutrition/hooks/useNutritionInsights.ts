/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Per-module insight wrapper for Nutrition.
 *
 * Reads `NutritionLog` and `NutritionPrefs` from the SQLite warm-cache
 * (`getCachedNutritionSqliteState`) with reactivity via
 * `useNutritionSqliteReadTick`. Falls back to empty log / default prefs
 * before the boot cache warms (consistent with `useNutritionLog` and
 * `useNutritionPrefsState` behaviour).
 *
 * Safe to call from any surface — no network providers required.
 *
 * Returns up to 2 Insight objects in priority order:
 *   1. protein-low        — actionable, time-gated (>= 18:00 Kyiv)
 *   2. streak-7-days      — celebration, fires when 7-day kcal streak
 */

import { useMemo } from "react";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";
import { defaultNutritionPrefs } from "@sergeant/nutrition-domain";
import { useProteinLowInsight } from "./useProteinLowInsight";
import { useStreakSevenDaysInsight } from "./useStreakSevenDaysInsight";
import type { Insight } from "@shared/lib/insights/types";

/** Max insights this wrapper surfaces. */
const MAX_VISIBLE = 2;

export function useNutritionInsights(): Insight[] {
  // Reactive tick — re-renders when the Nutrition SQLite cache refreshes.
  const sqliteCacheTick = useNutritionSqliteReadTick();

  // Read log + prefs from the warm SQLite cache.
  // Before the cache warms, log is `{}` and prefs fall back to defaults —
  // both detection hooks return null for empty/zero input, so no false
  // positives during the boot window.
  const { log, prefs } = useMemo(() => {
    void sqliteCacheTick; // SQLite cache refresh tick
    const cached = getCachedNutritionSqliteState();
    return {
      log: cached.log,
      prefs: cached.prefs ?? defaultNutritionPrefs(),
    };
  }, [sqliteCacheTick]);

  const proteinInsight = useProteinLowInsight(log, prefs);
  const streakInsight = useStreakSevenDaysInsight(log, prefs);

  return useMemo((): Insight[] => {
    const candidates: Array<Insight | null> = [proteinInsight, streakInsight];
    return candidates
      .filter((i): i is Insight => i !== null)
      .slice(0, MAX_VISIBLE);
  }, [proteinInsight, streakInsight]);
}
