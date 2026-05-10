/**
 * `useMonthlyPlan` — mobile hook for the Fizruk monthly plan
 * (singleton document with reminder + per-day template assignments).
 *
 * Stage 12 / PR #057f-tombstone-mobile-stage12 of
 * `docs/planning/storage-roadmap.md` (mobile parity for Stage 8
 * `#057f-tombstone` extended to the new Stage 12 monthly-plan slot).
 * Reads from the SQLite warm cache (`getCachedFizrukSqliteState`)
 * and persists exclusively through the dual-write pipeline
 * (`triggerFizrukDualWrite`). The legacy MMKV slot
 * `MONTHLY_PLAN_STORAGE_KEY` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * Pre-boot / pre-auth (cache cold) the hook starts on
 * `defaultMonthlyPlanState()` and overlays once
 * `useFizrukSqliteReadTick` fires.
 */

import { useCallback, useEffect, useState } from "react";

import {
  applySetDayTemplate,
  applySetReminder,
  applySetReminderEnabled,
  defaultMonthlyPlanState,
  getTemplateForDate,
  getTodayTemplateId,
  normalizeMonthlyPlanState,
  todayDateKey,
  type MonthlyPlanDay,
  type MonthlyPlanState,
} from "@sergeant/fizruk-domain/domain/plan/index";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMonthlyPlanSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import {
  getCachedFizrukSqliteState,
  type CachedMonthlyPlanState,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

/**
 * Project the cached monthly-plan singleton onto the
 * `MonthlyPlanState` shape consumers expect. `null` (= "no row yet")
 * collapses onto `defaultMonthlyPlanState()`.
 */
function projectFromCache(
  row: CachedMonthlyPlanState | null,
): MonthlyPlanState {
  if (row === null) return defaultMonthlyPlanState();
  // Round-trip through `normalizeMonthlyPlanState` so any drift
  // between cache shape and domain shape is healed centrally.
  return normalizeMonthlyPlanState(row);
}

/** Read the initial state from the warm cache, or the default if cold. */
export function loadMonthlyPlanState(): MonthlyPlanState {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return defaultMonthlyPlanState();
  return projectFromCache(cache.monthlyPlan);
}

/**
 * Persist the monthly plan state via the dual-write pipeline only.
 *
 * Stage 12 / PR #057f-tombstone-mobile-stage12 — no MMKV write.
 * Fire-and-forget: the trigger is a no-op when no dual-write context
 * is registered (pre-auth) so the in-memory hook state stays the
 * source of truth until boot wires the SQLite client.
 */
export function saveMonthlyPlanState(next: MonthlyPlanState): boolean {
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const nextDualWrite = {
    ...prevDualWrite,
    monthlyPlan: extractMonthlyPlanSnapshot(next),
  };
  try {
    triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
  return true;
}

export interface UseMonthlyPlanReturn {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, MonthlyPlanDay>;
  /** Full normalised state — handy for passing into pure selectors. */
  state: MonthlyPlanState;
  /** Template id assigned to `dateKey`, or `null`. */
  getTemplateForDate: (dateKey: string) => string | null;
  /** Template id assigned to today, or `null`. */
  todayTemplateId: string | null;
  /** Local-date key for "today". */
  getTodayDateKey: () => string;
  /**
   * Assign (or clear, when `templateId` is null/empty) the template
   * for a given `dateKey`. No-ops when the value is already set.
   */
  setDayTemplate: (
    dateKey: string,
    templateId: string | null | undefined,
  ) => void;
  /** Update the reminder time (hour/minute). Clamped by the reducer. */
  setReminder: (hour: number, minute: number) => void;
  /** Toggle the daily plan reminder. */
  setReminderEnabled: (enabled: boolean) => void;
  /** Re-read state from the SQLite cache (useful after external writes). */
  refresh: () => void;
}

/**
 * React hook over the SQLite cache that returns the current monthly
 * plan state + action callbacks. Subscribes to the cache refresh
 * tick so external writes (incoming sync, residual-import) re-render
 * this hook's copy.
 */
export function useMonthlyPlan(): UseMonthlyPlanReturn {
  const [state, setState] = useState<MonthlyPlanState>(loadMonthlyPlanState);

  const refresh = useCallback(() => {
    setState(loadMonthlyPlanState());
  }, []);

  // Stage 12 / PR #057f-tombstone-mobile-stage12: overlay monthly-plan
  // from the SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setState(projectFromCache(cache.monthlyPlan));
  }, [sqliteCacheTick]);

  const setDayTemplate = useCallback<UseMonthlyPlanReturn["setDayTemplate"]>(
    (dateKey, templateId) => {
      setState((prev) => {
        const next = applySetDayTemplate(prev, dateKey, templateId);
        if (next === prev) return prev;
        saveMonthlyPlanState(next);
        return next;
      });
    },
    [],
  );

  const setReminder = useCallback<UseMonthlyPlanReturn["setReminder"]>(
    (hour, minute) => {
      setState((prev) => {
        const next = applySetReminder(prev, hour, minute);
        if (next === prev) return prev;
        saveMonthlyPlanState(next);
        return next;
      });
    },
    [],
  );

  const setReminderEnabled = useCallback<
    UseMonthlyPlanReturn["setReminderEnabled"]
  >((enabled) => {
    setState((prev) => {
      const next = applySetReminderEnabled(prev, enabled);
      if (next === prev) return prev;
      saveMonthlyPlanState(next);
      return next;
    });
  }, []);

  const getTemplateForDateFn = useCallback(
    (dateKey: string) => getTemplateForDate(state, dateKey),
    [state],
  );

  return {
    reminderEnabled: state.reminderEnabled,
    reminderHour: state.reminderHour,
    reminderMinute: state.reminderMinute,
    days: state.days,
    state,
    getTemplateForDate: getTemplateForDateFn,
    todayTemplateId: getTodayTemplateId(state),
    getTodayDateKey: todayDateKey,
    setDayTemplate,
    setReminder,
    setReminderEnabled,
    refresh,
  };
}

/** Re-export the default factory for callers/tests that want a seed. */
export { defaultMonthlyPlanState };
