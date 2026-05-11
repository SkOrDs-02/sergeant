import { addDays, dateKeyFromDate } from "@sergeant/routine-domain";
import { loadRoutineState } from "./routineStorage";

/** Для сторінки Прогрес Фізрука — історія відтискань з даних Рутини */
export function buildPushupHistoryFromRoutine(days = 30) {
  const state = loadRoutineState();
  const data =
    state.pushupsByDate && typeof state.pushupsByDate === "object"
      ? state.pushupsByDate
      : {};
  const result: Array<{ date: string; total: number }> = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const str = dateKeyFromDate(addDays(now, -i));
    result.push({ date: str, total: data[str] ?? 0 });
  }
  return result;
}
