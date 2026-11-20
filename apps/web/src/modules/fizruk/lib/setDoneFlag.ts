/**
 * Явний прапорець «виконано» в рядках підходу (спека
 * `docs/work/specs/fizruk-set-done-flag-and-set-type.md`): чисті правила,
 * які ділять жива сесія (`WorkoutItemCard`) і правка завершеного тренування
 * (`WorkoutSummaryItemEditor`).
 */
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import {
  isSetCompleted,
  measureCountsBy,
  measureFields,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";

type CountField = "reps" | "durationSec" | "distanceM";

function countField(measure: ExerciseMeasure): CountField {
  const by = measureCountsBy(measure);
  return by === "time"
    ? "durationSec"
    : by === "distance"
      ? "distanceM"
      : "reps";
}

/**
 * Значення одного підходу за полями типу виміру (без RPE, типу й прапорця).
 */
export function setValuesFor(
  src: WorkoutSet,
  measure: ExerciseMeasure,
): WorkoutSet {
  const f = measureFields(measure);
  return {
    weightKg: f.weight ? (src.weightKg ?? 0) : 0,
    reps: f.reps ? (src.reps ?? 0) : 0,
    ...(f.time && src.durationSec != null
      ? { durationSec: src.durationSec }
      : {}),
    ...(f.distance && src.distanceM != null
      ? { distanceM: src.distanceM }
      : {}),
  };
}

/**
 * «+ Підхід» у живій сесії (дефолт П-Фз3-4 (Б) від 2026-11-19): рядок одразу
 * несе значення найближчого підходу вище, де є лічильна величина (зроблений
 * чи ні), а без нього — «було» тієї ж позиції минулої сесії; прапорець
 * `done: false`, тож у підрахунок рядок іде лише після ✓. Нема ні того, ні
 * того — порожній рядок із `done: false`. RPE і тип не копіюються.
 */
export function seedLiveSet(
  sets: readonly WorkoutSet[],
  measure: ExerciseMeasure,
  lastSessionSets: readonly WorkoutSet[] = [],
): WorkoutSet {
  let src: WorkoutSet | undefined;
  for (let i = sets.length - 1; i >= 0; i -= 1) {
    const s = sets[i];
    if (s && isSetCompleted({ ...s, done: null }, { measure })) {
      src = s;
      break;
    }
  }
  src ??= lastSessionSets[sets.length];
  const values = src ? setValuesFor(src, measure) : { weightKg: 0, reps: 0 };
  return { ...values, done: false };
}

/**
 * Там, де ✓ немає (ретро-сесія, правка завершеного тренування), рядок із
 * `done: false` (план, «+ Підхід» живої сесії) стає зробленим, коли людина
 * вписує лічильну величину > 0 (таблиця «Як їде старий рядок» у спеці:
 * «ретро / правка завершеного, введено значення → true»). Рядки без
 * прапорця не чіпаються: там правило значень і так зараховує.
 */
export function withDoneOnCountInput(
  current: WorkoutSet,
  patch: Partial<WorkoutSet>,
  measure: ExerciseMeasure,
): Partial<WorkoutSet> {
  if (current.done !== false) return patch;
  const v = Number(patch[countField(measure)]);
  return Number.isFinite(v) && v > 0 ? { ...patch, done: true } : patch;
}
