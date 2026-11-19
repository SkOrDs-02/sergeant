/**
 * Вправа в тренуванні за типом виміру: чи показувати рядки підходів,
 * дзеркало для старих читачів, патч перемикання типу і правило обʼєму
 * (спека `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 4).
 *
 * AI-CONTEXT: дзеркало (`withMeasureMirror`) — частина сумісності одного
 * мержу. Новий клієнт пише в item і `measure`, і похідний старий `type`,
 * і суми `durationSec` / `distanceM` по зарахованих підходах. Так старий
 * клієнт, калорії (`kcalBurned.ts`) і будь-який непереписаний читач бачать
 * правдиву суму, а не нуль. Записи без явного типу дзеркало не чіпає: там
 * сума на вправі — це і є дані (утримання з програм хвилі 2, імпорт Strong).
 */

import { isSetCompleted } from "./setCompletion.js";
import {
  hasExplicitMeasure,
  itemMeasure,
  measureFields,
  measureHasVolume,
  measureToItemType,
  type ExerciseMeasure,
  type MeasureItemLike,
} from "./measure.js";
import type { WorkoutItem, WorkoutSet } from "../types.js";

export interface MeasureSetsItemLike extends MeasureItemLike {
  readonly sets?: readonly WorkoutSet[] | null | undefined;
  readonly durationSec?: unknown;
  readonly distanceM?: unknown;
}

function positive(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * Чи вправа показує рядки підходів. Силова без типу — як і раніше рядки.
 * Явний тип — рядки, крім одного випадку: підходів немає, а сума на вправі
 * є (записано старим полем) — тоді лишається старе поле, щоб сума не
 * зникла з екрана.
 */
export function itemUsesSetRows(
  item: MeasureSetsItemLike | null | undefined,
): boolean {
  if (!item) return false;
  if (!hasExplicitMeasure(item)) return item.type === "strength";
  if ((item.sets?.length ?? 0) > 0) return true;
  return !(positive(item.durationSec) || positive(item.distanceM));
}

function sumField(
  item: MeasureSetsItemLike,
  field: "durationSec" | "distanceM",
): number {
  let total = 0;
  for (const s of item.sets || []) {
    if (!s || !isSetCompleted(s, item)) continue;
    const n = Number(s[field]);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Похідний `type` і суми зарахованих підходів на вправі. Без явного типу
 * чи без масиву підходів item повертається як є.
 */
export interface MeasureMirrorFields {
  readonly type?: string | null | undefined;
  readonly durationSec?: number | undefined;
  readonly distanceM?: number | undefined;
}

export function withMeasureMirror<T extends MeasureSetsItemLike>(
  item: T,
): T & MeasureMirrorFields {
  if (!hasExplicitMeasure(item)) return item as T & MeasureMirrorFields;
  const m = itemMeasure(item);
  const type = measureToItemType(m);
  if (!Array.isArray(item.sets)) {
    return item.type === type
      ? (item as T & MeasureMirrorFields)
      : ({ ...item, type } as T & MeasureMirrorFields);
  }
  const f = measureFields(m);
  return {
    ...item,
    type,
    durationSec: f.time ? sumField(item, "durationSec") : undefined,
    distanceM: f.distance ? sumField(item, "distanceM") : undefined,
  } as T & MeasureMirrorFields;
}

/** Підхід, приведений до полів типу: несумісне обнуляється чи прибирається. */
function setForMeasure(s: WorkoutSet, m: ExerciseMeasure): WorkoutSet {
  const f = measureFields(m);
  const { durationSec, distanceM, ...rest } = s;
  const out: WorkoutSet = {
    ...rest,
    weightKg: f.weight ? Number(s.weightKg) || 0 : 0,
    reps: f.reps ? Number(s.reps) || 0 : 0,
  };
  if (f.time && durationSec !== undefined) out.durationSec = durationSec;
  if (f.distance && distanceM !== undefined) out.distanceM = distanceM;
  return out;
}

/**
 * Патч перемикання типу вправи. Рядки лишаються (кількість — план
 * програми), сумісні поля зберігаються (вага при вага × повтори →
 * вага × час, секунди при час → дистанція × час), несумісні зникають, щоб
 * прихована величина не рахувалась. Старий item без підходів, але з сумою,
 * стає одним рядком із цією сумою. Суми на вправі перераховує дзеркало.
 */
export function measureSwitchPatch(
  m: ExerciseMeasure,
  item: MeasureSetsItemLike,
): Partial<WorkoutItem> {
  const f = measureFields(m);
  const existing = item.sets || [];
  let sets: WorkoutSet[];
  if (existing.length > 0) {
    sets = existing.map((s) => setForMeasure(s, m));
  } else {
    const seed: WorkoutSet = { weightKg: 0, reps: 0 };
    if (f.time && positive(item.durationSec)) {
      seed.durationSec = Number(item.durationSec);
    }
    if (f.distance && positive(item.distanceM)) {
      seed.distanceM = Number(item.distanceM);
    }
    sets = [seed];
  }
  return withMeasureMirror({
    measure: m,
    type: measureToItemType(m),
    sets,
  }) as Partial<WorkoutItem>;
}

/** Обʼєм `кг×повт` рахується лише для вага × повтори (канон 2026-09-13). */
export function itemHasVolume(
  item: MeasureItemLike | null | undefined,
): boolean {
  return item?.type === "strength" && measureHasVolume(itemMeasure(item));
}
