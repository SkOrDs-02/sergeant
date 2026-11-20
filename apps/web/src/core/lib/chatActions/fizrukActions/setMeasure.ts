/**
 * Підхід із чату за типом виміру вправи (спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 7).
 *
 * AI-CONTEXT: `log_set` приймає повтори, секунди чи метри (хоч одне з
 * трьох). Тип вправи береться з резолвера (памʼять людини → дефолт
 * каталогу), а коли модель дала величину, якої цей тип не має (секунди для
 * вправи на повтори), — з даних, як Strong-імпорт: є метри →
 * `weight_distance` / `distance_time`, є секунди → `weight_time` / `time`,
 * є вага → `weight_reps`. Памʼять типу чат НЕ пише: це не вибір людини в
 * інтерфейсі (спека, «Що пише перемикач»).
 */
import {
  hasExplicitMeasure,
  isSetCompleted,
  itemMeasure,
  measureCountsBy,
  measureFields,
  measureSwitchPatch,
  type ExerciseMeasure,
  type MeasureSetsItemLike,
} from "@sergeant/fizruk-domain/domain";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import {
  formatNumberUk,
  WORKOUT_SET_DISTANCE_M_BOUNDS,
  WORKOUT_SET_DURATION_SEC_BOUNDS,
} from "@sergeant/shared";
import { MAX_REPS } from "@fizruk/lib/numericBounds";

/** Величини одного підходу з чату; 0 — величину не передано. */
export interface ChatSetValues {
  readonly weightKg: number;
  readonly reps: number;
  readonly durationSec: number;
  readonly distanceM: number;
}

export type ParsedChatSet =
  | { readonly ok: true; readonly values: ChatSetValues }
  | { readonly ok: false; readonly error: string };

function provided(raw: unknown): boolean {
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

function positiveNumber(raw: unknown): number {
  if (!provided(raw)) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Розбір величин підходу. Секунди й метри цілі (сервер вимагає ціле,
 * `WORKOUT_SET_*_BOUNDS`), повтори — як і раніше, з межею `MAX_REPS`.
 * Вагу перевіряє викликач (`logSet`), тут вона лише переноситься.
 */
export function parseChatSetValues(
  input: {
    reps?: unknown;
    duration_sec?: unknown;
    distance_m?: unknown;
  },
  weightKg: number,
): ParsedChatSet {
  const reps = positiveNumber(input.reps);
  if (reps > MAX_REPS) {
    return {
      ok: false,
      error: `Забагато повторень у підході (максимум ${MAX_REPS}). Перевір число і спробуй ще раз.`,
    };
  }
  const durationSec = Math.round(positiveNumber(input.duration_sec));
  if (durationSec > WORKOUT_SET_DURATION_SEC_BOUNDS.max) {
    return {
      ok: false,
      error: `Задовгий підхід (максимум ${formatNumberUk(WORKOUT_SET_DURATION_SEC_BOUNDS.max)} с). Перевір число і спробуй ще раз.`,
    };
  }
  const distanceM = Math.round(positiveNumber(input.distance_m));
  if (distanceM > WORKOUT_SET_DISTANCE_M_BOUNDS.max) {
    return {
      ok: false,
      error: `Задовга дистанція підходу (максимум ${formatNumberUk(WORKOUT_SET_DISTANCE_M_BOUNDS.max)} м). Перевір число і спробуй ще раз.`,
    };
  }
  if (reps <= 0 && durationSec <= 0 && distanceM <= 0) {
    return {
      ok: false,
      error: provided(input.reps)
        ? "Некоректна кількість повторень."
        : "Потрібне хоч одне: повторення (reps), секунди (duration_sec) чи метри (distance_m) підходу.",
    };
  }
  return { ok: true, values: { weightKg, reps, durationSec, distanceM } };
}

function counted(m: ExerciseMeasure, v: ChatSetValues): boolean {
  const dim = measureCountsBy(m);
  if (dim === "reps") return v.reps > 0;
  if (dim === "time") return v.durationSec > 0;
  return v.distanceM > 0;
}

/** Тип із самих даних підходу (той самий порядок, що в Strong-імпорті). */
function measureFromData(
  v: ChatSetValues,
  base: ExerciseMeasure,
): ExerciseMeasure {
  const weighted = v.weightKg > 0;
  if (v.distanceM > 0) return weighted ? "weight_distance" : "distance_time";
  if (v.durationSec > 0) return weighted ? "weight_time" : "time";
  if (weighted) return "weight_reps";
  return base === "reps" ? "reps" : "weight_reps";
}

/**
 * Тип вправи для підходу з чату: `base`, якщо він вміщує дані (лічильна
 * величина є, а вага — лише там, де тип має поле ваги), інакше тип із
 * даних. Так обтяження на підтягуваннях не ховається у «лише повтори».
 */
export function measureForChatSet(
  base: ExerciseMeasure,
  v: ChatSetValues,
): ExerciseMeasure {
  const fitsWeight = v.weightKg <= 0 || measureFields(base).weight;
  return counted(base, v) && fitsWeight ? base : measureFromData(v, base);
}

/**
 * `count` однакових підходів із полями лише цього типу. Підхід, записаний
 * через чат (`log_set`), уже зроблений: `done: true` (Фз-3 (в), спека
 * `fizruk-set-done-flag-and-set-type.md`).
 */
export function buildChatSets(
  m: ExerciseMeasure,
  v: ChatSetValues,
  count: number,
): WorkoutSet[] {
  const f = measureFields(m);
  return Array.from({ length: count }, () => {
    const set: WorkoutSet = {
      weightKg: f.weight ? v.weightKg : 0,
      reps: f.reps ? v.reps : 0,
      done: true,
    };
    if (f.time && v.durationSec > 0) set.durationSec = v.durationSec;
    if (f.distance && v.distanceM > 0) set.distanceM = v.distanceM;
    return set;
  });
}

function positiveField(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/** Чи вправа вже має зроблене: зарахований підхід або стару суму без рядків. */
function hasRecordedWork(item: MeasureSetsItemLike): boolean {
  const sets = item.sets ?? [];
  if (sets.some((s) => s && isSetCompleted(s, item))) return true;
  return (
    sets.length === 0 &&
    (positiveField(item.durationSec) || positiveField(item.distanceM))
  );
}

const DIMENSION_HINT = {
  reps: "на повтори; передай reps",
  time: "на час; передай duration_sec",
  distance: "на дистанцію; передай distance_m",
} as const;

export type ExistingItemPlan =
  | {
      readonly ok: true;
      readonly measure: ExerciseMeasure;
      /** Патч типу вправи; `null` — тип лишається як є. */
      readonly patch: ReturnType<typeof measureSwitchPatch> | null;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Тип вправи, що вже є в тренуванні. Змінити його можна лише до першого
 * зробленого підходу (як перемикач у сесії): інакше підходи різних типів
 * змішались би в одній вправі. Стара вправа на час чи дистанцію без явного
 * типу дістає його (сума на вправі стає одним рядком, `measureSwitchPatch`),
 * бо інакше нові рядки підходів не показались би в сесії.
 */
export function planExistingItem(
  item: MeasureSetsItemLike,
  name: string,
  v: ChatSetValues,
): ExistingItemPlan {
  const current = itemMeasure(item);
  const target = measureForChatSet(current, v);
  if (target !== current) {
    if (hasRecordedWork(item)) {
      return {
        ok: false,
        error: `«${name}» у цьому тренуванні вже має підходи ${DIMENSION_HINT[measureCountsBy(current)]}.`,
      };
    }
    return {
      ok: true,
      measure: target,
      patch: measureSwitchPatch(target, item),
    };
  }
  if (!hasExplicitMeasure(item) && item.type !== "strength") {
    return {
      ok: true,
      measure: target,
      patch: measureSwitchPatch(target, item),
    };
  }
  return { ok: true, measure: target, patch: null };
}

/** Тип плану: секунди → тип із часом, вага → тип із вагою. */
export function measureForPlan(
  base: ExerciseMeasure,
  seconds: number,
  weightKg: number,
): ExerciseMeasure {
  let m = base;
  if (seconds > 0 && !measureFields(m).time) m = "time";
  if (weightKg > 0 && !measureFields(m).weight) {
    if (m === "reps") m = "weight_reps";
    else if (m === "time") m = "weight_time";
    else if (m === "distance_time") m = "weight_distance";
  }
  return m;
}
