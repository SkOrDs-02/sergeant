/**
 * Автовідмітка звички з події іншого модуля: правила без джерел.
 *
 * AI-CONTEXT: OD-29, Р-1 (в). Рішення власника 2026-11-18:
 *
 * - П-14 (А): автовідмітка лише за СЬОГОДНІ (день пристрою, ADR-0078).
 *   Подія з учорашнім ключем нічого не ставить, тож серії минулих днів
 *   ретроактивно не змінюються.
 * - П-13 (А): автовідмітку можна зняти, і того дня вона сама не
 *   повертається. Правило «зняв сьогодні → до кінця доби автовідмітки
 *   немає» не потребує памʼяті про те, ХТО поставив відмітку: людина, що
 *   сьогодні зняла відмітку звички, сказала «сьогодні ні», і подія іншого
 *   модуля цього не перекриває.
 *
 * Явний стан людини перекриває подію ще в одному місці: заявлений сьогодні
 * «не зміг» (канон §5) автовідмітка не знімає (інженерний дефолт за духом
 * П-13; винесено у спеку як відкрите питання).
 *
 * AI-DANGER: які саме події яких модулів ставлять відмітку і як людина
 * привʼязує звичку до джерела, не визначено ні в § 11.4 Р-1 (в) розбору
 * teardown, ні у відповідях власника, тож джерел тут немає: викликач сам
 * вирішує, що подія стосується звички. Памʼять «знято сьогодні» теж не
 * персиститься (питання до власника у спеці). Не підключай у продукт, доки
 * обидва питання не закриті.
 */

import {
  applyToggleHabitCompletion,
  type CompletionDayBounds,
} from "./reducers.js";
import type { RoutineState } from "./types.js";

export interface AutoMarkContext extends CompletionDayBounds {
  /**
   * Чи людина сьогодні вже знімала відмітку цієї звички
   * (`shouldSuppressAutoMark` повернув `true` для цього дня).
   */
  suppressedToday: boolean;
}

/**
 * Поставити автовідмітку звичці за день події. Повертає той самий `state`,
 * коли правила не дозволяють: день події не сьогодні, автовідмітку сьогодні
 * знято, день уже відмічено, заявлено «не зміг», або звичка сьогодні не
 * запланована (останнє вирішує `applyToggleHabitCompletion`, як для тапу).
 */
export function applyAutoMarkHabit(
  state: RoutineState,
  habitId: string,
  eventDateKey: string,
  ctx: AutoMarkContext,
): RoutineState {
  if (eventDateKey !== ctx.todayKey) return state;
  if (ctx.suppressedToday) return state;
  if ((state.completions[habitId] ?? []).includes(eventDateKey)) return state;
  if (state.skips?.[habitId]?.[eventDateKey]) return state;
  return applyToggleHabitCompletion(state, habitId, eventDateKey, {
    todayKey: ctx.todayKey,
  });
}

/**
 * Чи дія людини має заглушити автовідмітку цієї звички до кінця доби:
 * відмітку за сьогодні знято (була, стала відсутня).
 */
export function shouldSuppressAutoMark(
  prev: RoutineState,
  next: RoutineState,
  habitId: string,
  dateKey: string,
  todayKey: string,
): boolean {
  if (dateKey !== todayKey) return false;
  const wasDone = (prev.completions[habitId] ?? []).includes(dateKey);
  const isDone = (next.completions[habitId] ?? []).includes(dateKey);
  return wasDone && !isDone;
}
