/**
 * Event-emitting обгортки над completion-редюсерами.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1.
 *
 * Чому ОКРЕМИЙ файл, а не зміна `applyToggleHabitCompletion` на місці:
 * стадія 1 зобовʼязана бути additive. Ці редюсери викликають
 * `apps/web/.../routineStorage.ts` і `apps/mobile/.../routineStore.ts`, і
 * зміна їхнього типу повернення (`RoutineState` → обʼєкт) зламала б обидва
 * write-path-и одночасно. Тут — надбудова: старі функції лишаються
 * джерелом істини для стану, а нові додають до них ЖУРНАЛ.
 *
 * Обидві функції ЧИСТІ. Момент часу, зсув таймзони, doctrine-якір і
 * `deviceId` приходять у `CompletionEventContext` — жодного `Date.now()`.
 *
 * Споживач у стадії 1 — write-path (`sqliteWriter`), який зараз будує
 * події з diff-у стану. Ці обгортки — друга, «доменна» точка входу для
 * стадій 2-3 (backfill / chat-екшени), де diff недоступний.
 */

import {
  applyMarkAllScheduledHabitsComplete,
  applyToggleHabitCompletion,
} from "./reducers.js";
import {
  createCompletionEvent,
  type CompletionEventContext,
} from "./completionEvents.js";
import { normalizeCompletionList } from "./storage.js";
import type { CompletionEvent, RoutineState } from "./types.js";

/** Новий стан + журнальні події, які його породили. */
export interface RoutineStateWithEvents {
  readonly state: RoutineState;
  readonly events: readonly CompletionEvent[];
}

function hasCompletion(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): boolean {
  return normalizeCompletionList(state.completions[habitId]).includes(dateKey);
}

/**
 * `applyToggleHabitCompletion` + подія `done` / `undone`.
 *
 * No-op-и старого редюсера (невідома звичка, незапланований день) не
 * породжують подій — журнал не має фіксувати те, чого не сталося.
 */
export function applyToggleHabitCompletionWithEvents(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  ctx: CompletionEventContext,
): RoutineStateWithEvents {
  const next = applyToggleHabitCompletion(state, habitId, dateKey);
  if (next === state) return { state, events: [] };

  const nowDone = hasCompletion(next, habitId, dateKey);
  return {
    state: next,
    events: [
      createCompletionEvent(habitId, dateKey, nowDone ? "done" : "undone", ctx),
    ],
  };
}

/**
 * `applyMarkAllScheduledHabitsComplete` + по одній події `done` на кожну
 * звичку, що САМЕ ЗАРАЗ отримала відмітку. Уже відмічені звички подій не
 * породжують (старий редюсер їх пропускає).
 *
 * Порядок подій — за `habitId` за зростанням, щоб батч був детермінованим
 * і snapshot-тести write-path-у не «пливли».
 */
export function applyMarkAllScheduledHabitsCompleteWithEvents(
  state: RoutineState,
  dateKey: string,
  ctx: CompletionEventContext,
): RoutineStateWithEvents {
  const next = applyMarkAllScheduledHabitsComplete(state, dateKey);
  if (next === state) return { state, events: [] };

  const events: CompletionEvent[] = [];
  for (const habitId of Object.keys(next.completions).sort()) {
    if (hasCompletion(state, habitId, dateKey)) continue;
    if (!hasCompletion(next, habitId, dateKey)) continue;
    events.push(createCompletionEvent(habitId, dateKey, "done", ctx));
  }
  return { state: next, events };
}
