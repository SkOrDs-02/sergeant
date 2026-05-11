import { useEffect, useMemo, useState } from "react";
import { addDays, dateKeyFromDate } from "@sergeant/routine-domain";
import { ROUTINE_EVENT } from "../../routine/lib/routineStorage";
import { buildPushupHistoryFromRoutine } from "../../routine/lib/routinePushupsRead";

/**
 * Fizruk-side adapter for pushup activity sourced from the Routine module.
 * Abstracts the cross-module dependency so page components stay decoupled
 * from Routine internals.
 *
 * Returns:
 *   history   - array of { date: "YYYY-MM-DD", total: number } for last 30 days
 *   stats     - { todayCount, week, month } aggregated counts
 *   hasData   - true if any pushups have been logged
 */
export function usePushupActivity(days = 30) {
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    const sync = () => setSyncKey((n) => n + 1);
    window.addEventListener(ROUTINE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ROUTINE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const history = useMemo(() => {
    void syncKey;
    return buildPushupHistoryFromRoutine(days);
  }, [syncKey, days]);

  const stats = useMemo(() => {
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

  return { history, stats, hasData };
}
