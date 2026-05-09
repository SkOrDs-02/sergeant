/**
 * `useNutritionLog` — SQLite-cache-backed React hook над журналом
 * прийомів їжі для mobile. Mirror `apps/web/src/modules/nutrition/hooks/useNutritionLog.ts`
 * але без photo-thumbnail-GC, query-invalidation і storage-error-banner
 * (ті блоки специфічні для web або прилітають у пізніших PR-ах).
 *
 * Stage 8 PR #057n-tombstone: initial state reads `loadNutritionLog`
 * which now hits the SQLite warm cache (empty pre-boot). The MMKV
 * value-changed listener was removed because `nutrition_log_v1` is
 * tombstoned — cross-consumer notifications now flow through
 * `useNutritionSqliteReadTick` (the dual-write orchestrator bumps
 * the tick after every successful apply).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addLogEntry,
  normalizeNutritionLog,
  removeLogEntry,
  updateLogEntry,
  type Meal,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import { toLocalISODate } from "@sergeant/shared";

import { loadNutritionLog, saveNutritionLog } from "../lib/nutritionStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseNutritionLogResult {
  nutritionLog: NutritionLog;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  addMeal: (date: string, meal: Partial<Meal>) => void;
  removeMeal: (date: string, id: string) => void;
  updateMeal: (date: string, meal: Partial<Meal>) => void;
  /** Примусове перечитання з MMKV (після фонового sync-pull). */
  refresh: () => void;
}

export function useNutritionLog(): UseNutritionLogResult {
  const [nutritionLog, setNutritionLog] = useState<NutritionLog>(() =>
    loadNutritionLog(),
  );
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toLocalISODate(new Date()),
  );

  // Тримаємо в ref найсвіжіший стан, щоб обробник підписки MMKV
  // порівнював із фактичним значенням, а не з snapshot-ом замикання.
  const logRef = useRef(nutritionLog);
  useEffect(() => {
    logRef.current = nutritionLog;
  }, [nutritionLog]);

  const refresh = useCallback(() => {
    setNutritionLog(loadNutritionLog());
  }, []);

  // Stage 4 PR #033 + Stage 8 PR #057n-tombstone: overlay the meal log
  // from the local SQLite cache once it's warm. The MMKV value-changed
  // listener was dropped because `nutrition_log_v1` no longer exists —
  // cache-tick is now the only "value changed" signal, and the
  // dual-write orchestrator bumps it after every successful apply.
  const sqliteCacheTick = useNutritionSqliteReadTick();
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setNutritionLog(cache.log);
  }, [sqliteCacheTick]);

  const commit = useCallback((next: NutritionLog) => {
    const normalized = normalizeNutritionLog(next);
    setNutritionLog(normalized);
    saveNutritionLog(normalized);
  }, []);

  const addMeal = useCallback(
    (date: string, meal: Partial<Meal>) => {
      commit(addLogEntry(logRef.current, date, meal));
    },
    [commit],
  );

  const removeMeal = useCallback(
    (date: string, id: string) => {
      commit(removeLogEntry(logRef.current, date, id));
    },
    [commit],
  );

  const updateMeal = useCallback(
    (date: string, meal: Partial<Meal>) => {
      commit(updateLogEntry(logRef.current, date, meal));
    },
    [commit],
  );

  return {
    nutritionLog,
    selectedDate,
    setSelectedDate,
    addMeal,
    removeMeal,
    updateMeal,
    refresh,
  };
}
