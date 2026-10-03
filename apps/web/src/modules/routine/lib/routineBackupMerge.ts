/**
 * Режим «лише додати відсутнє» для відновлення Рутини з файлу.
 *
 * AI-CONTEXT: відновлення Рутини пише повний стан через `saveRoutineState`, а
 * dual-write шле на сервер КОЖНУ різницю «було → стало», зокрема видалення
 * звичок і відміток, яких немає у файлі (аудит 2026-10-01, data-06). Тому
 * режим `merge` будує стан-надмножину: усе поточне + те, чого ще немає. Різниці
 * на видалення в такому стані не існує, отже tombstone-и на сервер не їдуть.
 */
import type { Category, RoutineState, Tag } from "@sergeant/routine-domain";
import { addMissingBy } from "@shared/lib/backup/restoreMode";

const byId = (e: Tag | Category | { id: string }) => e.id;
const identity = (v: string) => v;

function mergeCompletions(
  current: Record<string, string[]>,
  incoming: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = { ...current };
  for (const [habitId, days] of Object.entries(incoming)) {
    const merged = addMissingBy(out[habitId] ?? [], days, identity);
    out[habitId] = merged.slice().sort();
  }
  return out;
}

function mergeSkips(
  current: NonNullable<RoutineState["skips"]>,
  incoming: NonNullable<RoutineState["skips"]>,
): NonNullable<RoutineState["skips"]> {
  const out: NonNullable<RoutineState["skips"]> = { ...current };
  for (const [habitId, byDay] of Object.entries(incoming)) {
    out[habitId] = { ...byDay, ...(out[habitId] ?? {}) };
  }
  return out;
}

/** Поточний стан + додане з файлу. Налаштування та схема лишаються поточними. */
export function mergeRoutineStateAddMissing(
  current: RoutineState,
  incoming: RoutineState,
): RoutineState {
  return {
    ...current,
    tags: addMissingBy(current.tags, incoming.tags, byId),
    categories: addMissingBy(current.categories, incoming.categories, byId),
    habits: addMissingBy(current.habits, incoming.habits, byId),
    habitOrder: addMissingBy(current.habitOrder, incoming.habitOrder, identity),
    completions: mergeCompletions(current.completions, incoming.completions),
    skips: mergeSkips(current.skips ?? {}, incoming.skips ?? {}),
    completionNotes: {
      ...incoming.completionNotes,
      ...current.completionNotes,
    },
  };
}
