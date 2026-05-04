// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingWizard } from "./OnboardingWizard";

/**
 * Tour mode (S4.5) covers the read-only replay launched from
 * Settings → "Подивитись tour". The contract is that the wizard
 * never touches the user's onboarding / first-action / vibe-picks
 * state and never fires the FTUX-funnel events.
 */
describe("OnboardingWizard — tour mode (read-only replay)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders; mount
  // hygiene is handled per-file (see NoBankBanner.test.tsx).
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not persist picks to localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<OnboardingWizard mode="tour" onDone={() => {}} />);
    // The wizard should not write any of the FTUX persistence keys
    // while running in tour mode.
    const writtenKeys = setItem.mock.calls.map(([k]) => String(k));
    expect(writtenKeys).not.toContain("sergeant.onboarding.wizardState.v2");
    expect(writtenKeys).not.toContain("hub_onboarding_done_v1");
    expect(writtenKeys.some((k) => k.startsWith("sergeant.vibePicks"))).toBe(
      false,
    );
  });

  it("does not mark onboarding done or change first-action state on close", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard mode="tour" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /Закрити/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    // Critical: tour finish must hand back `null` start module + intent
    // tagged as `tour_replay`, never `vibe_picked` / `vibe_empty` (those
    // labels feed the real activation funnel).
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "tour_replay",
      picks: [],
    });
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
    expect(
      localStorage.getItem("sergeant.onboarding.wizardState.v2"),
    ).toBeNull();
  });

  it("renders the «Закрити» CTA instead of the experiment-arm CTA", () => {
    render(<OnboardingWizard mode="tour" onDone={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Закрити/i }),
    ).toBeInTheDocument();
    // Tour mode must override `copy.primaryCta` so the user always sees
    // «Закрити» regardless of which hero variant is assigned.
    expect(
      screen.queryByRole("button", { name: /Розпочати/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Відкрити Sergeant/i }),
    ).not.toBeInTheDocument();
  });

  it("default mode renders the outcome-variant CTA (mainline post-S1.1)", () => {
    render(<OnboardingWizard onDone={() => {}} />);
    // `weights: [1, 0, 0]` ships outcome at 100%, so a fresh fingerprint
    // always lands on the outcome arm: «Розпочати — 30 секунд».
    expect(
      screen.getByRole("button", { name: /Розпочати/i }),
    ).toBeInTheDocument();
    // Audit-guard — the pre-S1.1 «Відкрити Sergeant» CTA must not
    // resurrect from a stale assignment or a forgotten code path.
    expect(
      screen.queryByRole("button", { name: /Відкрити Sergeant/i }),
    ).not.toBeInTheDocument();
  });
});
