/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Скільки днів поспіль людина тримає калорії в межах денної цілі.
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ МОДУЛЬ, А НЕ ПОЛЕ. До нього в Їжі не було лічильника серії
 * взагалі: `useStreakSevenDaysInsight` перевіряє РІВНО СІМ днів і віддає
 * булеве «так/ні». Тобто порогів 30 і 100 не було на чому рахувати —
 * рішення власника «святкуємо серію і в Їжі» (2026-09-13) вимагало саме
 * довжини, а не вікна (знахідка O1: аудит вважав, що поріг 7 уже є як
 * лічильник, — його там немає).
 *
 * ДЕНЬ-КЛЮЧ DEVICE-LOCAL (ADR-0078). Ходимо назад від того ключа, під яким
 * лог фактично записаний, а не від київського дня.
 */
import { getDayMacros, addDaysISODate } from "./nutritionLog.js";
import { resolveKcalGoalsForDays } from "./nutritionGoals.js";
import { WEEK_KCAL_OVER_TOLERANCE } from "./weekKcalChart.js";
import type { NutritionLogLike } from "./nutritionTypes.js";
import type { GoalPeriod } from "./nutritionGoals.js";

/**
 * Стеля проходу. Серія довша за рік — не продуктовий стан, а сигнал про
 * зіпсовані дані; без стелі такий лог крутив би цикл на кожному рендері.
 */
const MAX_STREAK_SCAN_DAYS = 400;

function isWithinGoal(kcal: number, goal: number): boolean {
  const ratio = kcal / goal;
  return (
    ratio >= 2 - WEEK_KCAL_OVER_TOLERANCE && ratio <= WEEK_KCAL_OVER_TOLERANCE
  );
}

/**
 * Довжина серії днів у нормі калорій, що закінчується сьогодні або вчора.
 *
 * СЬОГОДНІ НЕ ОБРИВАЄ СЕРІЮ. Зранку з'їдено нуль, тобто today завжди поза
 * межами — рахувати від нього означало б, що серія падає в нуль щоранку й
 * повертається ввечері. Тому якщо сьогодні ще не в нормі, лічильник
 * починає з учора; якщо вже в нормі — включає сьогодні.
 *
 * День без цілі ОБРИВАЄ прохід, а не пропускається: без денної норми
 * «в межах» не має предмета, і мовчки перестрибувати такі дні означало б
 * склеювати два різні періоди в одну серію.
 */
export function countKcalStreakDays(
  log: NutritionLogLike,
  goalPeriods: readonly GoalPeriod[],
  todayKey: string,
): number {
  const days: string[] = [];
  for (let i = 0; i < MAX_STREAK_SCAN_DAYS; i++) {
    days.push(addDaysISODate(todayKey, -i));
  }
  const goals = resolveKcalGoalsForDays(goalPeriods, days);

  let streak = 0;
  for (let i = 0; i < days.length; i++) {
    const dateKey = days[i];
    const goal = goals[i];
    if (dateKey === undefined || goal == null || goal <= 0) break;

    const kcal = getDayMacros(log, dateKey).kcal ?? 0;
    if (isWithinGoal(kcal, goal)) {
      streak++;
      continue;
    }
    // Єдиний день, чий промах серію не обриває, — сьогоднішній, і лише поки
    // він ще не почався (нуль спожитого). День із записами поза нормою —
    // це вже промах, навіть якщо він сьогодні.
    if (i === 0 && kcal === 0) continue;
    break;
  }
  return streak;
}
