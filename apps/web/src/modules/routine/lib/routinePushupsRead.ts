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
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const str = d.toISOString().slice(0, 10);
    result.push({ date: str, total: data[str] ?? 0 });
  }
  return result;
}
