/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Похідні читання стану сесії для списку вправ і шапки екрана вправи.
 * Чистий модуль без React — покритий `sessionLib.test.ts`.
 */
import type {
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import { pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { isSetDone } from "../workouts/WorkoutSetRow";

export type SessionItemState = "done" | "current" | "todo";

/** Скільки підходів у силовій вправі вже позначені зробленими. */
export function countDoneSets(it: WorkoutItem): number {
  if (it.type !== "strength") return 0;
  return (it.sets || []).filter(isSetDone).length;
}

/**
 * Вправа «зроблена», коли є хоч один підхід і всі вони зроблені (силова),
 * або коли записано час чи дистанцію (кардіо). Порожня силова вправа без
 * підходів — не зроблена: там ще нема чого рахувати.
 */
export function isItemDone(it: WorkoutItem): boolean {
  if (it.type === "strength") {
    const sets = it.sets || [];
    return sets.length > 0 && sets.every(isSetDone);
  }
  if (it.type === "time") return (it.durationSec ?? 0) > 0;
  return (it.distanceM ?? 0) > 0 || (it.durationSec ?? 0) > 0;
}

/**
 * Стан кожної вправи в порядку списку: перша незроблена — «поточна», решта
 * незроблених — «далі». Один прохід, без нового стану в домені.
 */
export function itemStates(items: WorkoutItem[]): SessionItemState[] {
  let currentFound = false;
  return items.map((it) => {
    if (isItemDone(it)) return "done";
    if (!currentFound) {
      currentFound = true;
      return "current";
    }
    return "todo";
  });
}

export interface SessionProgress {
  exercisesDone: number;
  exercisesTotal: number;
  setsDone: number;
}

/**
 * Підсумок сесії для рядка прогресу: скільки вправ закрито з усіх і скільки
 * підходів зроблено загалом. Підходи рахуються по всіх вправах, а не лише по
 * закритих, — рядок має рухатись із кожним ✓, а не стрибати наприкінці вправи.
 */
export function sessionProgress(w: Workout): SessionProgress {
  const items = w.items || [];
  return {
    exercisesDone: items.filter(isItemDone).length,
    exercisesTotal: items.length,
    setsDone: items.reduce((n, it) => n + countDoneSets(it), 0),
  };
}

/** `itemId → group` для швидкого пошуку членства в суперсеті/колі. */
export function groupByItemId(
  groups: WorkoutGroup[] | null | undefined,
): Map<string, WorkoutGroup> {
  const m = new Map<string, WorkoutGroup>();
  for (const g of groups || []) {
    for (const id of g.itemIds || []) m.set(id, g);
  }
  return m;
}

/** 1-based позиція item-а всередині своєї групи, або `null` поза групою. */
export function groupMemberPosition(
  it: WorkoutItem,
  group: WorkoutGroup | null | undefined,
): number | null {
  if (!group) return null;
  const idx = (group.itemIds || []).indexOf(it.id);
  return idx === -1 ? null : idx + 1;
}

/** Сусіди для стрілок «‹ попередня · наступна ›» на екрані вправи. */
export function neighbourItems(
  items: WorkoutItem[],
  itemId: string,
): { prev: WorkoutItem | null; next: WorkoutItem | null } {
  const idx = items.findIndex((x) => x.id === itemId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? (items[idx - 1] ?? null) : null,
    next: idx < items.length - 1 ? (items[idx + 1] ?? null) : null,
  };
}

/**
 * «0 з 1 підходу» / «3 з 3 підходів». Тут РОДОВИЙ відмінок, не називний:
 * після «X з Y» українська вимагає «підходу/підходів», тож звичайна
 * плюралізація (`pluralUa` → «підходи») дала б «3 з 3 підходи».
 */
export function setsProgressLabel(done: number, total: number): string {
  const ss = messages.fizruk.session;
  const word = total === 1 ? ss.setsGenitiveOne : ss.setsGenitiveMany;
  return `${done} ${ss.of} ${total} ${word}`;
}

/** «3 підходи» — для рядка прогресу сесії. */
export function setsCountLabel(n: number): string {
  const ss = messages.fizruk.session;
  return `${n} ${pluralUa(n, { one: ss.setsOne, few: ss.setsFew, many: ss.setsMany })}`;
}

/**
 * Слово «вправи/вправ» для рядка «X з Y вправ». Окремо від
 * `setsProgressLabel`, бо число тут виділене жирним у розмітці, тож
 * склеювати весь рядок не можна — потрібне саме слово.
 */
export function exercisesGenitiveWord(total: number): string {
  const ss = messages.fizruk.session;
  return total === 1 ? ss.exercisesGenitiveOne : ss.exercisesGenitiveMany;
}
