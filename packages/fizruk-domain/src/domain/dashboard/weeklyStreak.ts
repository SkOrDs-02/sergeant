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

import { kyivMondayStartMs } from "@sergeant/shared";

import type { DashboardWorkoutInput } from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

/** Скільки тижнів назад дивимось максимум (safety-cap на биті дати). */
const MAX_WEEKS_LOOKBACK = 520;

export interface WeeklyStreakOptions {
  /** Поріг «зарахованого» тижня. Дефолт — {@link DEFAULT_WEEKLY_STREAK_TARGET}. */
  readonly targetPerWeek?: number | undefined;
  readonly now?: Date | undefined;
}

export interface WeeklyStreakBreakdown {
  /**
   * Число, яке показуємо: **закритих** тижнів поспіль, що дотягли до порогу.
   * Поточний тиждень сюди входить, лише якщо поріг УЖЕ виконаний — інакше він
   * рахується як `currentWeekPending`, а не як обрив.
   */
  readonly weeks: number;
  /** Поріг, за яким рахували (щоб UI не вигадував власне число). */
  readonly targetPerWeek: number;
  /** Завершених тренувань у поточному (незакритому) тижні. */
  readonly currentWeekWorkouts: number;
  /**
   * Поточний тиждень ще не дотяг до порогу, але й не програний — він триває.
   * Щоденна модель у цій ситуації показувала «серія 0» просто тому, що
   * сьогодні день відпочинку.
   */
  readonly currentWeekPending: boolean;
  /** Київський понеділок тижня, на якому серія обірвалась (`null` — дійшли до початку історії). */
  readonly brokenOnWeekStart: string | null;
}

/**
 * Київський понеділок тижня як `YYYY-MM-DD`.
 *
 * `+12h` перед зрізом обовʼязковий: київська північ понеділка — це 21:00
 * або 22:00 UTC НЕДІЛІ, тож `toISOString().slice(0, 10)` без зсуву віддав
 * би неділю. Ключ від цього не ламався (він консистентний сам із собою),
 * але підпис «серія обірвалась такого-то тижня» був би зсунутий на день.
 */
function weekStartKey(ms: number): string {
  const mondayStart = kyivMondayStartMs(ms);
  return new Date(mondayStart + MS_PER_DAY / 2).toISOString().slice(0, 10);
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
  const target = Math.max(1, Math.floor(targetPerWeek));
  const list = Array.isArray(workouts) ? workouts : [];

  // `weekStartKey → скільки завершених тренувань`.
  const perWeek = new Map<string, number>();
  let earliestMs = Infinity;
  for (const w of list) {
    if (typeof w?.endedAt !== "string" || w.endedAt.length === 0) continue;
    const ms = Date.parse(w.endedAt);
    if (!Number.isFinite(ms)) continue;
    if (ms < earliestMs) earliestMs = ms;
    const key = weekStartKey(ms);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }

  const currentWeekStart = kyivMondayStartMs(now.getTime());
  const currentKey = weekStartKey(currentWeekStart);
  const currentWeekWorkouts = perWeek.get(currentKey) ?? 0;

  const empty: WeeklyStreakBreakdown = {
    weeks: 0,
    targetPerWeek: target,
    currentWeekWorkouts,
    currentWeekPending: false,
    brokenOnWeekStart: null,
  };
  if (perWeek.size === 0) return empty;

  const earliestWeekStart = kyivMondayStartMs(earliestMs);
  const currentMet = currentWeekWorkouts >= target;

  let weeks = 0;
  let brokenOnWeekStart: string | null = null;
  // Поточний тиждень зараховуємо лише коли поріг уже взято; інакше
  // починаємо з попереднього — тиждень триває, він ще не програний.
  let cursor = currentMet
    ? currentWeekStart
    : kyivMondayStartMs(currentWeekStart - MS_PER_DAY);

  for (let i = 0; i < MAX_WEEKS_LOOKBACK; i++) {
    if (cursor < earliestWeekStart) break;
    const key = weekStartKey(cursor);
    if ((perWeek.get(key) ?? 0) < target) {
      brokenOnWeekStart = key;
      break;
    }
    weeks += 1;
    // Середина попереднього тижня → його київський старт. Той самий трюк,
    // що й у `computeWeeklyTotals`, і з тієї ж причини (DST).
    cursor = kyivMondayStartMs(cursor - MS_PER_DAY);
  }

  return {
    weeks,
    targetPerWeek: target,
    currentWeekWorkouts,
    currentWeekPending: !currentMet,
    brokenOnWeekStart,
  };
}

/** Лише число тижнів — тонка обгортка над {@link computeWeeklyStreakBreakdown}. */
export function computeWeeklyStreakWeeks(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: WeeklyStreakOptions = {},
): number {
  return computeWeeklyStreakBreakdown(workouts, options).weeks;
}
