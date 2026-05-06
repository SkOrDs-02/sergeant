/**
 * MMKV-backed monthly plan hook for the Fizruk mobile module.
 *
 * Mirrors the shape of `apps/web/src/modules/fizruk/hooks/useMonthlyPlan.ts`
 * (Phase 6 / PR-G) but on top of MMKV via `@/lib/storage`. Delegates
 * all normalization / reducer logic to `@sergeant/fizruk-domain` so
 * mobile and web share the exact same `MonthlyPlanState` semantics.
 *
 * Scope of this file (Phase 6 / PR-G — PlanCalendar):
 *  - Raw MMKV I/O for the shared `MONTHLY_PLAN_STORAGE_KEY`.
 *  - React hook returning the current state + a minimum set of action
 *    callbacks the PlanCalendar screen needs. Reminder-related
 *    mutations (enable / time) are plumbed through as well so follow-up
 *    settings UIs can reuse the hook without another refactor.
 */

import { useCallback, useEffect, useState } from "react";

import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";
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

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

/** Read and normalise the monthly plan state from MMKV. */
export function loadMonthlyPlanState(): MonthlyPlanState {
  const raw = safeReadLS<unknown>(MONTHLY_PLAN_STORAGE_KEY, null);
  return normalizeMonthlyPlanState(raw);
}

/** Persist the monthly plan state to MMKV. */
export function saveMonthlyPlanState(next: MonthlyPlanState): boolean {
  return safeWriteLS(MONTHLY_PLAN_STORAGE_KEY, next);
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
  /** Re-read state from MMKV (useful after external writes, e.g. backup apply). */
  refresh: () => void;
}

/**
 * React hook over MMKV that returns the current monthly plan state +
 * action callbacks. Subscribes to MMKV value-change events on
 * `MONTHLY_PLAN_STORAGE_KEY` so writes from other consumers in the
 * same app re-hydrate this hook's copy.
 */
export function useMonthlyPlan(): UseMonthlyPlanReturn {
  const [state, setState] = useState<MonthlyPlanState>(loadMonthlyPlanState);

  const refresh = useCallback(() => {
    setState(loadMonthlyPlanState());
  }, []);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === MONTHLY_PLAN_STORAGE_KEY) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
