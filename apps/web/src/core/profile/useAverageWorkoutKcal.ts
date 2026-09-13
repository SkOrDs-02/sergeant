/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Середньодобові витрати на тренуваннях за останні 14 днів.
 *
 * Живе тут із тієї ж причини, що й [`useLatestBodyWeightKg`](./useLatestBodyWeight.ts):
 * nutrition не має знати внутрішню розкладку fizruk-а.
 *
 * НАВІЩО ОКРЕМО ВІД «СЬОГОДНІ». Обидва числа потрібні, але для різних
 * речей, і плутанина між ними коштувала людям роздутої цілі.
 *
 *   «сьогодні»  → скільки я витратив ЦЬОГО дня. Доречно показати поруч
 *                 із денним планом.
 *   «в середньому» → скільки я витрачаю ЗВИЧАЙНО. Тільки це можна класти
 *                 в ПОСТІЙНУ ціль.
 *
 * AI-DANGER: не підставляй сюди спалене ЗА СЬОГОДНІ. Пресет «розрахувати
 * з профілю» пише результат у постійну `dailyTargetKcal`, і доти він брав
 * саме сьогоднішнє число — тобто людина, яка тиснула пресет після важкого
 * тренування, лишалась із ціллю, роздутою РАЗОВИМ заняттям, доки не
 * змінить її руками. Хук `useTodayWorkoutKcal` прибрано разом із цим
 * фіксом, щоб пастку не можна було зібрати наново. Те саме міркування
 * стоїть у `collectWorkoutKcalPerDay` адаптивного шляху.
 *
 * День-ключ — за годинником ПРИСТРОЮ (ADR-0078).
 *
 * НІЧОГО не пише.
 */
import { useMemo } from "react";
import { deviceDayKey } from "@sergeant/shared";
import { addDeviceDays } from "@sergeant/nutrition-domain";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
import { computeWorkoutKcalBurned } from "@sergeant/fizruk-domain";
import { useWorkouts } from "../../modules/fizruk/hooks/useWorkouts";
import { useLatestBodyWeightKg } from "./useLatestBodyWeight";

/** Те саме вікно, що й в адаптивного перерахунку. */
export const WORKOUT_AVERAGE_WINDOW_DAYS = 14;

export function useAverageWorkoutKcalPerDay(): number {
  const { workouts } = useWorkouts();
  const weightKg = useLatestBodyWeightKg();
  // День у залежностях, а не `deviceDayKey()` усередині memo: інакше
  // сесія, що провисіла через північ без інших змін, рахувала б учорашнє
  // вікно. Розбір і чому самого таймера мало — у `useDeviceDayKey`.
  const today = useDeviceDayKey();
  return useMemo(() => {
    // Вікно закінчується ВЧОРА: сьогоднішній день ще не прожитий, і
    // включати його означало б занижувати середнє щоранку.
    //
    // Арифметика по day-key, а не по мітках часу. `addDeviceDays`
    // береться з `@sergeant/nutrition-domain` навмисно: це та сама
    // функція, якою нарізає вікно адаптивний перерахунок, тож обидва
    // шляхи гарантовано міряють однаковий відрізок.
    const end = addDeviceDays(today, -1);
    const start = addDeviceDays(end, -(WORKOUT_AVERAGE_WINDOW_DAYS - 1));
    let total = 0;
    for (const workout of workouts) {
      if (!workout.endedAt) continue;
      const at = Date.parse(workout.startedAt);
      if (!Number.isFinite(at)) continue;
      const dateKey = deviceDayKey(at);
      if (dateKey < start || dateKey > end) continue;
      total += computeWorkoutKcalBurned(workout, weightKg) ?? 0;
    }
    return total / WORKOUT_AVERAGE_WINDOW_DAYS;
  }, [workouts, weightKg, today]);
}
