import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@shared/hooks/useToast";
import { coachKeys, digestKeys } from "@shared/lib/api/queryKeys";
import {
  NUTRITION_LOG_KEY,
  loadNutritionLog,
  persistNutritionLog,
  addLogEntry,
  removeLogEntry,
  updateLogEntry,
  duplicatePreviousDayMeals,
  mergeNutritionLogs,
  normalizeNutritionLog,
  trimLogOldestDays,
  toLocalISODate,
  type Meal,
  type NutritionDay,
  type NutritionLog,
} from "../lib/nutritionStorage";
import { deleteMealThumbnail, gcMealThumbnails } from "../lib/mealPhotoStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

/**
 * Collect all meal IDs present in a log.
 */
function collectMealIds(log: NutritionLog): Set<string> {
  const out = new Set<string>();
  for (const day of Object.values(log || {}) as NutritionDay[]) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      const id = m?.id;
      if (id) out.add(String(id));
    }
  }
  return out;
}

/**
 * Hook for managing the nutrition log and selected date.
 *
 * Stage 8 PR #057n-tombstone: state is initialised from the SQLite
 * warm cache (empty `{}` until `useNutritionSqliteReadBoot` finishes)
 * and re-overlaid whenever the cache ticks. Mutations call
 * `persistNutritionLog`, which now triggers the dual-write
 * orchestrator instead of writing to LS.
 */
export function useNutritionLog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [nutritionLog, setNutritionLog] = useState<NutritionLog>(() =>
    loadNutritionLog(NUTRITION_LOG_KEY),
  );
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toLocalISODate(new Date()),
  );
  const [addMealSheetOpen, setAddMealSheetOpen] = useState(false);
  const [addMealPhotoResult, setAddMealPhotoResult] = useState<unknown>(null);
  const [storageErr, setStorageErr] = useState("");
  const pendingThumbDeletesRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const didMountRef = useRef(false);

  useEffect(() => {
    const ok = persistNutritionLog(nutritionLog, NUTRITION_LOG_KEY);
    setStorageErr(
      ok
        ? ""
        : "Не вдалося зберегти журнал (переповнення сховища або приватний режим).",
    );
  }, [nutritionLog]);

  // Stage 4 PR #033 + Stage 8 PR #057n-tombstone: overlay the meal
  // log from the local SQLite cache once it's warm. The next persist
  // effect that fires with this cache snapshot diffs the SQLite cache
  // against itself and emits zero ops, so the warm-cache hydration is
  // a no-op for the dual-write orchestrator.
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setNutritionLog(cache.log);
  }, [sqliteCacheTick]);

  // Flush scheduled thumbnail deletes on unmount. The 6 s grace window
  // exists to allow `handleRestoreMeal` to cancel the delete, but that
  // handler only exists while the hook is alive — once we unmount the
  // undo path is gone, so we cancel the timers and delete immediately
  // instead of letting the raw `setTimeout` fire on a torn-down hook.
  useEffect(() => {
    const pending = pendingThumbDeletesRef.current;
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        void deleteMealThumbnail(id);
      }
      pending.clear();
    };
  }, []);

  // Coach insight and weekly digest both derive from the nutrition log.
  // Invalidate them whenever the log changes so the next mount / user
  // refresh regenerates with the latest context. `staleTime: Infinity`
  // on those queries means invalidation only marks them stale — it does
  // not trigger unsolicited AI calls.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    queryClient.invalidateQueries({ queryKey: coachKeys.all });
    queryClient.invalidateQueries({ queryKey: digestKeys.all });
  }, [nutritionLog, queryClient]);

  /**
   * Add a meal to the currently selected date and close the add-meal sheet.
   */
  const handleAddMeal = (meal: Partial<Meal>) => {
    setNutritionLog((log) => addLogEntry(log, selectedDate, meal));
    setAddMealSheetOpen(false);
    setAddMealPhotoResult(null);
  };

  const handleEditMeal = (
    date: string,
    meal: Partial<Meal> & { id?: string },
  ) => {
    if (!meal?.id) return;
    setNutritionLog((log) => updateLogEntry(log, date, meal));
    setAddMealSheetOpen(false);
    setAddMealPhotoResult(null);
  };

  /**
   * Remove a meal entry by date and ID and delete its photo thumbnail if any.
   */
  const handleRemoveMeal = (
    date: string,
    idOrMeal: string | (Partial<Meal> & { id?: string }),
  ) => {
    const id =
      typeof idOrMeal === "string" ? idOrMeal : String(idOrMeal?.id || "");
    if (!id) return;
    const existingTimer = pendingThumbDeletesRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    const t = setTimeout(() => {
      pendingThumbDeletesRef.current.delete(id);
      void deleteMealThumbnail(id);
    }, 6000);
    pendingThumbDeletesRef.current.set(id, t);
    setNutritionLog((log) => removeLogEntry(log, date, id));
  };

  const handleRestoreMeal = (
    date: string,
    meal: Partial<Meal> & { id?: string },
  ) => {
    const id = String(meal?.id || "");
    if (!id) return;
    const t = pendingThumbDeletesRef.current.get(id);
    if (t) {
      clearTimeout(t);
      pendingThumbDeletesRef.current.delete(id);
    }
    setNutritionLog((log) => {
      // Idempotent undo — double-click на «Повернути» не повинен створювати
      // дублікат у логу. Реальна скарга: користувач тапав 2 рази, бо перший
      // тап здавалося «не спрацював», і отримував два ідентичні meal-и.
      const dayMeals = Array.isArray(log?.[date]?.meals) ? log[date].meals : [];
      if (dayMeals.some((m) => String(m?.id ?? "") === id)) return log;
      return addLogEntry(log, date, meal);
    });
  };

  /**
   * Copy all meals from the previous day into the currently selected date.
   */
  const duplicateYesterday = useCallback(() => {
    setNutritionLog((log) => duplicatePreviousDayMeals(log, selectedDate));
  }, [selectedDate]);

  /**
   * Replace the entire log with data parsed from a JSON string.
   * Garbage-collects orphaned photo thumbnails.
   * Returns `false` on malformed JSON instead of throwing, so the UI
   * can show an import-failure toast without unmounting.
   * @param {string} text - JSON string of a full `NutritionLog`.
   * @returns {boolean}
   */
  const replaceLogFromJsonText = useCallback(
    (text: string) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error(
          "Не вдалося завантажити лог харчування — невалідний формат JSON.",
        );
        return false;
      }
      setNutritionLog((_prev) => {
        const next = normalizeNutritionLog(parsed);
        const keep = collectMealIds(next);
        void gcMealThumbnails(keep, { maxDeletes: 2000 });
        return next;
      });
      return true;
    },
    [toast],
  );

  /**
   * Merge data from a JSON string into the existing log.
   * Existing meals are preserved; imported meals are appended.
   * Returns `false` on malformed JSON instead of throwing.
   * @param {string} text - JSON string of a `NutritionLog` to merge.
   * @returns {boolean}
   */
  const mergeLogFromJsonText = useCallback(
    (text: string) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error(
          "Не вдалося об'єднати лог харчування — невалідний формат JSON.",
        );
        return false;
      }
      setNutritionLog((log) => mergeNutritionLogs(log, parsed));
      return true;
    },
    [toast],
  );

  /**
   * Trim the log to the most recent `keepDays` calendar days.
   * Garbage-collects photo thumbnails for removed entries.
   * @param {number} keepDays - Number of most-recent days to keep.
   */
  const trimLogToLastDays = useCallback((keepDays: number) => {
    setNutritionLog((prev) => {
      const next = trimLogOldestDays(prev, keepDays);
      const keep = collectMealIds(next);
      void gcMealThumbnails(keep, { maxDeletes: 2000 });
      return next;
    });
  }, []);

  return {
    nutritionLog,
    setNutritionLog,
    selectedDate,
    setSelectedDate,
    addMealSheetOpen,
    setAddMealSheetOpen,
    addMealPhotoResult,
    setAddMealPhotoResult,
    handleAddMeal,
    handleEditMeal,
    handleRemoveMeal,
    handleRestoreMeal,
    storageErr,
    duplicateYesterday,
    replaceLogFromJsonText,
    mergeLogFromJsonText,
    trimLogToLastDays,
  };
}
