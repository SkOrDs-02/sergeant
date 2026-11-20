/**
 * Рекорди й суми для вправ на час і дистанцію (спека
 * `fizruk-exercise-measure-type.md`, § Рекорди за типом).
 *
 * Вага × повтори має свій рекорд — e1RM (`getExercisePR`, `workoutStats.ts`).
 * Тут — те, чого Еплі не міряє: найдовший ОДИНОЧНИЙ підхід на час і найдовша
 * дистанція одного підходу. Вага на `weight_time` / `weight_distance` —
 * контекст рядка рекорду, а не рекорд: одна величина на тип, щоб борд не
 * множився.
 */

import {
  itemMeasure,
  measureCountsBy,
  type ExerciseMeasure,
  type MeasureItemLike,
} from "./measure.js";
import {
  isSetCompleted,
  isWorkingSet,
  type CompletableSet,
} from "./setCompletion.js";

interface RecordSetLike extends CompletableSet {
  readonly [key: string]: unknown;
}

export interface RecordItemLike extends MeasureItemLike {
  readonly exerciseId?: string | null | undefined;
  readonly sets?:
    readonly (RecordSetLike | null | undefined)[] | null | undefined;
  readonly [key: string]: unknown;
}

export interface RecordWorkoutLike {
  readonly startedAt?: string | null | undefined;
  readonly items?: readonly (RecordItemLike | null | undefined)[] | null;
  readonly [key: string]: unknown;
}

export interface ExerciseMeasureRecord {
  readonly measure: ExerciseMeasure;
  readonly dimension: "time" | "distance";
  /** Секунди (час) або метри (дистанція) найкращого підходу. */
  readonly best: number;
  readonly weightKg: number;
  readonly date: string | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Значення підходу за лічильною величиною часу чи дистанції; інакше `null`. */
export function setMeasureValue(
  set: RecordSetLike | null | undefined,
  item: MeasureItemLike | null | undefined,
): { dimension: "time" | "distance"; value: number } | null {
  const dim = measureCountsBy(itemMeasure(item));
  // Рекорд — лише робочий підхід (розминка поза рекордами, П-Фз3-1).
  if (dim === "reps" || !set || !isWorkingSet(set, item)) return null;
  return {
    dimension: dim,
    value: num(dim === "time" ? set.durationSec : set.distanceM),
  };
}

/** Рекорд вправи на час чи дистанцію; для повторів — `null` (там e1RM). */
export function getExerciseMeasureRecord(
  workouts:
    readonly (RecordWorkoutLike | null | undefined)[] | null | undefined,
  exerciseId: string,
): ExerciseMeasureRecord | null {
  let best: ExerciseMeasureRecord | null = null;
  for (const w of workouts || []) {
    for (const it of w?.items || []) {
      if (!it || it.exerciseId !== exerciseId) continue;
      for (const s of it.sets || []) {
        const v = setMeasureValue(s, it);
        if (!v || v.value <= 0) continue;
        if (!best || v.value > best.best) {
          best = {
            measure: itemMeasure(it),
            dimension: v.dimension,
            best: v.value,
            weightKg: num(s?.weightKg),
            date: w?.startedAt ?? null,
          };
        }
      }
    }
  }
  return best;
}

/** Чи має вправа хоч один зарахований підхід на час чи дистанцію. */
export function itemHasMeasureRecord(
  item: RecordItemLike | null | undefined,
): boolean {
  for (const s of item?.sets || []) {
    const v = setMeasureValue(s, item);
    if (v && v.value > 0) return true;
  }
  return false;
}

/**
 * Сума зарахованих підходів за величиною (секунди чи метри) або `null`, коли
 * підходів із цією величиною немає — тоді читач бере суму на вправі (записи
 * до типу виміру, «Заняття й час»).
 */
export function sumCompletedSets(
  item: RecordItemLike | null | undefined,
  field: "durationSec" | "distanceM",
): number | null {
  let total = 0;
  let any = false;
  for (const s of item?.sets || []) {
    if (!s || !isSetCompleted(s, item)) continue;
    if (s[field] === undefined || s[field] === null) continue;
    any = true;
    total += num(s[field]);
  }
  return any ? total : null;
}
