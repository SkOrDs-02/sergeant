import { describe, expect, it } from "vitest";

import {
  aggregatePlannedByDate,
  countPlannedDaysInMonth,
  countPlannedTemplatesInMonth,
  getTemplateForDate,
  getTodayTemplateId,
  monthIsEmpty,
} from "./selectors.js";
import { applySetDayTemplate } from "./reducers.js";
import { defaultMonthlyPlanState } from "./state.js";
import type { PlannedWorkoutLike } from "./types.js";

describe("getTemplateForDate", () => {
  it("returns the templateId for assigned dates, null otherwise", () => {
    const state = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    expect(getTemplateForDate(state, "2025-03-15")).toBe("tpl_a");
    expect(getTemplateForDate(state, "2025-03-16")).toBeNull();
  });
});

describe("getTodayTemplateId", () => {
  it("uses the injected `now` to look up today's template", () => {
    const state = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-15",
      "tpl_a",
    );
    expect(getTodayTemplateId(state, new Date(2025, 2, 15, 9))).toBe("tpl_a");
    expect(getTodayTemplateId(state, new Date(2025, 2, 16, 9))).toBeNull();
  });
});

describe("aggregatePlannedByDate", () => {
  const sample: PlannedWorkoutLike[] = [
    { id: "a", planned: true, startedAt: "2025-03-15T08:00:00.000Z" },
    { id: "b", planned: true, startedAt: "2025-03-15T18:30:00.000Z" },
    { id: "c", planned: true, startedAt: "2025-03-16T10:00:00.000Z" },
    { id: "d", planned: false, startedAt: "2025-03-17T10:00:00.000Z" },
    { id: "e", planned: true, startedAt: null },
    { id: "f", planned: true }, // no startedAt
    { id: "g", planned: true, startedAt: "bad" }, // too short
  ];

  it("buckets planned workouts by YYYY-MM-DD prefix and preserves input order", () => {
    const map = aggregatePlannedByDate(sample);
    expect(Object.keys(map).sort()).toEqual(["2025-03-15", "2025-03-16"]);
    expect(map["2025-03-15"]!.map((w) => w.id)).toEqual(["a", "b"]);
    expect(map["2025-03-16"]!.map((w) => w.id)).toEqual(["c"]);
  });

  it("ignores non-planned workouts, null/undefined startedAt, and bad keys", () => {
    const map = aggregatePlannedByDate(sample);
    expect(map["2025-03-17"]).toBeUndefined();
    expect(map["bad"]).toBeUndefined();
  });

  it("returns an empty map for null/undefined/empty input", () => {
    expect(aggregatePlannedByDate(null)).toEqual({});
    expect(aggregatePlannedByDate(undefined)).toEqual({});
    expect(aggregatePlannedByDate([])).toEqual({});
  });
});

describe("countPlannedDaysInMonth", () => {
  it("counts distinct dates with ≥1 planned workout inside the month", () => {
    const map = aggregatePlannedByDate([
      { id: "a", planned: true, startedAt: "2025-03-01T08:00:00Z" },
      { id: "b", planned: true, startedAt: "2025-03-15T08:00:00Z" },
      { id: "c", planned: true, startedAt: "2025-03-15T18:00:00Z" },
      { id: "d", planned: true, startedAt: "2025-04-02T08:00:00Z" },
    ]);
    expect(countPlannedDaysInMonth(map, 2025, 2)).toBe(2); // March
    expect(countPlannedDaysInMonth(map, 2025, 3)).toBe(1); // April
    expect(countPlannedDaysInMonth(map, 2025, 0)).toBe(0); // January
  });
});

describe("countPlannedTemplatesInMonth", () => {
  it("counts templated dates inside the month", () => {
    let state = defaultMonthlyPlanState();
    state = applySetDayTemplate(state, "2025-03-05", "tpl_a");
    state = applySetDayTemplate(state, "2025-03-20", "tpl_b");
    state = applySetDayTemplate(state, "2025-04-01", "tpl_c");
    expect(countPlannedTemplatesInMonth(state, 2025, 2)).toBe(2);
    expect(countPlannedTemplatesInMonth(state, 2025, 3)).toBe(1);
    expect(countPlannedTemplatesInMonth(state, 2025, 0)).toBe(0);
  });
});

describe("monthIsEmpty", () => {
  it("is true when there are neither templates nor planned workouts", () => {
    expect(monthIsEmpty(defaultMonthlyPlanState(), {}, 2025, 2)).toBe(true);
  });

  it("is false when at least one template is assigned", () => {
    const state = applySetDayTemplate(
      defaultMonthlyPlanState(),
      "2025-03-05",
      "tpl_a",
    );
    expect(monthIsEmpty(state, {}, 2025, 2)).toBe(false);
  });

  it("is false when at least one planned workout exists", () => {
    const map = aggregatePlannedByDate([
      { id: "a", planned: true, startedAt: "2025-03-05T08:00:00Z" },
    ]);
    expect(monthIsEmpty(defaultMonthlyPlanState(), map, 2025, 2)).toBe(false);
  });
});
