/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Емітер джерела «будь-яка записана витрата» для автовідмітки звички в
 * Рутині (рішення founder-а 2026-11-18). Слухач:
 * `modules/routine/hooks/useRoutineAutoMark.ts`, канал `routineAutoMark`.
 *
 * AI-CONTEXT: «записана витрата» — це витрата, яку людина записала сама на
 * цьому пристрої (форма, чек зі скану, чат-інструмент), а не операція з
 * банку, імпорту, Сільпо, синку чи undo. Тому `addManualExpense` шле подію
 * лише з явною позначкою `userAction`, а не за замовчуванням: новий шлях
 * запису, що забув позначку, мовчить, а не відмічає звичку чужими даними.
 */
import { deviceDayKey } from "@sergeant/shared";
import { emitHubBus } from "@shared/lib/modules/hubBus";

/**
 * День витрати за годинником пристрою (ADR-0078). `YYYY-MM-DD` уже є
 * день-ключем і береться як є: `new Date("2026-11-18")` це UTC-північ, і на
 * пристрої західніше Гринвіча вона дала б учорашній день.
 */
export function expenseDeviceDayKey(date: string | Date): string | null {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? null : deviceDayKey(d);
}

/** Сигнал Рутині; не-сьогоднішній день слухач відкидає сам. */
export function emitFinykExpenseRoutineAutoMark(date: string | Date): void {
  const dayKey = expenseDeviceDayKey(date);
  if (!dayKey) return;
  emitHubBus("routineAutoMark", { source: "finyk_expense", dayKey });
}
