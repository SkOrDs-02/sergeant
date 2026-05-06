/**
 * `useNutritionLog` — MMKV-backed React hook над журналом прийомів їжі
 * для mobile. Mirror `apps/web/src/modules/nutrition/hooks/useNutritionLog.ts`
 * але без photo-thumbnail-GC, query-invalidation і storage-error-banner
 * (ті блоки специфічні для web або прилітають у пізніших PR-ах).
 *
 * Action-surface цього PR-а (PR-4 — read-only UI):
 * - `log` + `selectedDate` + `setSelectedDate`
 * - мутатори (`addMeal`, `removeMeal`, `updateMeal`) повертають void;
 *   після мутації значення вже у MMKV, далі op-log v2 push підхопить.
 *
 * AddMealSheet / PhotoAnalyze / AI-фічі — PR-5+.
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
import { STORAGE_KEYS, toLocalISODate } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import { loadNutritionLog, saveNutritionLog } from "../lib/nutritionStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadGate } from "../lib/sqliteReadGate";

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

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === STORAGE_KEYS.NUTRITION_LOG) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Stage 4 PR #033: under `feature.nutrition.sqlite_v2.read_sqlite`,
  // overlay the meal log from the local SQLite cache once it's warm.
  // MMKV first-paint read above stays as a synchronous fallback.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useNutritionSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setNutritionLog(cache.log);
  }, [sqliteReadEnabled, sqliteCacheTick]);

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
