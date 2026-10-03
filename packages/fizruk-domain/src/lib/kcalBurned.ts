/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Оцінка витрачених калорій за MET.
 *
 * ```
 * kcal = MET × множник інтенсивності × вага (кг) × (тривалість / 3600)
 * ```
 *
 * Плоскі «ккал/хв», якими користуються конкуренти, для 60 кг завищують, а
 * для 90 кг занижують: вага в цій формулі - множник, а не поправка. Вага в
 * продукті є (fizruk - джерело істини, ADR-0080), тож береться канонічна
 * форма.
 *
 * Результат ЗБЕРІГАЄТЬСЯ числом у `Workout.kcalBurned` (колонка
 * `fizruk_workouts.kcal_burned`, міграція 132) і має пріоритет над
 * перерахунком: зміна ваги наступного місяця не переписує торішні записи
 * заднім числом.
 *
 * Формула лишається фолбеком для сесій БЕЗ збереженого числа - детальних
 * тренувань і записів, зроблених до появи колонки. Там MET береться з
 * каталогу за `exerciseId`, а множник інтенсивності вже вкладено в
 * `durationSec` item-а.
 */

import {
  ACTIVITY_INTENSITY_MULTIPLIERS,
  activityMet,
  type ActivityIntensity,
} from "../data/activities.js";
import { findExerciseById } from "../data/index.js";
import type { WorkoutItem } from "../domain/types.js";

/** Префікс `exerciseId` у item-і, зібраному з каталогу занять. */
export const ACTIVITY_EXERCISE_ID_PREFIX = "activity:";

export interface ComputeKcalBurnedInput {
  /** MET заняття або вправи. */
  met: number;
  /** Рівень зусилля; за замовчуванням `normal` (множник 1.0). */
  intensity?: ActivityIntensity | undefined;
  /** Вага тіла, кг. Без неї оцінки не існує. */
  weightKg: number | null | undefined;
  durationSec: number;
}

/**
 * Ккал, округлені до цілих. `null` - коли одного з входів бракує або він
 * невалідний: це «не знаємо», а не «нуль», і UI має показати саме це.
 */
export function computeKcalBurned({
  met,
  intensity,
  weightKg,
  durationSec,
}: ComputeKcalBurnedInput): number | null {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }
  if (!Number.isFinite(met) || met <= 0) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const multiplier = ACTIVITY_INTENSITY_MULTIPLIERS[intensity ?? "normal"];
  return Math.round((met * multiplier * weightKg * durationSec) / 3600);
}

/** Форма, достатня для оцінки витрат по одному item-у. */
type KcalItem = Pick<WorkoutItem, "type"> &
  Partial<
    Pick<
      WorkoutItem,
      "sets" | "durationSec" | "met" | "intensity" | "exerciseId"
    >
  >;

/**
 * MET item-а: власне поле, інакше - з каталогу за `exerciseId`.
 *
 * Фолбек на каталог тут не про зручність. Шар персистенції Фізрука
 * колонковий (`fizruk_workout_items`), і поля поза його колонками до
 * перезавантаження не доживають; `exerciseId` доживає. Тож MET відновлюється
 * з довідника, а не дублюється колонкою в кожному рядку: сесія має
 * збережене число витрат, а MET потрібен лише там, де його немає.
 */
export function metForItem(item: KcalItem | null | undefined): number | null {
  const own = Number(item?.met);
  if (Number.isFinite(own) && own > 0) return own;
  const exerciseId = item?.exerciseId;
  if (typeof exerciseId !== "string" || exerciseId.length === 0) return null;
  if (exerciseId.startsWith(ACTIVITY_EXERCISE_ID_PREFIX)) {
    return activityMet(exerciseId.slice(ACTIVITY_EXERCISE_ID_PREFIX.length));
  }
  const met = Number(findExerciseById(exerciseId)?.met);
  return Number.isFinite(met) && met > 0 ? met : null;
}

function itemSetCount(item: KcalItem): number {
  return (item.sets ?? []).length;
}

/**
 * Розкладає тривалість сесії по items. Для `strength` тривалість самого
 * item-а зазвичай нуль (людина писала підходи, не секундомір), тож частка
 * загального часу береться пропорційно кількості підходів - інакше силове
 * тренування давало б нуль витрат просто тому, що ніхто не тримав таймер.
 */
function itemDurationsSec(
  items: KcalItem[],
  sessionDurationSec: number,
): number[] {
  const ownDurations = items.map((item) =>
    item.type === "strength" ? 0 : Number(item.durationSec) || 0,
  );
  const accounted = ownDurations.reduce((s, d) => s + d, 0);
  const remaining = Math.max(0, sessionDurationSec - accounted);
  const setCounts = items.map((item) =>
    item.type === "strength" ? itemSetCount(item) : 0,
  );
  const totalSets = setCounts.reduce((s, n) => s + n, 0);
  return items.map((_, i) => {
    const own = ownDurations[i] ?? 0;
    if (own > 0) return own;
    const sets = setCounts[i] ?? 0;
    if (totalSets > 0) return (remaining * sets) / totalSets;
    return 0;
  });
}

export interface WorkoutKcalInput {
  items?: KcalItem[] | undefined;
  startedAt?: string | undefined;
  endedAt?: string | null | undefined;
  kcalBurned?: number | undefined;
}

function sessionDurationSec(w: WorkoutKcalInput): number {
  const start = Date.parse(w.startedAt ?? "");
  const end = Date.parse(w.endedAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 1000);
}

/**
 * Витрати тренування: збережене число, якщо воно вже є (простий запис -
 * D5), інакше оцінка по items детальної сесії.
 *
 * `null` означає «оцінити нічим» - немає ваги, немає MET або немає часу.
 */
export function computeWorkoutKcalBurned(
  workout: WorkoutKcalInput | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!workout) return null;
  if (typeof workout.kcalBurned === "number" && workout.kcalBurned > 0) {
    return workout.kcalBurned;
  }
  const items = (workout.items ?? []) as KcalItem[];
  if (items.length === 0) return null;
  const durations = itemDurationsSec(items, sessionDurationSec(workout));
  let total = 0;
  let counted = 0;
  items.forEach((item, i) => {
    const met = metForItem(item);
    if (met === null) return;
    const kcal = computeKcalBurned({
      met,
      // Інтенсивність СЮДИ не передається навмисно: її множник уже
      // вкладено в `durationSec` item-а (там він потрібен моделі
      // відновлення). Застосувати його вдруге означало б порахувати
      // «важко» двічі.
      weightKg,
      durationSec: durations[i] ?? 0,
    });
    if (kcal === null) return;
    total += kcal;
    counted += 1;
  });
  return counted > 0 ? total : null;
}
