import { useCallback, useEffect, useMemo, useState } from "react";

import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function saveState(s: MonthlyPlanState): void {
  safeWriteLS(STORAGE_KEY, s);
  window.dispatchEvent(new CustomEvent("fizruk-storage-monthly-plan"));
}

export function useMonthlyPlan() {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    const sync = () => setState(loadState());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("fizruk-storage-monthly-plan", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("fizruk-storage-monthly-plan", sync);
    };
  }, []);

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
