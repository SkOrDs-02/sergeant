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

import { dateKeyFromDate, parseDateKey } from "./dateKeys.js";
import {
  DEFAULT_ROUTINE_GLYPH,
  resolveHabitGlyph,
  upgradeHabitGlyph,
} from "./glyphs.js";
import { habitScheduledOnDate } from "./schedule.js";
import { completionNoteKey } from "./completionNoteKey.js";
import { reconcileHabitOrder } from "./habitOrder.js";
import {
  SKIP_NOTE_MAX_LENGTH,
  normalizeCompletionList,
  normalizeHabit,
  normalizePauseIntervals,
  normalizeReminderTimesStorage,
  routineUid,
} from "./storage.js";
import { isFlexibleHabit, weekDoneCountExcludingDate } from "./weeklyTarget.js";
import type {
  Category,
  CreateHabitOptions,
  Habit,
  HabitSkip,
  PauseInterval,
  RoutineState,
  SkipReason,
  Tag,
} from "./types.js";

/**
 * Додає новий тег. Ігнорує порожнє імʼя. Також ігнорує дублікат
 * (case-insensitive trim-порівняння з вже існуючими тегами) — раніше
 * `applyCreateTag` сліпо пушив новий запис із новим `id`, через що у
 * routine-settings можна було натиснути «+» двічі підряд й отримати
 * двох однакових з виду тегів. Reducer тепер є джерелом істини для
 * інваріанта «унікальна назва у scope='routine'»; UI-шари показують
 * toast, щоб користувач розумів, що submit не пройшов.
 */
export function applyCreateTag(
  state: RoutineState,
  name: string,
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  const key = n.toLocaleLowerCase();
  if (state.tags.some((t) => t.name.trim().toLocaleLowerCase() === key)) {
    return state;
  }
  const t: Tag = { id: routineUid("tag"), name: n, scope: "routine" };
  return { ...state, tags: [...state.tags, t] };
}

/**
 * Додає нову категорію. Окрім ignore порожнього імені, відсіює
 * дублікати (case-insensitive trim-порівняння). Параллель до
 * `applyCreateTag` — див. коментар вище.
 */
export function applyCreateCategory(
  state: RoutineState,
  name: string,
  emoji = "",
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  const key = n.toLocaleLowerCase();
  if (state.categories.some((c) => c.name.trim().toLocaleLowerCase() === key)) {
    return state;
  }
  // `emoji` тут — гліф-slug (див. `glyphs.ts`); legacy emoji, що приходить
  // від чат-тулів чи старих клієнтів, апгрейдиться, невідоме відкидається.
  const glyph = upgradeHabitGlyph(emoji);
  const c: Category = {
    id: routineUid("cat"),
    name: n,
    ...(glyph ? { emoji: glyph } : {}),
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
    emoji = DEFAULT_ROUTINE_GLYPH,
    tagIds = [],
    categoryId = null,
    recurrence = "daily",
    startDate = null,
    endDate = null,
    timeOfDay = "",
    reminderTimes = [],
    weekdays = [0, 1, 2, 3, 4, 5, 6],
    id,
  }: Partial<CreateHabitOptions> = {},
): RoutineState {
  const n = (name || "").trim();
  if (!n) return state;
  // Idempotency by client-generated id — a double-tapped save button and a
  // replayed offline write both land here with the same id.
  if (id && state.habits.some((h) => h.id === id)) return state;
  const sd =
    (startDate && String(startDate).trim()) || dateKeyFromDate(new Date());
  const h = normalizeHabit({
    id: id || routineUid("hab"),
    name: n,
    emoji: resolveHabitGlyph(emoji),
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
 * Внутрішній хелпер: додати відмітку виконання за день і зняти «не зміг»
 * (три стани дня взаємно виключні, канон §5). НЕ перевіряє розклад — виклик
 * відповідає за це сам, бо у `applyToggleHabitCompletion` і в
 * `applyMarkAllScheduledHabitsComplete` предикат розкладу викликається з
 * РІЗНИМИ опціями (`weekDoneCount` для гнучких звичок рахується інакше в
 * bulk-варіанті). No-op (та сама ідентичність `state`), якщо день уже
 * відмічено — це і є спільна точка «вже готово, більше нічого робити».
 */
function markHabitDone(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const curSet = new Set(normalizeCompletionList(state.completions[habitId]));
  if (curSet.has(dateKey)) return state;
  curSet.add(dateKey);
  const cur = [...curSet].sort();
  const next: RoutineState = {
    ...state,
    completions: { ...state.completions, [habitId]: cur },
  };
  return clearSkip(next, habitId, dateKey);
}

/**
 * Межа «сьогодні» для редюсерів, які СТАВЛЯТЬ відмітку.
 *
 * AI-CONTEXT: поле обовʼязкове навмисно, і це головне в цьому типі.
 * Опційна опція тут уже коштувала: рівно так `weekDoneCount` роками не
 * доїжджав до трьох поверхонь (PR-R4), бо кожен новий call-site мовчки
 * отримував дефолт. Обовʼязковість робить компілятор єдиним, хто стежить
 * за повнотою, — і він не забуває.
 *
 * Значення — день за годинником **ПРИСТРОЮ** (ADR-0078: межа особистої
 * доби device-local, не київська). У вебі це `anchoredTodayKey()` з
 * `routine/lib/dayAnchor.ts`; передавати сюди київський день не можна —
 * для користувача на захід від Києва це зсунуло б «сьогодні» на добу.
 */
export interface CompletionDayBounds {
  /** Сьогодні за годинником пристрою, `YYYY-MM-DD`. */
  todayKey: string;
}

/**
 * Чи день у майбутньому відносно «сьогодні».
 *
 * Обидва ключі — `YYYY-MM-DD`, тож лексикографічне порівняння дає
 * календарний порядок. Той самий прийом, що в `heatmap/grid.ts:241`.
 */
function isFutureDay(dateKey: string, todayKey: string): boolean {
  return dateKey > todayKey;
}

/**
 * Перемкнути відмітку виконання звички за день. No-op якщо звичка
 * не запланована на цей день і ще не позначена.
 *
 * **Майбутній день позначити НЕ можна** (рішення власника 2026-09-14,
 * знахідка PR-R3). Доти єдиною перевіркою дати був `habitScheduledOnDate`,
 * а він майбутнє не відсікає взагалі — тож зріз «Завтра» приймав відмітку,
 * і майбутній факт їхав у серії, у синк і у звіти.
 *
 * ЗНЯТИ відмітку з майбутнього дня при цьому можна, і гілка зняття стоїть
 * ВИЩЕ гейта саме тому: дані, записані до появи цієї межі, мусять лишатись
 * виправними. Заборона лише на постановку.
 */
export function applyToggleHabitCompletion(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  bounds: CompletionDayBounds,
): RoutineState {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  const curSet = new Set(normalizeCompletionList(state.completions[habitId]));
  if (curSet.has(dateKey)) {
    curSet.delete(dateKey);
    const cur = [...curSet].sort();
    return {
      ...state,
      completions: { ...state.completions, [habitId]: cur },
    };
  }
  if (isFutureDay(dateKey, bounds.todayKey)) return state;
  if (!habitScheduledOnDate(habit, dateKey)) return state;
  return markHabitDone(state, habitId, dateKey);
}

/** Внутрішній хелпер: прибрати позначку пропуску, зберігши незмінність. */
function clearSkip(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const forHabit = state.skips?.[habitId];
  if (!forHabit || !forHabit[dateKey]) return state;
  const rest = { ...forHabit };
  delete rest[dateKey];
  const skips = { ...(state.skips || {}) };
  if (Object.keys(rest).length === 0) delete skips[habitId];
  else skips[habitId] = rest;
  return { ...state, skips };
}

/**
 * Позначити день як «не зміг з причиною» (канон §5, третій стан).
 *
 * Взаємно виключно з відміткою виконання: ставлячи пропуск, знімаємо
 * `completions`-ключ. No-op для дня, який звичці не запланований — інакше
 * можна було б «не змогти» у вихідний, і знаменник поїхав би вниз на
 * днях, яких у ньому й не було.
 */
export function applySetHabitSkip(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  reason: SkipReason,
  note?: string,
): RoutineState {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  if (!habitScheduledOnDate(habit, dateKey)) return state;

  const trimmed = (note || "").trim();
  const skip: HabitSkip = {
    reason,
    at: new Date().toISOString(),
    ...(trimmed ? { note: trimmed.slice(0, SKIP_NOTE_MAX_LENGTH) } : {}),
  };
  const forHabit = { ...(state.skips?.[habitId] || {}), [dateKey]: skip };
  const completions = normalizeCompletionList(state.completions[habitId]);
  const withoutDone = completions.filter((k) => k !== dateKey);
  return {
    ...state,
    completions:
      withoutDone.length === completions.length
        ? state.completions
        : { ...state.completions, [habitId]: withoutDone },
    skips: { ...(state.skips || {}), [habitId]: forHabit },
  };
}

/** Зняти позначку «не зміг» — день повертається у стан «не зробив». */
export function applyClearHabitSkip(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  return clearSkip(state, habitId, dateKey);
}

/**
 * Заявити плановану паузу датованим інтервалом (канон §4).
 *
 * `to === null` — пауза без дати кінця. Інтервали нормалізуються й
 * зливаються, тож повторний виклик на той самий діапазон ідемпотентний.
 * Легасі-прапор `paused` при цьому НЕ вмикається: він недатований і, на
 * відміну від інтервалу, ретроактивний — саме та вада, яку рядок
 * закриває.
 */
export function applyPauseHabitBetween(
  state: RoutineState,
  habitId: string,
  fromKey: string,
  toKey: string | null,
): RoutineState {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  if (toKey !== null && toKey < fromKey) return state;
  const intervals = normalizePauseIntervals([
    ...(habit.pauseIntervals || []),
    { from: fromKey, to: toKey },
  ]);
  // Ідентичність, а не лише рівність значень: повторний виклик на той самий
  // діапазон має віддати ТОЙ САМИЙ `state`. Інакше кожен повтор народжував
  // би `habit-upsert` у дуал-райті (`habitChanged` порівнює масиви за
  // посиланням) і чат-тул рапортував би «поставлено» замість «уже на паузі».
  const prevIntervals = habit.pauseIntervals || [];
  if (
    prevIntervals.length === intervals.length &&
    prevIntervals.every(
      (iv, i) => iv.from === intervals[i]?.from && iv.to === intervals[i]?.to,
    )
  ) {
    return state;
  }
  const updated: Habit = { ...habit, pauseIntervals: intervals };
  return {
    ...state,
    habits: state.habits.map((h) => (h.id === habitId ? updated : h)),
  };
}

/**
 * Достроково завершити паузу, що накриває `dateKey`.
 *
 * Інтервал не видаляється — він **закривається** днем перед `dateKey`,
 * бо дні, що вже минули на паузі, минули на паузі. Стирання інтервалу
 * заднім числом перетворило б відпустку на серію пропусків, тобто
 * повторило б рівно баг недатованого `paused`.
 */
export function applyResumeHabitFrom(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  const intervals = habit.pauseIntervals || [];
  if (intervals.length === 0 && !habit.paused) return state;

  const dayBefore = (() => {
    const d = parseDateKey(dateKey);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return dateKeyFromDate(d);
  })();

  const next: PauseInterval[] = [];
  for (const iv of intervals) {
    const covers = dateKey >= iv.from && (iv.to === null || dateKey <= iv.to);
    if (!covers) {
      next.push(iv);
      continue;
    }
    // Пауза починалась сьогодні чи пізніше — вона ще не діяла, прибираємо.
    if (dayBefore < iv.from) continue;
    next.push({ from: iv.from, to: dayBefore });
  }
  const updated: Habit = {
    ...habit,
    pauseIntervals: normalizePauseIntervals(next),
    paused: false,
  };
  return {
    ...state,
    habits: state.habits.map((h) => (h.id === habitId ? updated : h)),
  };
}

/**
 * Усі активні звички, заплановані на день, отримують відмітку (якщо ще
 * немає). Проведено через той самий `markHabitDone`, що й одиночний
 * `applyToggleHabitCompletion` — це і знімає «не зміг» на позначених
 * звичках (три стани дня взаємно виключні, канон §5), і рахує
 * `weekDoneCount` для гнучких звичок ОКРЕМО на кожну звичку, а не
 * покладається на дефолт «завжди заплановано», яким `habitScheduledOnDate`
 * відповідає без опції. Без цього гнучка звичка, що вже виконала тижневу
 * ціль, отримувала б зайву відмітку від масового «Відмітити все».
 */
export function applyMarkAllScheduledHabitsComplete(
  state: RoutineState,
  dateKey: string,
  bounds: CompletionDayBounds,
): RoutineState {
  // Майбутній день не позначається — той самий гейт, що в одиночному
  // шляху (PR-R3). Без нього зріз «Завтра» лишався б робочим для масової
  // дії навіть після заборони одиночної: знахідка називала саме масову,
  // але діра була в обох.
  if (isFutureDay(dateKey, bounds.todayKey)) return state;
  const active = state.habits.filter((h) => !h.archived);
  let next = state;
  let changed = false;
  for (const h of active) {
    const completionsForHabit = normalizeCompletionList(next.completions[h.id]);
    if (completionsForHabit.includes(dateKey)) continue;
    const weekDoneCount = isFlexibleHabit(h)
      ? weekDoneCountExcludingDate(completionsForHabit, dateKey)
      : undefined;
    if (!habitScheduledOnDate(h, dateKey, { weekDoneCount })) continue;
    const marked = markHabitDone(next, h.id, dateKey);
    if (marked === next) continue;
    next = marked;
    changed = true;
  }
  return changed ? next : state;
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
  for (const [k, v] of Object.entries(rawNotes)) {
    if (k.startsWith(prefix)) notes[k] = v;
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

export function applyMoveHabitInOrder(
  state: RoutineState,
  habitId: string,
  delta: number,
): RoutineState {
  const active = state.habits.filter((h) => !h.archived).map((h) => h.id);
  const order = reconcileHabitOrder(active, state.habitOrder || []);
  const i = order.indexOf(habitId);
  if (i < 0) return state;
  const j = i + delta;
  if (j < 0 || j >= order.length) return state;
  const copy = [...order];
  const a = copy[i];
  const b = copy[j];
  if (a !== undefined && b !== undefined) {
    copy[i] = b;
    copy[j] = a;
  }
  return { ...state, habitOrder: copy };
}

/** Повний порядок активних звичок (наприклад після drag-and-drop). */
export function applySetHabitOrder(
  state: RoutineState,
  orderedActiveIds: string[],
): RoutineState {
  const active = state.habits.filter((h) => !h.archived).map((h) => h.id);
  const order = reconcileHabitOrder(active, orderedActiveIds);
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
  const key = n.toLocaleLowerCase();
  // Reject rename, якщо інший тег вже носить таку назву — інакше у
  // списку зʼявляться два візуально однакових теги. Тег зберігає
  // власну назву (включно з оригінальним casing-ом) — це матчить
  // поведінку `applyUpdateHabit`, де `normalizeHabit` повертає той
  // самий `Habit` при no-op-патчі.
  const conflict = state.tags.some(
    (t) => t.id !== id && t.name.trim().toLocaleLowerCase() === key,
  );
  if (conflict) return state;
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
  // Дзеркало `applyUpdateTag`: відсіюємо conflict з іншою категорією за
  // case-insensitive trim-назвою. Patch без `name` (наприклад, тільки
  // emoji) обробляється як раніше — `nextName` лишається `null`.
  const nextName = patch.name !== undefined ? (patch.name || "").trim() : null;
  if (nextName) {
    const key = nextName.toLocaleLowerCase();
    const conflict = state.categories.some(
      (c) => c.id !== id && c.name.trim().toLocaleLowerCase() === key,
    );
    if (conflict) return state;
  }
  return {
    ...state,
    categories: state.categories.map((c) =>
      c.id === id
        ? {
            ...c,
            ...(patch.name !== undefined
              ? { name: (patch.name || "").trim() || c.name }
              : {}),
            ...(patch.emoji !== undefined && upgradeHabitGlyph(patch.emoji)
              ? { emoji: upgradeHabitGlyph(patch.emoji) }
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
