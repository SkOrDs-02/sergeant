// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { navigateMock, trackEventMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("./observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: (name: string, payload?: unknown) =>
      trackEventMock(name, payload),
  };
});

import { LandingPage } from "./LandingPage";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

function renderLanding(
  overrides: { onContinueWithoutAccount?: () => void } = {},
) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage {...overrides} />
    </MemoryRouter>,
  );
}

describe("LandingPage (initiative 0010 Phase 6.1, audit P1-3)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    trackEventMock.mockClear();
    // `document.referrer` is read-only by default; redefine it per test so the
    // happy-path assertion can verify both the empty (direct) and the
    // non-empty (paid-acquisition) shape of the LANDING_VIEWED payload.
    Object.defineProperty(document, "referrer", {
      value: "",
      configurable: true,
    });
  });
  afterEach(() => cleanup());

  it("fires LANDING_VIEWED on mount and renders hero CTAs + pricing link (happy path)", () => {
    renderLanding();

    // Canonical PostHog event from `analyticsEvents.ts § Landing page`.
    // `locale: "uk"` is hardcoded — EN locale arrives in Phase 6.2 in a
    // separate PR per the audit scope contract.
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.LANDING_VIEWED,
      { path: "/", locale: "uk" },
    );

    // Three user-facing entry points must exist: Login, Register, and
    // Pricing link. The audit P1-3 description names these as the
    // minimum required surface area.
    expect(screen.getByTestId("landing-login-cta")).toBeTruthy();
    expect(screen.getByTestId("landing-register-cta")).toBeTruthy();
    expect(screen.getByTestId("landing-pricing-link")).toBeTruthy();

    // CTAs route to the expected destinations.
    fireEvent.click(screen.getByTestId("landing-register-cta"));
    expect(navigateMock).toHaveBeenLastCalledWith("/sign-in");

    fireEvent.click(screen.getByTestId("landing-login-cta"));
    expect(navigateMock).toHaveBeenLastCalledWith("/sign-in");

    fireEvent.click(screen.getByTestId("landing-pricing-link"));
    expect(navigateMock).toHaveBeenLastCalledWith("/pricing?source=landing");
  });

  it("includes `referrer` in LANDING_VIEWED payload when document.referrer is non-empty (paid-acquisition split)", () => {
    // `referrer` is the split-key PostHog uses to distinguish organic
    // search traffic from paid ads (utm-less referrers like
    // `t.co`, `l.facebook.com`, `googleads.g.doubleclick.net`).
    // Edge case: when present it must round-trip into the event payload;
    // when absent the field is omitted to keep `direct` traffic clean.
    Object.defineProperty(document, "referrer", {
      value: "https://t.co/abc123",
      configurable: true,
    });

    renderLanding();

    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.LANDING_VIEWED,
      { path: "/", locale: "uk", referrer: "https://t.co/abc123" },
    );
  });

  it("uses the `onContinueWithoutAccount` prop when provided instead of navigating to /welcome (edge case)", () => {
    // StandaloneRoutes passes `onLeaveWelcome` as the skip handler so
    // App.tsx's `leaveWelcome` callback (replace-navigate `/`) wins over
    // the LandingPage default. This avoids a double-history entry when
    // the user toggles between landing and welcome.
    const skipHandler = vi.fn();
    renderLanding({ onContinueWithoutAccount: skipHandler });

    fireEvent.click(screen.getByTestId("landing-skip-cta"));

    expect(skipHandler).toHaveBeenCalledTimes(1);
    // When the prop is supplied, the component MUST NOT fall back to
    // navigate("/welcome") — otherwise we'd double-fire navigation.
    expect(navigateMock).not.toHaveBeenCalledWith("/welcome");
  });

  it("falls back to /welcome navigation when `onContinueWithoutAccount` is not provided (standalone-mount safety)", () => {
    // Component must be safe to mount outside StandaloneRoutes (e.g.,
    // in Storybook, design-showcase, or a future cmd-palette preview).
    renderLanding();

    fireEvent.click(screen.getByTestId("landing-skip-cta"));

    expect(navigateMock).toHaveBeenLastCalledWith("/welcome");
  });
});
