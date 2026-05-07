import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMemoryKVStore } from "../test-utils";
import { assignVariant } from "./abTest";
import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  isOnboardingDefaultPicksVariant,
} from "./onboardingDefaultPicks";

describe("ONBOARDING_DEFAULT_PICKS_EXPERIMENT", () => {
  it("declares exactly the two variants the wizard branches on", () => {
    expect(ONBOARDING_DEFAULT_PICKS_EXPERIMENT.variants).toEqual([
      "none",
      "all",
    ]);
  });

  it("runs 50/50 — neither arm is starved", () => {
    expect(ONBOARDING_DEFAULT_PICKS_EXPERIMENT.weights).toEqual([0.5, 0.5]);
  });

  it("uses a stable id so PostHog dashboards bind", () => {
    expect(ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id).toBe(
      "onboarding_default_picks_v1",
    );
  });

  it("assigns a deterministic variant per fingerprint", () => {
    const store = createMemoryKVStore();
    const first = assignVariant(store, ONBOARDING_DEFAULT_PICKS_EXPERIMENT);
    const second = assignVariant(store, ONBOARDING_DEFAULT_PICKS_EXPERIMENT);
    expect(first).toBe(second);
    expect(["none", "all"]).toContain(first);
  });

  it("type-guard accepts only the two declared variants", () => {
    expect(isOnboardingDefaultPicksVariant("none")).toBe(true);
    expect(isOnboardingDefaultPicksVariant("all")).toBe(true);
    expect(isOnboardingDefaultPicksVariant("legacy")).toBe(false);
    expect(isOnboardingDefaultPicksVariant("")).toBe(false);
  });
});

describe("S6.1 audit-guard", () => {
  it("experiment id matches the sprint-plan name (PostHog dashboard depends on it)", () => {
    // `onboarding_default_picks_v1` is referenced in
    // `docs/launch/ftux-sprint-plan.md` §2.1 / B-1 and in the
    // PostHog feature-flag config; renaming it silently breaks the
    // dashboard. Block that drift here.
    expect(ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id).toBe(
      "onboarding_default_picks_v1",
    );
  });

  it("source file documents the legacy `all` arm — control must stay measurable", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./onboardingDefaultPicks.ts", import.meta.url)),
      "utf-8",
    );
    // If a future refactor drops the `all` variant entirely (forgetting
    // we run an A/B), the reference to legacy behaviour disappears
    // from this file and the audit-trail is lost.
    expect(src).toMatch(/legacy/i);
    expect(src).toMatch(/control/i);
  });
});
