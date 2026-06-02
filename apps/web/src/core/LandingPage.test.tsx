// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that depend on them.
// ---------------------------------------------------------------------------

const { navigateMock, trackEventMock, useLocaleMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  trackEventMock: vi.fn(),
  // Mutable ref that each test sets to the desired locale. The vi.mock factory
  // below closes over this ref so that the hook returns whatever locale the
  // current test has configured — without needing `vi.doMock` (which doesn't
  // work on already-imported modules in vitest).
  useLocaleMock: {
    locale: "uk" as "uk" | "en",
  },
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

vi.mock("./pricing/WaitlistForm", () => ({
  WaitlistForm: ({
    source,
    onSuccess,
  }: {
    source: string;
    onSuccess?: (created: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="landing-email-capture"
      data-source={source}
      onClick={() => onSuccess?.(true)}
    >
      email capture
    </button>
  ),
}));

// Mock useLocale using a factory that reads from `useLocaleMock.locale` on
// each render. `getMessages` is the real resolver (no mock needed for it).
vi.mock("@shared/i18n/useLocale", async () => {
  const { getMessages } =
    await vi.importActual<typeof import("@shared/i18n/index")>(
      "@shared/i18n/index",
    );
  return {
    useLocale: () => {
      const locale = useLocaleMock.locale;
      return {
        locale,
        messages: getMessages(locale),
        setLocale: vi.fn(),
      };
    },
  };
});

// ---------------------------------------------------------------------------
// Late imports — after vi.mock hoisting
// ---------------------------------------------------------------------------

import { LandingPage } from "./LandingPage";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { getMessages } from "@shared/i18n/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLanding(
  overrides: { onContinueWithoutAccount?: () => void } = {},
) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage {...overrides} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LandingPage (initiative 0010 Phase 6.2 — dynamic locale)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    trackEventMock.mockClear();
    // Reset locale to "uk" so each test starts from the default locale.
    useLocaleMock.locale = "uk";
    // `document.referrer` is read-only by default; redefine it per test so the
    // happy-path assertion can verify both the empty (direct) and the
    // non-empty (paid-acquisition) shape of the LANDING_VIEWED payload.
    Object.defineProperty(document, "referrer", {
      value: "",
      configurable: true,
    });
  });
  afterEach(() => cleanup());

  it("fires LANDING_VIEWED on mount and renders hero CTAs + pricing link (happy path, default uk locale)", () => {
    renderLanding();

    // Default locale is "uk" — LANDING_VIEWED payload carries the resolved locale.
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
    expect(screen.getByTestId("landing-email-capture")).toHaveAttribute(
      "data-source",
      "landing",
    );

    // CTAs route to the expected destinations.
    fireEvent.click(screen.getByTestId("landing-register-cta"));
    expect(navigateMock).toHaveBeenLastCalledWith("/sign-in");

    fireEvent.click(screen.getByTestId("landing-login-cta"));
    expect(navigateMock).toHaveBeenLastCalledWith("/sign-in");

    fireEvent.click(screen.getByTestId("landing-pricing-link"));
    expect(navigateMock).toHaveBeenLastCalledWith("/pricing?source=landing");
  });

  it("fires LANDING_EMAIL_CAPTURED after the landing email form succeeds (default uk locale)", () => {
    renderLanding();

    fireEvent.click(screen.getByTestId("landing-email-capture"));

    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.LANDING_EMAIL_CAPTURED,
      { source: "hero", locale: "uk" },
    );
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

  // Phase 6.2 — EN locale tests. The `useLocaleMock.locale` ref is set to
  // "en" before render; the vi.mock factory above reads it synchronously so
  // the component sees EN messages on first render.
  describe("EN locale (Phase 6.2)", () => {
    beforeEach(() => {
      useLocaleMock.locale = "en";
    });

    it("renders EN copy when useLocale returns 'en'", () => {
      renderLanding();

      const t = getMessages("en").landing;

      // EN hero CTA labels must appear in the DOM.
      expect(screen.getByTestId("landing-register-cta").textContent).toBe(
        t.registerCta,
      );
      expect(screen.getByTestId("landing-login-cta").textContent).toBe(
        t.loginCta,
      );
      expect(screen.getByTestId("landing-skip-cta").textContent).toBe(
        t.skipCta,
      );
    });

    it("fires LANDING_VIEWED with locale='en' when useLocale returns 'en'", () => {
      renderLanding();

      expect(trackEventMock).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.LANDING_VIEWED,
        expect.objectContaining({ path: "/", locale: "en" }),
      );
    });

    it("fires LANDING_EMAIL_CAPTURED with locale='en' after email form succeeds", () => {
      renderLanding();

      fireEvent.click(screen.getByTestId("landing-email-capture"));

      expect(trackEventMock).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.LANDING_EMAIL_CAPTURED,
        { source: "hero", locale: "en" },
      );
    });
  });
});
