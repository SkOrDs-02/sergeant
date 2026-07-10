import { useCallback, useEffect, useMemo, useState } from "react";

import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain";
import { safeReadLS } from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMonthlyPlanSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

const STORAGE_KEY = MONTHLY_PLAN_STORAGE_KEY;

interface DayEntry {
  templateId: string;
}

interface MonthlyPlanState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, DayEntry>;
}

function todayKey() {
  // Kyiv-anchored day key so the plan's "today" doesn't drift for users whose
  // host clock is outside Europe/Kyiv (domain invariant: day boundaries in Kyiv).
  return getKyivDayKey();
}

const DEFAULT_STATE: MonthlyPlanState = {
  reminderEnabled: true,
  reminderHour: 18,
  reminderMinute: 0,
  days: {},
};

function loadState(): MonthlyPlanState {
  const p = safeReadLS<Partial<MonthlyPlanState>>(STORAGE_KEY);
  if (!p) return DEFAULT_STATE;
  return {
    reminderEnabled: p.reminderEnabled !== false,
    reminderHour: Number.isFinite(p.reminderHour) ? (p.reminderHour ?? 18) : 18,
    reminderMinute: Number.isFinite(p.reminderMinute)
      ? (p.reminderMinute ?? 0)
      : 0,
    days: typeof p.days === "object" && p.days ? p.days : {},
  };
}

/**
 * Cache-first initial state: prefer the SQLite cache (warm on repeat
 * boots) over the LS blob. Teardown Phase 3 removed the LS write-mirror;
 * `loadState()` remains only as a pre-warm fallback reading whatever
 * `residualImport.ts` drained on boot (empty once drained).
 */
function loadInitialState(): MonthlyPlanState {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt !== null && cache.monthlyPlan) return cache.monthlyPlan;
  return loadState();
}

function saveState(s: MonthlyPlanState): void {
  // Teardown Phase 3 — SQLite-only write via the dual-write pipeline; the
  // LS mirror was removed. Fire-and-forget; the trigger is a no-op when no
  // dual-write context is registered.
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const nextDualWrite = {
    ...prevDualWrite,
    monthlyPlan: extractMonthlyPlanSnapshot(s),
  };
  try {
    triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
}

export function useMonthlyPlan() {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [state, setState] = useState(loadInitialState);

  // Overlay the singleton plan from the SQLite cache once it's warm.
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    if (cache.monthlyPlan) setState(cache.monthlyPlan);
  }, [sqliteCacheTick]);

  const setReminder = useCallback((hour: number, minute: number) => {
    setState((prev) => {
      const next = {
        ...prev,
        reminderHour: Math.max(0, Math.min(23, hour)),
        reminderMinute: Math.max(0, Math.min(59, minute)),
      };
      saveState(next);
      return next;
    });
  }, []);

  const setReminderEnabled = useCallback((enabled: boolean) => {
    setState((prev) => {
      const next = { ...prev, reminderEnabled: !!enabled };
      saveState(next);
      return next;
    });
  }, []);

  const setDayTemplate = useCallback(
    (dateKey: string, templateId: string | null) => {
      setState((prev) => {
        const days = { ...prev.days };
        if (templateId == null || templateId === "") {
          delete days[dateKey];
        } else {
          days[dateKey] = { templateId };
        }
        const next = { ...prev, days };
        saveState(next);
        return next;
      });
    },
    [],
  );

  const getTemplateForDate = useCallback(
    (dateKey: string) => state.days[dateKey]?.templateId ?? null,
    [state.days],
  );

  const todayTemplateId = useMemo(
    () => state.days[todayKey()]?.templateId ?? null,
    [state.days],
  );

  return {
    reminderEnabled: state.reminderEnabled,
    reminderHour: state.reminderHour,
    reminderMinute: state.reminderMinute,
    days: state.days,
    setReminder,
    setReminderEnabled,
    setDayTemplate,
    getTemplateForDate,
    todayTemplateId,
    getTodayDateKey: todayKey,
  };
}
