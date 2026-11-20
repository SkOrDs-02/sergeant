/**
 * Єдине визначення «підхід зараховано» для всього Фізрука (веб і мобілка).
 *
 * AI-CONTEXT: до 2026-11-18 у модулі жили два різні читання. Лічильник сесії
 * (`isSetDone` у вебі) рахував лише повторення, а `computeWorkoutSetCount`,
 * `loadPointsForItem` і через них `isFullWorkout` — «вага > 0 або повторення
 * > 0». Старт програми сіє по рядку `{вага, 0}` на вправу, тож завершене
 * програмне тренування без жодного виконаного підходу давало N «підходів» у
 * підсумку й телеметрії, навантаження у відновленні і ставало «повноцінним»
 * для стріку. Тепер усі читають цей предикат.
 *
 * Правило: підхід виконано, коли є повторення. Вага може бути 0 (вправи з
 * власною вагою). Рядок лише з вагою — підготовлений, але не виконаний.
 *
 * Тип виміру (спека `fizruk-exercise-measure-type.md`, Р-1): підхід на час
 * зараховано за секундами (`set.durationSec`), на дистанцію — за метрами
 * (`set.distanceM`); друга величина (вага, час на дистанції) може бути 0.
 * Тип бере `itemMeasure`: явний `item.measure`, а для записів до фічі — зі
 * старого `type`. Старі item-и часу й дистанції підходів не мають, тож
 * цим предикатом нічого не дають: їхнє навантаження йде з суми на вправі.
 *
 * Виняток один і походить із даних, а не з вибору: утримання й переноски з
 * вагою, імпортовані зі Strong ДО типу виміру, не мають повторень, а їхній
 * час лежить на вправі (`item.durationSec`). Для силової вправи без явного
 * типу і з часом на ній підхід із вагою зараховано. Новий імпорт пише
 * секунди в підходи з типом `weight_time`, тож виняток стосується лише
 * історії.
 *
 * Явний прапорець і тип підходу (спека `fizruk-set-done-flag-and-set-type.md`,
 * міграція 176). `set.done === false` прибирає рядок із підрахунку навіть зі
 * значеннями (план програми, «+ Підхід» без ✓); `true` нічого не додає:
 * порожній рядок, відмічений помилково, не зарахований. NULL / відсутнє поле
 * — запис до фічі, чинне правило вище, тож старі числа не рухаються.
 * Тип `warmup` за рішенням власника 2026-11-19 (П-Фз3-1, А) лишається
 * зарахованим (відновлення його бачить), але не робочим: обʼєм, рекорди,
 * «Підходів», «Вправ N з M» і поріг повноцінного тренування читають
 * `isWorkingSet`. Дроп і «до відмови» — лише позначка (П-Фз3-2, 3).
 */

import { hasExplicitMeasure, itemMeasure, measureCountsBy } from "./measure.js";

export interface CompletableSet {
  readonly weightKg?: unknown;
  readonly reps?: unknown;
  readonly durationSec?: unknown;
  readonly distanceM?: unknown;
  /** `true` / `false` / NULL (запис до фічі). Див. AI-CONTEXT вище. */
  readonly done?: unknown;
  /** `warmup` | `drop` | `failure`, NULL = звичайний. */
  readonly setType?: unknown;
}

export interface SetCompletionItemContext {
  readonly type?: string | null | undefined;
  readonly measure?: unknown;
  readonly durationSec?: unknown;
}

function positive(n: unknown): boolean {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

export function isSetCompleted(
  set: CompletableSet | null | undefined,
  item?: SetCompletionItemContext | null,
): boolean {
  if (!set) return false;
  if (set.done === false) return false;
  const dim = measureCountsBy(itemMeasure(item));
  if (dim === "time") return positive(set.durationSec);
  if (dim === "distance") return positive(set.distanceM);
  if (positive(set.reps)) return true;
  return (
    !hasExplicitMeasure(item) &&
    positive(item?.durationSec) &&
    positive(set.weightKg)
  );
}

/** Розминка (тип `warmup`). */
export function isWarmupSet(set: CompletableSet | null | undefined): boolean {
  return set?.setType === "warmup";
}

/**
 * Робочий підхід: зарахований і не розминка. Читають числа результату:
 * обʼєм, рекорди, прогресія, «Підходів», «Вправ N з M», поріг
 * повноцінного тренування, робочі підходи на мʼяз. Відновлення й калорії
 * читають `isSetCompleted` (розминка — теж навантаження).
 *
 * Споживачі «вага × повтори» (тоннаж, e1RM, прогресія) кличуть його БЕЗ
 * item-а: обидві величини там і так вимагають повторень, а правило без
 * контексту — «повторення > 0», тож на старих рядках (без `done` і типу)
 * число рівно те саме, що до фічі, навіть для старих item-ів часу з
 * випадковими повтореннями.
 */
export function isWorkingSet(
  set: CompletableSet | null | undefined,
  item?: SetCompletionItemContext | null,
): boolean {
  return isSetCompleted(set, item) && !isWarmupSet(set);
}
