/**
 * Pure state reducers for the Routine module.
 *
 * Each function takes a `RoutineState` (plus arguments) and returns a
 * new `RoutineState` — no side effects, no persistence, no DOM access.
 * Platform adapters (web `routineStorage.ts`, mobile MMKV hook) wrap
 * these with their own save-and-emit logic.
 *
 * Extracted from `apps/web/src/modules/routine/lib/routineStorage.ts`
 * (Phase 5 / PR 2). The web adapter now imports these verbatim and
 * persists the returned state.
 */

import { dateKeyFromDate } from "./dateKeys.js";
import { habitScheduledOnDate } from "./schedule.js";
import { completionNoteKey } from "./completionNoteKey.js";
import {
  normalizeCompletionList,
  normalizeHabit,
  normalizeReminderTimesStorage,
  routineUid,
} from "./storage.js";
import type {
  Category,
  CreateHabitOptions,
  Habit,
  RoutineState,
  Tag,
} from "./types.js";

/** Додає новий тег. Ігнорує порожнє імʼя. */
export function applyCreateTag(
  state: RoutineState,
  name: string,
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  const t: Tag = { id: routineUid("tag"), name: n, scope: "routine" };
  return { ...state, tags: [...state.tags, t] };
}

export function applyCreateCategory(
  state: RoutineState,
  name: string,
  emoji = "",
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  const c: Category = {
    id: routineUid("cat"),
    name: n,
    emoji: emoji || undefined,
  };
  return { ...state, categories: [...state.categories, c] };
}

/**
 * Створити нову звичку. Повертає незмінений state якщо `name` порожнє.
 */
export function applyCreateHabit(
  state: RoutineState,
  {
    name = "",
    emoji = "✓",
    tagIds = [],
    categoryId = null,
    recurrence = "daily",
    startDate = null,
    endDate = null,
    timeOfDay = "",
    reminderTimes = [],
    weekdays = [0, 1, 2, 3, 4, 5, 6],
  }: Partial<CreateHabitOptions> = {},
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  const sd =
    (startDate && String(startDate).trim()) || dateKeyFromDate(new Date());
  const h = normalizeHabit({
    id: routineUid("hab"),
    name: n,
    emoji: emoji || "✓",
    tagIds: Array.isArray(tagIds) ? tagIds : [],
    categoryId: categoryId || null,
    createdAt: new Date().toISOString(),
    archived: false,
    recurrence,
    startDate: sd,
    endDate: endDate && String(endDate).trim() ? String(endDate).trim() : null,
    timeOfDay:
      timeOfDay && String(timeOfDay).trim()
        ? String(timeOfDay).trim().slice(0, 5)
        : "",
    reminderTimes: normalizeReminderTimesStorage(reminderTimes),
    weekdays: Array.isArray(weekdays)
      ? [...new Set(weekdays)].sort((a, b) => a - b)
      : [0, 1, 2, 3, 4, 5, 6],
  });
  const order = [...(state.habitOrder || []), h.id];
  return {
    ...state,
    habits: [...state.habits, h],
    completions: { ...state.completions },
    habitOrder: order,
  };
}

/**
 * Часткове оновлення звички за id (нормалізуємо після мерджу).
 * Повертає той самий `state` якщо звичка з таким `id` не існує
 * або якщо нормалізований результат ідентичний поточній звичці.
 */
export function applyUpdateHabit(
  state: RoutineState,
  id: string,
  patch: Partial<Habit>,
): RoutineState {
  const current = state.habits.find((h) => h.id === id);
  if (!current) return state;
  const updated = normalizeHabit({ ...current, ...patch });
  if (JSON.stringify(updated) === JSON.stringify(current)) return state;
  return {
    ...state,
    habits: state.habits.map((h) => (h.id === id ? updated : h)),
  };
}

export function applySetPref<K extends string>(
  state: RoutineState,
  key: K,
  value: unknown,
): RoutineState {
  return { ...state, prefs: { ...state.prefs, [key]: value } };
}

/**
 * Перемкнути відмітку виконання звички за день. No-op якщо звичка
 * не запланована на цей день і ще не позначена.
 */
export function applyToggleHabitCompletion(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  const curSet = new Set(normalizeCompletionList(state.completions[habitId]));
  if (curSet.has(dateKey)) {
    curSet.delete(dateKey);
  } else {
    if (!habitScheduledOnDate(habit, dateKey)) return state;
    curSet.add(dateKey);
  }
  const cur = [...curSet].sort();
  return {
    ...state,
    completions: { ...state.completions, [habitId]: cur },
  };
}

/** Усі активні звички, заплановані на день, отримують відмітку (якщо ще немає). */
export function applyMarkAllScheduledHabitsComplete(
  state: RoutineState,
  dateKey: string,
): RoutineState {
  const active = state.habits.filter((h) => !h.archived);
  const completions = { ...state.completions };
  let changed = false;
  for (const h of active) {
    if (!habitScheduledOnDate(h, dateKey)) continue;
    const set = new Set(normalizeCompletionList(completions[h.id]));
    if (set.has(dateKey)) continue;
    set.add(dateKey);
    completions[h.id] = [...set].sort();
    changed = true;
  }
  if (!changed) return state;
  return { ...state, completions };
}

export function applySetHabitArchived(
  state: RoutineState,
  id: string,
  archived: boolean,
): RoutineState {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return state;
  if (habit.archived === !!archived) return state;
  return applyUpdateHabit(state, id, { archived: !!archived });
}

export function applyDeleteHabit(
  state: RoutineState,
  id: string,
): RoutineState {
  if (!state.habits.some((h) => h.id === id)) return state;
  const completions = { ...state.completions };
  delete completions[id];
  const notes = { ...(state.completionNotes || {}) };
  const prefix = `${id}__`;
  for (const k of Object.keys(notes)) {
    if (k.startsWith(prefix)) delete notes[k];
  }
  return {
    ...state,
    habits: state.habits.filter((h) => h.id !== id),
    completions,
    completionNotes: notes,
    habitOrder: (state.habitOrder || []).filter((x) => x !== id),
  };
}

export interface HabitSnapshot {
  habit: Habit;
  completions: string[];
  notes: Record<string, string>;
  orderIndex: number;
}

/**
 * Повний знімок стану звички для undo-toast.
 */
export function snapshotHabit(
  state: RoutineState,
  id: string,
): HabitSnapshot | null {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return null;
  const completions = Array.isArray(state.completions?.[id])
    ? [...state.completions[id]]
    : [];
  const notes: Record<string, string> = {};
  const prefix = `${id}__`;
  const rawNotes = state.completionNotes || {};
  for (const k of Object.keys(rawNotes)) {
    if (k.startsWith(prefix)) notes[k] = rawNotes[k];
  }
  const order = Array.isArray(state.habitOrder) ? state.habitOrder : [];
  const orderIndex = order.indexOf(id);
  return { habit, completions, notes, orderIndex };
}

/**
 * Відновити звичку зі знімка. Ідемпотентно: якщо звичка з таким id
 * вже існує, повертаємо state без змін.
 */
export function applyRestoreHabit(
  state: RoutineState,
  snapshot: HabitSnapshot | null | undefined,
): RoutineState {
  if (!snapshot || !snapshot.habit || !snapshot.habit.id) return state;
  const { habit, completions, notes, orderIndex } = snapshot;
  if (state.habits.some((h) => h.id === habit.id)) return state;
  const nextCompletions = { ...state.completions };
  if (Array.isArray(completions) && completions.length) {
    nextCompletions[habit.id] = [...completions];
  }
  const nextNotes = { ...(state.completionNotes || {}), ...(notes || {}) };
  const existingOrder = (state.habitOrder || []).filter((x) => x !== habit.id);
  const insertAt =
    typeof orderIndex === "number" && orderIndex >= 0
      ? Math.min(orderIndex, existingOrder.length)
      : existingOrder.length;
  const nextOrder = [
    ...existingOrder.slice(0, insertAt),
    habit.id,
    ...existingOrder.slice(insertAt),
  ];
  return {
    ...state,
    habits: [...state.habits, normalizeHabit(habit)],
    completions: nextCompletions,
    completionNotes: nextNotes,
    habitOrder: nextOrder,
  };
}

export function applyAddPushupReps(
  state: RoutineState,
  reps: unknown,
): RoutineState {
  const n = Number(reps);
  if (!Number.isFinite(n) || n <= 0) return state;
  const today = dateKeyFromDate(new Date());
  const cur = state.pushupsByDate?.[today] ?? 0;
  return {
    ...state,
    pushupsByDate: { ...state.pushupsByDate, [today]: cur + n },
  };
}

export function applyMoveHabitInOrder(
  state: RoutineState,
  habitId: string,
  delta: number,
): RoutineState {
  const active = state.habits.filter((h) => !h.archived).map((h) => h.id);
  const order = [...(state.habitOrder || [])].filter((id) =>
    active.includes(id),
  );
  for (const id of active) {
    if (!order.includes(id)) order.push(id);
  }
  const i = order.indexOf(habitId);
  if (i < 0) return state;
  const j = i + delta;
  if (j < 0 || j >= order.length) return state;
  const copy = [...order];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return { ...state, habitOrder: copy };
}

/** Повний порядок активних звичок (наприклад після drag-and-drop). */
export function applySetHabitOrder(
  state: RoutineState,
  orderedActiveIds: string[],
): RoutineState {
  const active = state.habits.filter((h) => !h.archived).map((h) => h.id);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of orderedActiveIds) {
    if (active.includes(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of active) {
    if (!seen.has(id)) order.push(id);
  }
  const prev = state.habitOrder || [];
  if (order.length === prev.length && order.every((id, i) => id === prev[i])) {
    return state;
  }
  return { ...state, habitOrder: order };
}

export function applySetCompletionNote(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  text: string,
): RoutineState {
  const k = completionNoteKey(habitId, dateKey);
  const notes = { ...(state.completionNotes || {}) };
  const t = (text || "").trim();
  if (!t) {
    if (!(k in notes)) return state;
    delete notes[k];
  } else {
    const habitExists = state.habits.some((h) => h.id === habitId);
    if (!habitExists) return state;
    notes[k] = t.slice(0, 500);
  }
  return { ...state, completionNotes: notes };
}

export function applyUpdateTag(
  state: RoutineState,
  id: string,
  newName: string,
): RoutineState {
  const n = (newName || "").trim();
  if (!n) return state;
  return {
    ...state,
    tags: state.tags.map((t) => (t.id === id ? { ...t, name: n } : t)),
  };
}

export function applyUpdateCategory(
  state: RoutineState,
  id: string,
  patch: { name?: string; emoji?: string },
): RoutineState {
  return {
    ...state,
    categories: state.categories.map((c) =>
      c.id === id
        ? {
            ...c,
            ...(patch.name !== undefined
              ? { name: (patch.name || "").trim() || c.name }
              : {}),
            ...(patch.emoji !== undefined
              ? { emoji: patch.emoji || undefined }
              : {}),
          }
        : c,
    ),
  };
}

export function applyDeleteCategory(
  state: RoutineState,
  id: string,
): RoutineState {
  return {
    ...state,
    categories: state.categories.filter((c) => c.id !== id),
    habits: state.habits.map((h) =>
      h.categoryId === id ? { ...h, categoryId: null } : h,
    ),
  };
}

export function applyDeleteTag(state: RoutineState, id: string): RoutineState {
  return {
    ...state,
    tags: state.tags.filter((t) => t.id !== id),
    habits: state.habits.map((h) => ({
      ...h,
      tagIds: (h.tagIds || []).filter((x) => x !== id),
    })),
  };
}
