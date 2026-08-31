import { useCallback, useMemo } from "react";
import { addDays, dateKeyFromDate } from "@sergeant/routine-domain";

import { peekFizrukDualWriteState } from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";
import { triggerFizrukDualWrite } from "../lib/sqliteWriter";

/**
 * Pushup activity — fizruk-власні дані з `fizruk_pushups`.
 *
 * Перенос власності routine → fizruk (канон `routine.md` §10, рішення
 * founder-а 2026-08-30): раніше хук читав `RoutineState.pushupsByDate`
 * крізь модульний шов (`routine/lib/routinePushupsRead`), тепер джерело —
 * fizruk SQLite-кеш, а write-шлях (`logReps`) живе тут же і їде тим самим
 * dual-write → sync-v2 конвеєром, що й решта fizruk-даних. Історія
 * приїжджає з сервера (міграція 131 скопіювала `routine_pushups`).
 *
 * Returns:
 *   history   - array of { date: "YYYY-MM-DD", total: number } for last `days`
 *   stats     - { todayCount, week, month } aggregated counts
 *   hasData   - true if any pushups have been logged
 *   logReps   - add reps to TODAY (device-local day key, ADR-0078);
 *               no-op until the dual-write context is registered (pre-auth)
 */
export function usePushupActivity(days = 30) {
  const tick = useFizrukSqliteReadTick();

  const history = useMemo(() => {
    void tick;
    const data = getCachedFizrukSqliteState().pushupsByDate ?? {};
    const result: Array<{ date: string; total: number }> = [];
    // eslint-disable-next-line no-restricted-syntax -- день-ключ віджимань навмисно device-local (ADR-0078), не Kyiv
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const str = dateKeyFromDate(addDays(now, -i));
      result.push({ date: str, total: data[str] ?? 0 });
    }
    return result;
  }, [tick, days]);

  const stats = useMemo(() => {
    // eslint-disable-next-line no-restricted-syntax -- день-ключ віджимань навмисно device-local (ADR-0078), не Kyiv
    const now = new Date();
    const today = dateKeyFromDate(now);
    const weekAgo = dateKeyFromDate(addDays(now, -7));
    const monthAgo = dateKeyFromDate(addDays(now, -30));
    const todayCount = history.find((d) => d.date === today)?.total ?? 0;
    const week = history
      .filter((d) => d.date >= weekAgo)
      .reduce((s, d) => s + d.total, 0);
    const month = history
      .filter((d) => d.date >= monthAgo)
      .reduce((s, d) => s + d.total, 0);
    return { todayCount, week, month };
  }, [history]);

  const hasData = stats.todayCount > 0 || stats.week > 0 || stats.month > 0;

  const logReps = useCallback((reps: number): boolean => {
    const n = Math.floor(Number(reps));
    if (!Number.isFinite(n) || n <= 0) return false;
    const prev = peekFizrukDualWriteState();
    if (!prev) return false;
    // eslint-disable-next-line no-restricted-syntax -- день-ключ віджимань навмисно device-local (ADR-0078), не Kyiv
    const today = dateKeyFromDate(new Date());
    const cur = prev.pushups?.[today] ?? 0;
    triggerFizrukDualWrite(prev, {
      ...prev,
      pushups: { ...(prev.pushups ?? {}), [today]: cur + n },
    });
    return true;
  }, []);

  return { history, stats, hasData, logReps };
}
