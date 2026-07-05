/**
 * Last validated: 2026-07-05
 * Status: Active
 */
import { useCallback, useEffect, useState } from "react";
import {
  loadWaterLog,
  saveWaterLog,
  getTodayWaterMl,
  addWaterMl,
  subtractWaterMl,
  resetTodayWater,
  normalizeWaterLog,
  type WaterLog,
} from "../lib/waterStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseWaterTrackerResult {
  todayMl: number;
  add: (ml: number) => void;
  subtract: (ml: number) => void;
  reset: () => void;
}

export function useWaterTracker(): UseWaterTrackerResult {
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [log, setLog] = useState<WaterLog>(() => loadWaterLog());

  useEffect(() => {
    saveWaterLog(log);
  }, [log]);

  // Dual-write teardown Phase 1 — overlay the water log from the local
  // SQLite cache once it's warm. Mirrors `useNutritionLog`'s overlay
  // effect: the persist effect above re-diffs this same snapshot, so
  // the warm-cache hydration is a no-op for the dual-write orchestrator.
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setLog(normalizeWaterLog(cache.waterLog));
  }, [sqliteCacheTick]);

  const todayMl = getTodayWaterMl(log);

  const add = useCallback((ml: number) => {
    setLog((prev) => addWaterMl(prev, ml));
  }, []);

  const subtract = useCallback((ml: number) => {
    setLog((prev) => subtractWaterMl(prev, ml));
  }, []);

  const reset = useCallback(() => {
    setLog((prev) => resetTodayWater(prev));
  }, []);

  return { todayMl, add, subtract, reset };
}
