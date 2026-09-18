import { describe, expect, it } from "vitest";

import {
  ONBOARDING_HERO_PRIORITY,
  resolveOnboardingHero,
  type OnboardingHeroInputs,
} from "./onboardingHero";

const NONE: OnboardingHeroInputs = {
  reengagementEligible: false,
  firstActionVisible: false,
  softAuthEligible: false,
  todayFocusAvailable: false,
};

describe("resolveOnboardingHero (PR-12)", () => {
  it("returns null hero with reason='none' when no candidate is eligible", () => {
    expect(resolveOnboardingHero(NONE)).toEqual({
      hero: null,
      reason: "none",
      candidates: [],
    });
  });

  it("promotes today-focus when it's the only candidate", () => {
    expect(
      resolveOnboardingHero({ ...NONE, todayFocusAvailable: true }),
    ).toEqual({
      hero: "today-focus",
      reason: "today-focus",
      candidates: ["today-focus"],
    });
  });

  it("promotes first-action over today-focus during FTUX", () => {
    const result = resolveOnboardingHero({
      ...NONE,
      firstActionVisible: true,
      todayFocusAvailable: true,
    });
    expect(result.hero).toBe("first-action");
    expect(result.reason).toBe("ftux-pending");
    expect(result.candidates).toEqual(["first-action", "today-focus"]);
  });

  it("promotes soft-auth over today-focus when FTUX is done", () => {
    const result = resolveOnboardingHero({
      ...NONE,
      softAuthEligible: true,
      todayFocusAvailable: true,
    });
    expect(result.hero).toBe("soft-auth");
    expect(result.reason).toBe("soft-auth-due");
  });

  it("first-action wins over soft-auth when both are eligible", () => {
    // Defensive: storage flags should never both be true at the same
    // time, but the resolver needs to produce a deterministic winner
    // anyway so the hero slot does not flicker between renders.
    const result = resolveOnboardingHero({
      ...NONE,
      firstActionVisible: true,
      softAuthEligible: true,
    });
    expect(result.hero).toBe("first-action");
  });

  it("reengagement wins over every other candidate", () => {
    const result = resolveOnboardingHero({
      reengagementEligible: true,
      firstActionVisible: true,
      softAuthEligible: true,
      todayFocusAvailable: true,
    });
    expect(result.hero).toBe("reengagement");
    expect(result.reason).toBe("reengagement-active");
    // All four candidates should be reported so the dashboard / tests
    // can detect the conflict.
    expect(result.candidates).toEqual([
      "reengagement",
      "first-action",
      "soft-auth",
      "today-focus",
    ]);
  });

  it("preserves priority ordering in candidates", () => {
    // soft-auth + first-action: candidates should still be reported in
    // priority order, not in input order.
    const result = resolveOnboardingHero({
      ...NONE,
      softAuthEligible: true,
      firstActionVisible: true,
    });
    expect(result.candidates).toEqual(["first-action", "soft-auth"]);
  });

  it("ONBOARDING_HERO_PRIORITY exposes the canonical ordering", () => {
    // Hard-coded so analytics / docs can rely on the order without
    // having to re-derive it from the resolver behaviour.
    expect([...ONBOARDING_HERO_PRIORITY]).toEqual([
      "reengagement",
      "first-action",
      "soft-auth",
      "today-focus",
    ]);
  });
});
