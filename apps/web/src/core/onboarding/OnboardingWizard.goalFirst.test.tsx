// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_GOAL_FIRST_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { OnboardingWizard } from "./OnboardingWizard";

/**
 * PR-13 / S5.1 — goal-first wizard A/B.
 *
 * `control` arm renders the legacy module-checklist welcome
 * (`WelcomeOneScreen`); `goal_first` arm renders the new
 * `GoalFirstScreen` (4 outcome cards → single commit → wizard
 * routes the host to the derived module via `onDone(moduleId, …)`).
 *
 * Hero copy is pinned to `outcome` for cross-test stability — same
 * reason as OnboardingWizard.s61.test.tsx.
 */
describe("OnboardingWizard — goal-first A/B (PR-13)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
  });

  it("renders the legacy welcome on the `control` arm", () => {
    overrideVariant(webKVStore, ONBOARDING_GOAL_FIRST_EXPERIMENT.id, "control");

    render(<OnboardingWizard onDone={() => {}} />);

    // Legacy welcome has the «Розпочати …» CTA on the `outcome`
    // hero arm and shows module rows; the goal-first headline must
    // not appear.
    expect(screen.queryByText(/Що для тебе зараз важливо/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /Розпочати/i }),
    ).toBeInTheDocument();
  });

  it("renders the outcome grid on the `goal_first` arm", () => {
    overrideVariant(
      webKVStore,
      ONBOARDING_GOAL_FIRST_EXPERIMENT.id,
      "goal_first",
    );

    render(<OnboardingWizard onDone={() => {}} />);

    expect(screen.getByText("Що для тебе зараз важливо?")).toBeInTheDocument();
    expect(
      screen.getByTestId("goal-first-outcome-spend-less"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("goal-first-outcome-stay-in-shape"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("goal-first-outcome-build-habits"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("goal-first-outcome-eat-better"),
    ).toBeInTheDocument();
    // Legacy CTA must not be in the tree until the user skips back.
    expect(screen.queryByRole("button", { name: /Розпочати/i })).toBeNull();
  });

  it("routes the host to the derived module when an outcome is picked", () => {
    overrideVariant(
      webKVStore,
      ONBOARDING_GOAL_FIRST_EXPERIMENT.id,
      "goal_first",
    );

    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    fireEvent.click(screen.getByTestId("goal-first-outcome-stay-in-shape"));

    expect(onDone).toHaveBeenCalledTimes(1);
    const [moduleId, opts] = onDone.mock.calls[0]!;
    expect(moduleId).toBe("fizruk");
    expect(opts?.intent).toBe("goal_first");
    expect(opts?.picks).toEqual(["fizruk"]);
  });

  it("falls back to the legacy welcome when the user skips goal-first", () => {
    overrideVariant(
      webKVStore,
      ONBOARDING_GOAL_FIRST_EXPERIMENT.id,
      "goal_first",
    );

    render(<OnboardingWizard onDone={() => {}} />);

    fireEvent.click(screen.getByTestId("goal-first-skip"));

    // Goal-first screen unmounts; legacy welcome takes over with
    // its CTA visible. Skip stays a one-way transition, so the
    // outcome cards must be gone.
    expect(screen.queryByText("Що для тебе зараз важливо?")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Розпочати/i }),
    ).toBeInTheDocument();
  });

  it("does not enroll tour replay into the goal-first cohort", () => {
    overrideVariant(
      webKVStore,
      ONBOARDING_GOAL_FIRST_EXPERIMENT.id,
      "goal_first",
    );

    render(<OnboardingWizard onDone={() => {}} mode="tour" />);

    // Tour replay short-circuits to `control` regardless of stored
    // assignment, so the legacy welcome must render. The outcome
    // grid is unreachable from replay.
    expect(screen.queryByText("Що для тебе зараз важливо?")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Закрити/i }),
    ).toBeInTheDocument();
  });
});
