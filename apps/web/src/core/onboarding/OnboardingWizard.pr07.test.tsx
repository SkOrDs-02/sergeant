// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ANALYTICS_EVENTS,
  ONBOARDING_COMPLETED_FIRED_KEY,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { OnboardingWizard } from "./OnboardingWizard";
import { trackEvent } from "../observability/analytics";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

const trackEventMock = vi.mocked(trackEvent);

/**
 * PR-07 — `onboarding_completed` PostHog event is the once-per-account
 * milestone in WF-60 growth funnel (`signup_completed →
 * onboarding_completed → first_action_completed`). Repeat invocations
 * of `finish()` (programmatic re-call, double-tap on the CTA, etc.)
 * must not re-emit the event, otherwise PostHog reads an inflated
 * activation count for the same user.
 *
 * Idempotency is gated by the `hub_onboarding_completed_v1` KV flag —
 * see `ONBOARDING_COMPLETED_FIRED_KEY` in `@sergeant/shared`.
 */
describe("OnboardingWizard — onboarding_completed event (PR-07)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    trackEventMock.mockClear();
    vi.restoreAllMocks();
    // Pin the experiment arms so the CTA copy is stable across runs
    // (`outcome` hero, `none` opt-in picks) — same setup as the S6.1
    // suite. Without this pin the v2 4-way hero split + picks
    // hardcoding interact in ways that flake the CTA query.
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
    // mockClear() runs after restoreAllMocks() so the assignment writes
    // above don't leak into the trackEvent expectations below.
    trackEventMock.mockClear();
  });

  function clickCta() {
    fireEvent.click(screen.getByRole("button", { name: /Розпочати/i }));
  }

  function clickFinykRow() {
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
  }

  function getCompletedCalls() {
    return trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
    );
  }

  it("fires `onboarding_completed` exactly once on the last step and sets the KV flag", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    clickFinykRow();
    clickCta();

    const completed = getCompletedCalls();
    expect(completed).toHaveLength(1);
    // Payload contract — `intent` reflects whether the user picked
    // anything; `picksCount` is the final-saved length, NOT the raw
    // user selection (these match in the `vibe_picked` path but
    // diverge in the legacy `vibe_empty` arm where empty falls back
    // to ALL_MODULES).
    expect(completed[0]?.[1]).toEqual({
      intent: "vibe_picked",
      picksCount: 1,
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ONBOARDING_COMPLETED_FIRED_KEY)).toBe("1");
  });

  it("does not re-fire `onboarding_completed` when the wizard is remounted with the flag already set", () => {
    // Simulate a return visit: the flag is set from a prior session,
    // the splash is opened again (e.g. via Settings → restart, then
    // the user lands on the wizard mid-flow before the reset clears
    // the flag), and the user submits picks. The event must not fire
    // a second time.
    localStorage.setItem(ONBOARDING_COMPLETED_FIRED_KEY, "1");

    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    clickFinykRow();
    clickCta();

    expect(getCompletedCalls()).toHaveLength(0);
    // Sanity-check: the rest of the per-submission funnel still fires,
    // so the guard is scoped to the activation milestone and not the
    // picks payload.
    expect(
      trackEventMock.mock.calls.some(
        ([name]) => name === ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED,
      ),
    ).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("tour replay never fires `onboarding_completed` regardless of the flag", () => {
    // Tour mode is the read-only replay (Settings → «Подивитись tour»)
    // and ships its own analytics taxonomy (`onboarding_replay_*`).
    // It must not contaminate the FTUX funnel even on a fresh store.
    const onDone = vi.fn();
    render(<OnboardingWizard mode="tour" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /Закрити/i }));

    expect(getCompletedCalls()).toHaveLength(0);
    expect(localStorage.getItem(ONBOARDING_COMPLETED_FIRED_KEY)).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
