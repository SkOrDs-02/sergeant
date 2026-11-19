/**
 * Звички для блоку «Зараз» на хабі, реактивно (OD-29, Р-2 (а)).
 *
 * Тонка обгортка над чистим `selectHabitsForNow` (`@sergeant/routine-domain`):
 * стан Рутини з підпискою на `ROUTINE_EVENT` і `storage` (`useRoutineState`)
 * плюс день пристрою, що сам перемикається опівночі (`useDeviceDayKey`,
 * ADR-0078). Відмітка з рядка — `checkInHabitFromHub` з
 * `lib/habitCheckIn.ts`; вона записує стан і шле `ROUTINE_EVENT`, тож рядок
 * зникає сам, а «ще N» перераховується.
 */
import { useMemo } from "react";
import {
  HABITS_FOR_NOW_LIMIT,
  selectHabitsForNow,
  type HabitsForNow,
} from "@sergeant/routine-domain";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
import { useRoutineState } from "./useRoutineState";

export function useHabitsForNow(
  limit: number = HABITS_FOR_NOW_LIMIT,
): HabitsForNow {
  const { routine } = useRoutineState();
  const todayKey = useDeviceDayKey();
  return useMemo(
    () => selectHabitsForNow(routine, todayKey, limit),
    [routine, todayKey, limit],
  );
}
