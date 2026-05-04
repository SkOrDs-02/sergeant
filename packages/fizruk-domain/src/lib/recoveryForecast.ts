import { computeRecoveryBy, isFullyRecovered } from "./recoveryCompute";
import type { Workout } from "../domain/types";

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 21;

function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Для кожного м'яза з навантаженням — перша дата (YYYY-MM-DD локальний день), коли статус стане «повністю відновлений» (green).
 * Якщо вже green зараз — сьогодні; якщо за MAX_DAYS не досягнуто — null.
 */
export function forecastFullRecoveryByDate(
  workouts: Array<Partial<Workout>>,
  musclesUk: Record<string, string>,
  nowMs: number = Date.now(),
): Record<string, string | null> {
  const out: Record<string, string | null> = {};

  const byNow = computeRecoveryBy(workouts, musclesUk, nowMs);
  // Під strict-index `byNow[id]` дає `T | undefined`; зберігаємо
  // [id, row] парами одразу, щоб не повторювати lookup.
  const entries = Object.entries(byNow).filter(
    ([, row]) => row?.lastAt != null,
  );

  for (const [id, row] of entries) {
    if (isFullyRecovered(row)) {
      out[id] = localDateKey(nowMs);
      continue;
    }
    let found: string | null = null;
    for (let d = 1; d <= MAX_DAYS; d++) {
      const future = nowMs + d * DAY;
      const by = computeRecoveryBy(workouts, musclesUk, future);
      const row = by[id];
      if (row && isFullyRecovered(row)) {
        found = localDateKey(future);
        break;
      }
    }
    out[id] = found;
  }

  return out;
}
