import { describe, expect, it } from "vitest";

import {
  applySetDayTemplate,
  applySetReminder,
  applySetReminderEnabled,
} from "./reducers.js";
import { defaultMonthlyPlanState } from "./state.js";

describe("applySetDayTemplate", () => {
  it("assigns a new template for a previously empty date", () => {
    const base = defaultMonthlyPlanState();
    const next = applySetDayTemplate(base, "2025-03-15", "tpl_a");
    expect(next).not.toBe(base);
    expect(next.days["2025-03-15"]).toEqual({ templateId: "tpl_a" });
  });

  it("replaces the template for an existing date", () => {
    const base = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    const next = applySetDayTemplate(base, "2025-03-15", "tpl_b");
    expect(next.days["2025-03-15"]).toEqual({ templateId: "tpl_b" });
  });

  it("clears the entry for null / empty templateId", () => {
    const base = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    const cleared = applySetDayTemplate(base, "2025-03-15", null);
    expect(cleared.days["2025-03-15"]).toBeUndefined();
    const cleared2 = applySetDayTemplate(base, "2025-03-15", "");
    expect(cleared2.days["2025-03-15"]).toBeUndefined();
  });

  it("is a no-op (same reference) when assigning the same templateId", () => {
    const base = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    const same = applySetDayTemplate(base, "2025-03-15", "tpl_a");
    expect(same).toBe(base);
  });

  it("is a no-op (same reference) when clearing an already-empty date", () => {
    const base = defaultMonthlyPlanState();
    const same = applySetDayTemplate(base, "2025-03-15", null);
    expect(same).toBe(base);
  });

  it("leaves unrelated dates untouched", () => {
    const base = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    const next = applySetDayTemplate(base, "2025-03-16", "tpl_b");
    expect(next.days["2025-03-15"]).toEqual({ templateId: "tpl_a" });
    expect(next.days["2025-03-16"]).toEqual({ templateId: "tpl_b" });
  });
});

describe("applySetReminder", () => {
  it("clamps hour to [0,23] and minute to [0,59]", () => {
    const next = applySetReminder(defaultMonthlyPlanState(), 99, -5);
    expect(next.reminderHour).toBe(23);
    expect(next.reminderMinute).toBe(0);
  });

  it("returns the same reference for a no-op update", () => {
    const base = defaultMonthlyPlanState();
    const same = applySetReminder(base, base.reminderHour, base.reminderMinute);
    expect(same).toBe(base);
  });

  it("truncates fractional inputs", () => {
    const next = applySetReminder(defaultMonthlyPlanState(), 7.9, 30.4);
    expect(next.reminderHour).toBe(7);
    expect(next.reminderMinute).toBe(30);
  });
});

describe("applySetReminderEnabled", () => {
  it("toggles the reminder", () => {
    const base = defaultMonthlyPlanState();
    expect(base.reminderEnabled).toBe(true);
    const off = applySetReminderEnabled(base, false);
    expect(off.reminderEnabled).toBe(false);
    const on = applySetReminderEnabled(off, true);
    expect(on.reminderEnabled).toBe(true);
  });

  it("is a no-op for unchanged truthy values", () => {
    const base = defaultMonthlyPlanState();
    const same = applySetReminderEnabled(base, true);
    expect(same).toBe(base);
  });
});
