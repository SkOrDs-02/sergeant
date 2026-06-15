/**
 * Last validated: 2026-06-15
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
  type WaterLog,
} from "../lib/waterStorage";

export interface UseWaterTrackerResult {
  todayMl: number;
  add: (ml: number) => void;
  subtract: (ml: number) => void;
  reset: () => void;
}

export function useWaterTracker(): UseWaterTrackerResult {
  const [log, setLog] = useState<WaterLog>(() => loadWaterLog());

  useEffect(() => {
    saveWaterLog(log);
  }, [log]);

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
