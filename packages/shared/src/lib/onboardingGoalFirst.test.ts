import { describe, expect, it } from "vitest";
import {
  ONBOARDING_GOAL_FIRST_EXPERIMENT,
  ONBOARDING_OUTCOMES,
  ONBOARDING_OUTCOME_MODULES,
  getOutcomeById,
  getOutcomeModule,
} from "./onboardingGoalFirst";
import { DASHBOARD_MODULE_IDS } from "./dashboard";

describe("ONBOARDING_GOAL_FIRST_EXPERIMENT", () => {
  it("ships as a 50/50 control / goal_first A/B with control first", () => {
    expect(ONBOARDING_GOAL_FIRST_EXPERIMENT.id).toBe(
      "onboarding_goal_first_v1",
    );
    expect([...ONBOARDING_GOAL_FIRST_EXPERIMENT.variants]).toEqual([
      "control",
      "goal_first",
    ]);
    expect([...(ONBOARDING_GOAL_FIRST_EXPERIMENT.weights ?? [])]).toEqual([
      0.5, 0.5,
    ]);
  });
});

describe("ONBOARDING_OUTCOMES", () => {
  it("provides exactly one outcome per dashboard module (audit-guard)", () => {
    const outcomeModules = new Set(ONBOARDING_OUTCOMES.map((o) => o.module));
    expect(outcomeModules.size).toBe(DASHBOARD_MODULE_IDS.length);
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      expect(outcomeModules.has(moduleId)).toBe(true);
    }
  });

  it("exposes module-ids tuple aligned with dashboard.ts (no drift)", () => {
    expect([...ONBOARDING_OUTCOME_MODULES]).toEqual([...DASHBOARD_MODULE_IDS]);
  });

  it("keeps each outcome id unique", () => {
    const ids = ONBOARDING_OUTCOMES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("frames every outcome as a user-facing promise (no module-name leakage)", () => {
    // Goal-first hypothesis fails if the screen reads as a renamed
    // module picker. Block any outcome headline/body that leaks
    // module identifiers — the user should see *what they want*,
    // not *which feature does it*.
    for (const outcome of ONBOARDING_OUTCOMES) {
      const blob = `${outcome.headline} ${outcome.body}`.toLowerCase();
      expect(blob).not.toMatch(/фінік|fizruk|фізрук|nutrition|routine/i);
    }
  });

  it("respects copy budgets (headline ≤ 38, body ≤ 90)", () => {
    for (const outcome of ONBOARDING_OUTCOMES) {
      expect(outcome.headline.length).toBeLessThanOrEqual(38);
      expect(outcome.body.length).toBeLessThanOrEqual(90);
    }
  });
});

describe("getOutcomeById / getOutcomeModule", () => {
  it("returns the matching outcome for a known id", () => {
    const outcome = getOutcomeById("spend-less");
    expect(outcome?.module).toBe("finyk");
  });

  it("returns null for unknown / missing ids", () => {
    expect(getOutcomeById(null)).toBeNull();
    expect(getOutcomeById(undefined)).toBeNull();
    expect(getOutcomeById("")).toBeNull();
    expect(getOutcomeById("nope" as never)).toBeNull();
  });

  it("getOutcomeModule routes outcome → module without leaking copy", () => {
    expect(getOutcomeModule("stay-in-shape")).toBe("fizruk");
    expect(getOutcomeModule("build-habits")).toBe("routine");
    expect(getOutcomeModule("eat-better")).toBe("nutrition");
    expect(getOutcomeModule("nope" as never)).toBeNull();
  });
});
