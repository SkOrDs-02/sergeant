/**
 * Overlay tests for `useMonthlyPlan` (Stage 12 / PR
 * #057f-tombstone-mobile-stage12 — mobile).
 *
 * Verifies the SQLite cache → hook overlay path for the monthly-plan
 * singleton document. Pre-boot the hook starts with the default plan;
 * once the cache is warm + a refresh tick fires, the hook surfaces
 * the cached singleton. Mutations (`setDayTemplate`,
 * `setReminderEnabled`, `setReminder`) update in-memory state but
 * never write to MMKV.
 */
import { act, renderHook } from "@testing-library/react-native";

import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";

import { _getMMKVInstance } from "@/lib/storage";

import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../lib/sqliteReadGate";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../lib/sqliteReader";
import { useMonthlyPlan } from "../useMonthlyPlan";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useMonthlyPlan — SQLite read overlay (Stage 12)", () => {
  it("starts with the default plan when the cache is cold", () => {
    const { result } = renderHook(() => useMonthlyPlan());

    // Domain default has `reminderEnabled: true` — see
    // `defaultMonthlyPlanState` in `@sergeant/fizruk-domain`.
    expect(result.current.reminderEnabled).toBe(true);
    expect(result.current.days).toEqual({});
    expect(result.current.todayTemplateId).toBeNull();
  });

  it("overlays the singleton document from the warm cache", () => {
    __setFizrukSqliteCacheForTests({
      monthlyPlan: {
        reminderEnabled: true,
        reminderHour: 18,
        reminderMinute: 30,
        days: { "2026-05-15": { templateId: "tpl-x" } },
      },
    });

    const { result } = renderHook(() => useMonthlyPlan());

    expect(result.current.reminderEnabled).toBe(true);
    expect(result.current.reminderHour).toBe(18);
    expect(result.current.reminderMinute).toBe(30);
    expect(result.current.getTemplateForDate("2026-05-15")).toBe("tpl-x");
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      monthlyPlan: {
        reminderEnabled: false,
        reminderHour: 9,
        reminderMinute: 0,
        days: {},
      },
    });

    const { result } = renderHook(() => useMonthlyPlan());
    expect(result.current.reminderEnabled).toBe(false);

    __setFizrukSqliteCacheForTests({
      monthlyPlan: {
        reminderEnabled: true,
        reminderHour: 7,
        reminderMinute: 15,
        days: {},
      },
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.reminderEnabled).toBe(true);
    expect(result.current.reminderHour).toBe(7);
    expect(result.current.reminderMinute).toBe(15);
  });

  it("setDayTemplate updates in-memory state and never writes to MMKV", () => {
    const { result } = renderHook(() => useMonthlyPlan());

    act(() => {
      result.current.setDayTemplate("2026-05-15", "tpl-x");
    });

    expect(result.current.getTemplateForDate("2026-05-15")).toBe("tpl-x");
    expect(_getMMKVInstance().contains(MONTHLY_PLAN_STORAGE_KEY)).toBe(false);
  });

  it("setReminderEnabled / setReminder update in-memory state without MMKV writes", () => {
    const { result } = renderHook(() => useMonthlyPlan());

    act(() => {
      result.current.setReminderEnabled(true);
    });
    expect(result.current.reminderEnabled).toBe(true);

    act(() => {
      result.current.setReminder(20, 45);
    });
    expect(result.current.reminderHour).toBe(20);
    expect(result.current.reminderMinute).toBe(45);

    expect(_getMMKVInstance().contains(MONTHLY_PLAN_STORAGE_KEY)).toBe(false);
  });
});
