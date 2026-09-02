/**
 * Тижневий стрік Фізрука — pure.
 *
 * AI-CONTEXT: канон [`fizruk.md §7`] дослівно: «стрік має бути
 * тижневим/гнучким», бо щоденна логіка **карає за правильний відпочинок**, а
 * відпочинок — частина тренувального циклу, не провал. `computeStreakDays`
 * реалізує саме щоденну логіку: день без тренування розриває серію (крім
 * однієї доби today-grace), а дата ще й локальна, не київська, тож поза
 * Києвом серія рветься на off-by-one. Founder називає це прямо помилкою для
 * фітнесу ([напруга 1](../../../../../docs/90-work/audits/product-knowledge-fizruk.md)).
 *
 * Тут — обіцяна семантика: **N тижнів поспіль із ≥X тренувань**, межі тижня
 * київські (понеділок-перший, ISO 8601), як і в `computeWeeklyTotals`.
 *
 * `computeStreakDays` лишається поруч недоторканим — його читає мобілка,
 * яка поза скоупом за рішенням власника 2026-07-30.
 */

import {
  computeWeeklyStreakBreakdownFromInstants,
  type WeeklyStreakBreakdown,
} from "@sergeant/shared";

import type { DashboardWorkoutInput } from "./types.js";

/**
 * Скільки завершених тренувань робить тиждень «зарахованим».
 *
 * ⚠️ **Інженерний дефолт, не рішення founder-а.** Канон вимагає саме форму
 * «N тижнів поспіль з ≥X тренувань», але X не називає, і в § «На роздум
 * власнику» беклогу цього питання немає. Двійка обрана як мінімум, що ще
 * означає тренувальний тиждень: одне тренування на тиждень — це радше
 * випадковість, ніж режим, а трійка вже вимагає більшого від новачка.
 * Ратифікація — окремий крок; зміна числа рухає видиме число і йде разом
 * із бампом `METRICS_VERSION`.
 */
export const DEFAULT_WEEKLY_STREAK_TARGET = 2;

export interface WeeklyStreakOptions {
  /** Поріг «зарахованого» тижня. Дефолт — {@link DEFAULT_WEEKLY_STREAK_TARGET}. */
  readonly targetPerWeek?: number | undefined;
  readonly now?: Date | undefined;
}

/**
 * Розібраний тижневий стрік.
 *
 * Прохід іде від поточного київського тижня назад по фактичних межах
 * `kyivMondayStartMs` — не відніманням `7 × 24h`. DST-тиждень триває 167 або
 * 169 годин, тож арифметика на мілісекундах зʼїхала б на годину і врешті
 * перекинула б одне тренування в сусідній тиждень.
 */
export function computeWeeklyStreakBreakdown(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: WeeklyStreakOptions = {},
): WeeklyStreakBreakdown {
  const { targetPerWeek = DEFAULT_WEEKLY_STREAK_TARGET, now = new Date() } =
    options;
  return computeWeeklyStreakBreakdownFromInstants(
    (Array.isArray(workouts) ? workouts : [])
      .map((w) => w?.endedAt)
      .filter((endedAt): endedAt is string => typeof endedAt === "string"),
    { targetPerWeek, now },
  );
}

/** Лише число тижнів — тонка обгортка над {@link computeWeeklyStreakBreakdown}. */
export function computeWeeklyStreakWeeks(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: WeeklyStreakOptions = {},
): number {
  return computeWeeklyStreakBreakdown(workouts, options).weeks;
}
