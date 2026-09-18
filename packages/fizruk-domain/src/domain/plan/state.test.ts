import { describe, expect, it } from "vitest";

import {
  defaultMonthlyPlanState,
  normalizeMonthlyPlanState,
  serializeMonthlyPlanState,
} from "./state.js";

describe("defaultMonthlyPlanState", () => {
  it("enables reminders at 18:00 with no assigned days", () => {
    expect(defaultMonthlyPlanState()).toEqual({
      reminderEnabled: true,
      reminderHour: 18,
      reminderMinute: 0,
      days: {},
    });
  });

  it("returns a fresh object on each call (no shared mutation)", () => {
    const a = defaultMonthlyPlanState();
    const b = defaultMonthlyPlanState();
    expect(a).not.toBe(b);
    expect(a.days).not.toBe(b.days);
  });
});

describe("normalizeMonthlyPlanState", () => {
  it("returns defaults for null/undefined/garbage", () => {
    expect(normalizeMonthlyPlanState(null)).toEqual(defaultMonthlyPlanState());
    expect(normalizeMonthlyPlanState(undefined)).toEqual(
      defaultMonthlyPlanState(),
    );
    expect(normalizeMonthlyPlanState("oops")).toEqual(
      defaultMonthlyPlanState(),
    );
    expect(normalizeMonthlyPlanState(42)).toEqual(defaultMonthlyPlanState());
  });

  it("clamps out-of-range reminderHour / reminderMinute", () => {
    const s = normalizeMonthlyPlanState({
      reminderHour: 99,
      reminderMinute: -5,
    });
    expect(s.reminderHour).toBe(23);
    expect(s.reminderMinute).toBe(0);
  });

  it("coerces reminderEnabled to a boolean (default true)", () => {
    expect(normalizeMonthlyPlanState({}).reminderEnabled).toBe(true);
    expect(
      normalizeMonthlyPlanState({ reminderEnabled: false }).reminderEnabled,
    ).toBe(false);
  });

  it("keeps well-formed day entries, drops malformed ones", () => {
    const s = normalizeMonthlyPlanState({
      days: {
        "2025-03-03": { templateId: "tpl_a" },
        "2025-03-04": { templateId: "" }, // empty id → drop
        "2025-03-05": { templateId: 42 }, // wrong type → drop
        "2025-03-06": null, // not an object → drop
        "2025-03-07": { templateId: "tpl_b" },
      },
    });
    expect(s.days).toEqual({
      "2025-03-03": { templateId: "tpl_a" },
      "2025-03-07": { templateId: "tpl_b" },
    });
  });

  it("is idempotent", () => {
    const payload = {
      reminderEnabled: true,
      reminderHour: 7,
      reminderMinute: 30,
      days: { "2025-03-03": { templateId: "tpl_a" } },
    };
    const once = normalizeMonthlyPlanState(payload);
    expect(normalizeMonthlyPlanState(once)).toEqual(once);
  });
});

describe("serializeMonthlyPlanState", () => {
  it("round-trips via JSON", () => {
    const s = {
      reminderEnabled: false,
      reminderHour: 7,
      reminderMinute: 15,
      days: { "2025-03-03": { templateId: "tpl_a" } },
    };
    const raw = serializeMonthlyPlanState(s);
    expect(normalizeMonthlyPlanState(JSON.parse(raw))).toEqual(s);
  });
});
