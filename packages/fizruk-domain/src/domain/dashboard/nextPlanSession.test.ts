import { describe, expect, it } from "vitest";

import { defaultMonthlyPlanState } from "../plan/state.js";
import type { MonthlyPlanState } from "../plan/types.js";

import { getNextPlanSession } from "./nextPlanSession.js";
import type { DashboardTemplateLike } from "./types.js";

const FROZEN_NOW = new Date(2026, 3, 22, 12, 0, 0); // 2026-04-22 local

function stateWithDays(days: Record<string, string>): MonthlyPlanState {
  return {
    ...defaultMonthlyPlanState(),
    days: Object.fromEntries(
      Object.entries(days).map(([key, templateId]) => [key, { templateId }]),
    ),
  };
}

const TEMPLATES: readonly DashboardTemplateLike[] = [
  { id: "tpl-push", name: "Push", exerciseIds: ["bench", "ohp"] },
  { id: "tpl-legs", name: "Legs", exerciseIds: ["squat", "deadlift", "lunge"] },
  { id: "tpl-unnamed", name: "", exerciseIds: [] },
];

describe("getNextPlanSession", () => {
  it("returns null when nothing is scheduled in the window", () => {
    const plan = stateWithDays({});
    expect(
      getNextPlanSession({ plan, templatesById: TEMPLATES, now: FROZEN_NOW }),
    ).toBeNull();
  });

  it("surfaces today when today has a template", () => {
    const plan = stateWithDays({ "2026-04-22": "tpl-push" });
    const result = getNextPlanSession({
      plan,
      templatesById: TEMPLATES,
      now: FROZEN_NOW,
    });
    expect(result).toEqual({
      dateKey: "2026-04-22",
      daysFromNow: 0,
      isToday: true,
      templateId: "tpl-push",
      templateName: "Push",
      exerciseCount: 2,
    });
  });

  it("falls back to the next scheduled day when today is empty", () => {
    const plan = stateWithDays({ "2026-04-25": "tpl-legs" });
    const result = getNextPlanSession({
      plan,
      templatesById: TEMPLATES,
      now: FROZEN_NOW,
    });
    expect(result).toEqual({
      dateKey: "2026-04-25",
      daysFromNow: 3,
      isToday: false,
      templateId: "tpl-legs",
      templateName: "Legs",
      exerciseCount: 3,
    });
  });

  it("respects `lookaheadDays`", () => {
    const plan = stateWithDays({ "2026-05-10": "tpl-push" });
    expect(
      getNextPlanSession({
        plan,
        templatesById: TEMPLATES,
        now: FROZEN_NOW,
        lookaheadDays: 7,
      }),
    ).toBeNull();
  });

  it("returns templateName fallback when template has empty name", () => {
    const plan = stateWithDays({ "2026-04-22": "tpl-unnamed" });
    const result = getNextPlanSession({
      plan,
      templatesById: TEMPLATES,
      now: FROZEN_NOW,
    });
    expect(result?.templateName).toBe("Тренування");
    expect(result?.exerciseCount).toBe(0);
  });

  it("returns exerciseCount=null when template is unknown to the catalogue", () => {
    const plan = stateWithDays({ "2026-04-22": "tpl-deleted" });
    const result = getNextPlanSession({
      plan,
      templatesById: TEMPLATES,
      now: FROZEN_NOW,
    });
    expect(result).toMatchObject({
      templateId: "tpl-deleted",
      templateName: "Тренування",
      exerciseCount: null,
    });
  });
});
