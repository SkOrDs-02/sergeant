// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { OnboardingWizard } from "./OnboardingWizard";

/**
 * UX-polish guarantees that live outside the existing S6.1 / tour
 * suites:
 *
 *   1. Initial focus lands on the splash heading when the wizard
 *      mounts in modal variant. WCAG 2.4.3 — focus must move into
 *      the dialog so screen readers announce the new context.
 *   2. Escape forwards to `onSecondaryAction` in real-mode modal
 *      (soft-pause strategy: picks stay persisted, nothing
 *      destructive runs) and mirrors `tour_replay` `onDone` in
 *      tour-mode.
 *   3. Double-click on the primary CTA is a no-op for the second
 *      click in both real and tour modes (analytics / saveVibePicks /
 *      markOnboardingDone must never fire twice).
 *
 * Hero copy is pinned to `outcome` for the same reason as the S6.1
 * suite — the v2 4-way split would otherwise route ~20% of runs to
 * the `bold` arm and flake the CTA-label assertions.
 */
describe("OnboardingWizard — focus management on mount", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
  });

  it("focuses the splash heading on mount (modal variant)", () => {
    render(<OnboardingWizard onDone={() => {}} />);
    const heading = screen.getByRole("heading", { level: 2 });
    // The heading is the dialog's WCAG 2.4.3 anchor — it must own
    // focus immediately so AT users hear the new context.
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("does not steal focus when rendered in fullPage variant", () => {
    // `/welcome` route owns the page chrome — the wizard sits inline
    // and must not yank focus from the document on cold start. The
    // page-level focus story is owned by the route, not by the
    // splash card.
    const before = document.activeElement;
    render(<OnboardingWizard onDone={() => {}} variant="fullPage" />);
    expect(document.activeElement).toBe(before);
  });
});

describe("OnboardingWizard — Escape soft-pause (real-mode modal)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
  });

  it("Escape forwards to onSecondaryAction without firing onDone or marking onboarding done", () => {
    const onDone = vi.fn();
    const onSecondaryAction = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(
      <OnboardingWizard
        onDone={onDone}
        onSecondaryAction={onSecondaryAction}
      />,
    );

    // Pick a module so picks state has content — soft-pause must
    // preserve in-progress selections in localStorage.
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    // Soft-pause contract: the picks blob is still written by the
    // persist effect (that's the resume-after-refresh story), but
    // the onboarding-done gate must NOT flip. Otherwise the user
    // never sees the wizard again.
    const writtenKeys = setItem.mock.calls.map(([k]) => String(k));
    expect(writtenKeys).not.toContain("hub_onboarding_done_v1");
    expect(writtenKeys.some((k) => k.startsWith("sergeant.vibePicks"))).toBe(
      false,
    );
  });

  it("Escape is a no-op when onSecondaryAction is not provided (forward-compat)", () => {
    // Hosts that opt out of soft-pause (or have not wired the prop
    // yet) must not crash and must not silently complete the
    // wizard. The user simply stays on the splash.
    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    expect(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    }).not.toThrow();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("OnboardingWizard — Escape in tour-mode modal", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("Escape closes tour replay with the tour_replay intent", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard mode="tour" onDone={onDone} />);

    fireEvent.keyDown(document, { key: "Escape" });

    // Tour Escape must mirror the «Закрити» CTA exactly — same
    // payload, same single-call contract — so the dismissal path
    // stays single-source no matter which input the user uses.
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "tour_replay",
      picks: [],
    });
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
  });
});

describe("OnboardingWizard — double-submit guard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
  });

  it("does not call onDone twice when the primary CTA is double-clicked (real mode)", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    // Pick a module so the CTA is enabled.
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));

    const cta = screen.getByRole("button", { name: /Розпочати/i });
    fireEvent.click(cta);
    fireEvent.click(cta);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone twice when the «Закрити» CTA is double-clicked (tour mode)", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard mode="tour" onDone={onDone} />);

    const close = screen.getByRole("button", { name: /Закрити/i });
    fireEvent.click(close);
    fireEvent.click(close);

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
