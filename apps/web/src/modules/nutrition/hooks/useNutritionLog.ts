/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@shared/hooks/useToast";
import { digestKeys } from "@shared/lib/api/queryKeys";
import { todayISODate } from "@sergeant/nutrition-domain";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { readSignalContext } from "../../../core/observability/valueSignalAttribution";
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
  const [nutritionLog, setNutritionLog] = useSqliteTickOverlay<NutritionLog>(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      return cache.refreshedAt === null ? undefined : cache.log;
    },
    () => loadNutritionLog(NUTRITION_LOG_KEY),
  );
  // ADR-0078: активний день журналу — день ПРИСТРОЮ, не Kyiv. Це і є ключ,
  // під яким запис лягає в лог, тож усе, що читає "сьогодні" з того самого
  // логу (LogCard, Dashboard, quick-chips), мусить рахувати той самий день.
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayISODate(),
  );
  const [addMealSheetOpen, setAddMealSheetOpen] = useState(false);
  const [storageErr, setStorageErr] = useState("");
  const pendingThumbDeletesRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const didMountRef = useRef(false);

  useEffect(() => {
    const ok = persistNutritionLog(nutritionLog, NUTRITION_LOG_KEY);
    const err = ok
      ? ""
      : "Не вдалося зберегти журнал (переповнення сховища або приватний режим).";
    void Promise.resolve().then(() => setStorageErr(err));
  }, [nutritionLog]);

  // AI-CONTEXT: cleanup ref for pending thumbnail deletes — on unmount the undo window is gone, so timers are cancelled and thumbnails deleted immediately
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

  // Журнал харчування живить і дайджест, і денну пораду коуча — але
  // інвалідуємо тут ЛИШЕ дайджест.
  //
  // Порада коуча навмисно НЕ інвалідується записом їжі. Вона денна за
  // контрактом (`useCoachInsight`: ключ за днем, `staleTime: Infinity`,
  // кеш у localStorage), і кожна інвалідація ламала цей контракт двічі.
  // По-перше видимо: людина записувала обід, поверталась на дашборд — і
  // читала ІНШИЙ текст. Не оновлений, а інший; денна порада не має
  // змінюватись під руками. По-друге в грошах: генерація коштує ~$0.004,
  // а снапшот, з якого вона будується, тижневий — одна страва зсуває
  // середні на кілька відсотків і майже ніколи не змінює висновок.
  //
  // Джерела правди для регенерації лишаються два, обидва усвідомлені:
  // pull-to-refresh (`HubMainContent`) і поява свіжих кореляцій після
  // тижневого дайджесту (`useWeeklyDigest`). Обидва — це «зʼявилось щось
  // нове», а не «користувач надрукував рядок».
  //
  // Audit 08 F11 звузив цей ефект із `coachKeys.all` / `digestKeys.all` до
  // одного ключа кожен; тут прибрано другу половину. `digestKeys.history`
  // лишається: це список, який людина може прокручувати просто зараз, і
  // він дешевий — жодної моделі, лише локальна вибірка.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    queryClient.invalidateQueries({ queryKey: digestKeys.history });
  }, [nutritionLog, queryClient]);

  /**
   * Add a meal to the currently selected date and close the add-meal sheet.
   */
  const handleAddMeal = (meal: Partial<Meal>) => {
    setNutritionLog((log) => addLogEntry(log, selectedDate, meal));
    setAddMealSheetOpen(false);
    // Телеметрія (Хвиля 2, `nutrition_meal_logged`). Fire-and-forget поза
    // state-updater-ом: `setNutritionLog` — оновлювач, і сайд-ефект у ньому
    // виконався б у render-фазі (та сама пастка, що в routine).
    //
    // НАЗВИ СТРАВИ В PAYLOAD НЕМАЄ і не буде: `scrubPII` чистить за іменами
    // ключів (`packages/shared/src/lib/pii.ts`), тож `name` він не вирізав
    // би (Hard Rule #21). Їдуть лише enum-и і прапорці.
    //
    // `source` (як їжа потрапила в лог) і `macro_source` (звідки макроси) —
    // це РІЗНІ осі: фото без розпізнаних макросів дає `photo` + `manual`.
    // Схлопування їх в одне поле зробило б «скільки логів через AI»
    // неможливим питанням.
    trackEvent(ANALYTICS_EVENTS.NUTRITION_MEAL_LOGGED, {
      meal_type: typeof meal?.mealType === "string" ? meal.mealType : "unknown",
      source: meal?.source === "photo" ? "photo" : "manual",
      macro_source:
        typeof meal?.macroSource === "string" ? meal.macroSource : "manual",
      has_macros: Boolean(meal?.macros),
      ...readSignalContext("nutrition"),
    });
  };

  const handleEditMeal = (
    date: string,
    meal: Partial<Meal> & { id?: string },
  ) => {
    if (!meal?.id) return;
    setNutritionLog((log) => updateLogEntry(log, date, meal));
    setAddMealSheetOpen(false);
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
  }, [selectedDate, setNutritionLog]);

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
          "Не вдалося завантажити лог харчування, невалідний формат JSON.",
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
    [toast, setNutritionLog],
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
          "Не вдалося обʼєднати лог харчування, невалідний формат JSON.",
        );
        return false;
      }
      setNutritionLog((log) => mergeNutritionLogs(log, parsed));
      return true;
    },
    [toast, setNutritionLog],
  );

  /**
   * Trim the log to the most recent `keepDays` calendar days.
   * Garbage-collects photo thumbnails for removed entries.
   * @param {number} keepDays - Number of most-recent days to keep.
   */
  const trimLogToLastDays = useCallback(
    (keepDays: number) => {
      setNutritionLog((prev) => {
        const next = trimLogOldestDays(prev, keepDays);
        const keep = collectMealIds(next);
        void gcMealThumbnails(keep, { maxDeletes: 2000 });
        return next;
      });
    },
    [setNutritionLog],
  );

  return {
    nutritionLog,
    setNutritionLog,
    selectedDate,
    setSelectedDate,
    addMealSheetOpen,
    setAddMealSheetOpen,
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
