// @vitest-environment jsdom
/**
 * Shell / render smoke for `OnboardingWizard` — composition root + modal /
 * fullPage chrome only. Behavioural contracts (S6.1 opt-in picks, tour mode,
 * goal-first arm, UX copy) live in the co-located `OnboardingWizard.*.test.tsx`
 * siblings; this file must not duplicate them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_GOAL_FIRST_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { OnboardingWizard, shouldShowOnboarding } from "./OnboardingWizard";

describe("OnboardingWizard — shell smoke", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
    overrideVariant(webKVStore, ONBOARDING_GOAL_FIRST_EXPERIMENT.id, "control");
  });

  it("modal variant mounts without throwing and exposes the dialog landmark", () => {
    expect(() => render(<OnboardingWizard onDone={() => {}} />)).not.toThrow();

    const dialog = screen.getByRole("dialog", { name: "Вітальний екран" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("fullPage variant mounts and labels the welcome region (no dialog role)", () => {
    const { container } = render(
      <OnboardingWizard variant="fullPage" onDone={() => {}} />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    const labelled = container.querySelector('[aria-label="Вітальний екран"]');
    expect(labelled).toBeInTheDocument();
  });

  it("re-exports shouldShowOnboarding from onboardingGate", () => {
    expect(typeof shouldShowOnboarding).toBe("function");
  });
});
