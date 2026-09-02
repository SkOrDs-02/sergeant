/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Скільки калорій людина спалила на тренуваннях СЬОГОДНІ.
 *
 * Живе в `core/profile/`, а не в `modules/nutrition/`, з тієї ж причини, що
 * й [`useLatestBodyWeightKg`](./useLatestBodyWeight.ts): nutrition не має
 * знати внутрішню розкладку fizruk-а, а прямої залежності
 * nutrition -> fizruk заводити не хочеться.
 *
 * День-ключ - за годинником ПРИСТРОЮ (ADR-0078): тренування о 23:50 належить
 * тому дню, який людина щойно прожила, а не київській добі.
 *
 * НІЧОГО не пише.
 */
import { useMemo } from "react";
import { deviceDayKey } from "@sergeant/shared";
import { computeWorkoutKcalBurned } from "@sergeant/fizruk-domain";
import { useWorkouts } from "../../modules/fizruk/hooks/useWorkouts";
import { useLatestBodyWeightKg } from "./useLatestBodyWeight";

/**
 * Сума оцінок витрат по завершених сьогоднішніх сесіях. `0`, коли
 * тренувань не було або оцінити їх нічим (немає ваги).
 */
export function useTodayWorkoutKcal(): number {
  const { workouts } = useWorkouts();
  const weightKg = useLatestBodyWeightKg();
  return useMemo(() => {
    const today = deviceDayKey();
    let total = 0;
    for (const workout of workouts) {
      if (!workout.endedAt) continue;
      const at = Date.parse(workout.startedAt);
      if (!Number.isFinite(at)) continue;
      if (deviceDayKey(at) !== today) continue;
      total += computeWorkoutKcalBurned(workout, weightKg) ?? 0;
    }
    return total;
  }, [workouts, weightKg]);
}
