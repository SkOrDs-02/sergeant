/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { useCallback, useEffect, useRef } from "react";
import { emitHubBus } from "@shared/lib/modules/hubBus";
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

/**
 * Рядок «Вода» в аркуші «Додати» модуля (redesign v3.2, позиція 01)
 * відкриває аркуш свого обʼєму в `WaterTrackerCard`: стан води тримає
 * картка, і другий екземпляр цього хука переписав би її запис своїм.
 */
export const WATER_ADD_EVENT = "nutrition:water-add";

export interface UseWaterTrackerResult {
  todayMl: number;
  /** Full day→ml log — needed by `WaterHistorySheet` for the 7/14/30-day views. */
  log: WaterLog;
  add: (ml: number) => void;
  subtract: (ml: number) => void;
  reset: () => void;
}

/**
 * День, у якому додавання вперше довело суму до цілі; інакше `null`.
 * `addWaterMl` пише в день за годинником пристрою (ADR-0078), тож це
 * єдиний день, що міг змінитись.
 */
export function waterGoalReachedDay(
  prev: WaterLog,
  next: WaterLog,
  goalMl: number,
): string | null {
  if (!(goalMl > 0)) return null;
  for (const [day, ml] of Object.entries(next)) {
    if (ml >= goalMl && (prev[day] ?? 0) < goalMl) return day;
  }
  return null;
}

/**
 * @param goalMl денна ціль води. Коли дія людини (`add`) вперше за день
 *   доводить суму до цілі, хук шле `routineAutoMark` з
 *   `source: "nutrition_water_goal"` — джерело автовідмітки звички Рутини
 *   (рішення власника 2026-11-18). Синк і відновлення йдуть повз `add`,
 *   тож події не дають; без цілі (`0`) події немає.
 */
export function useWaterTracker(goalMl = 0): UseWaterTrackerResult {
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

  // Свіжий журнал для порівняння «до / після» поза updater-ом: подія —
  // побічний ефект, а updater React може викликати двічі.
  const logRef = useRef(log);
  useEffect(() => {
    logRef.current = log;
  }, [log]);
  // Один перетин на день за сесію: зменшення й повторний перетин не шлють.
  const emittedDaysRef = useRef(new Set<string>());

  const add = useCallback(
    (ml: number) => {
      const prev = logRef.current;
      const next = addWaterMl(prev, ml);
      logRef.current = next;
      setLog(next);
      const day = waterGoalReachedDay(prev, next, goalMl);
      if (day && !emittedDaysRef.current.has(day)) {
        emittedDaysRef.current.add(day);
        emitHubBus("routineAutoMark", {
          source: "nutrition_water_goal",
          dayKey: day,
        });
      }
    },
    [setLog, goalMl],
  );

  const subtract = useCallback(
    (ml: number) => {
      logRef.current = subtractWaterMl(logRef.current, ml);
      setLog(logRef.current);
    },
    [setLog],
  );

  const reset = useCallback(() => {
    logRef.current = resetTodayWater(logRef.current);
    setLog(logRef.current);
  }, [setLog]);

  return { todayMl, log, add, subtract, reset };
}
