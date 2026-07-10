/**
 * Last validated: 2026-07-05
 * Status: Active
 */
import { useCallback, useEffect } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
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
  const [log, setLog] = useSqliteTickOverlay<WaterLog>(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      return cache.refreshedAt === null
        ? undefined
        : normalizeWaterLog(cache.waterLog);
    },
    () => loadWaterLog(),
  );

  useEffect(() => {
    saveWaterLog(log);
  }, [log]);

  const todayMl = getTodayWaterMl(log);

  const add = useCallback(
    (ml: number) => {
      setLog((prev) => addWaterMl(prev, ml));
    },
    [setLog],
  );

  const subtract = useCallback(
    (ml: number) => {
      setLog((prev) => subtractWaterMl(prev, ml));
    },
    [setLog],
  );

  const reset = useCallback(() => {
    setLog((prev) => resetTodayWater(prev));
  }, [setLog]);

  return { todayMl, add, subtract, reset };
}
