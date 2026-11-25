/**
 * Status: Active
 *
 * Undo для чат-тулів, що переписують поля наявної звички (`edit_habit`,
 * `set_habit_schedule`, `pause_habit`; аудит `logic-03`).
 *
 * AI-CONTEXT: undo повертає лише ті поля, які записав сам тул, і лише якщо
 * вони досі мають записане ним значення. Повний знімок звички, накладений
 * назад, відкотив би правки, що встигли приїхати між дією і тапом
 * «скасувати» (інше поле з форми, pull з іншого пристрою), — та сама
 * пастка, яку `data-61` закрив для форми редагування (`habitEditPatch.ts`).
 * Поле, яке після тула змінив хтось інший, undo не чіпає: нове значення
 * свідоміше за наше старе.
 */
import {
  loadRoutineState,
  saveRoutineState,
} from "../../../modules/routine/lib/routineStorage";
import type { Habit } from "../../../modules/routine/lib/types";

/** Знімок полів звички: значення ДО запису тула (undefined = поля не було). */
export type HabitFieldSnapshot = Partial<Record<keyof Habit, unknown>>;

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Значення `keys` звички `habit` до запису, для `restoreHabitFields`. */
export function snapshotHabitFields(
  habit: Habit,
  keys: ReadonlyArray<keyof Habit>,
): HabitFieldSnapshot {
  const out: HabitFieldSnapshot = {};
  for (const key of keys) out[key] = habit[key];
  return out;
}

/**
 * Повернути поля звички `habitId` до `before`, якщо зараз у них досі
 * `written` (те, що записав тул). Решта полів і решта звичок не змінюються.
 */
export function restoreHabitFields(
  habitId: string,
  before: HabitFieldSnapshot,
  written: HabitFieldSnapshot,
): void {
  const cur = loadRoutineState();
  const at = cur.habits.findIndex((h) => h.id === habitId);
  const target = cur.habits[at];
  if (at < 0 || !target) return;
  // `undefined` у знімку = поля не було; JSON-серіалізація його й прибере.
  const patch: Partial<Habit> = {};
  let changed = false;
  for (const key of Object.keys(before) as Array<keyof Habit>) {
    if (!sameValue(target[key], written[key])) continue;
    if (sameValue(target[key], before[key])) continue;
    Object.assign(patch, { [key]: before[key] });
    changed = true;
  }
  if (!changed) return;
  const habits = cur.habits.slice();
  habits[at] = { ...target, ...patch };
  saveRoutineState({ ...cur, habits });
}

/**
 * Undo-closure для тула, що записав `next` поверх `prev` у полях `keys`.
 */
export function habitFieldsUndo(
  habitId: string,
  prev: Habit,
  next: Habit,
  keys: ReadonlyArray<keyof Habit>,
): () => void {
  const before = snapshotHabitFields(prev, keys);
  const written = snapshotHabitFields(next, keys);
  return () => restoreHabitFields(habitId, before, written);
}
