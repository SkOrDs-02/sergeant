// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DemoModeBanner } from "./DemoModeBanner";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";
const SESSION_DISMISS_KEY = "hub_demo_banner_dismissed_session";

describe("DemoModeBanner (S4.1)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(trackEvent).mockClear();
    // jsdom's `location.assign` throws when the URL navigates away.
    // Stub it for the «Створити свій» test.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn() },
    });
  });

  it("renders nothing when demo flag is not set", () => {
    const { container } = render(<DemoModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders banner with CTA when demo flag is set", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    render(<DemoModeBanner />);
    expect(screen.getByText("Це приклад")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Створити свій/i }),
    ).toBeInTheDocument();
  });

  it("hides banner for the rest of the session when X is clicked", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    render(<DemoModeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Сховати/i }));

    expect(screen.queryByText("Це приклад")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_DISMISS_KEY)).toBe("1");
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DEMO_DISMISSED,
    );
  });

  it("does not render when sessionStorage already has the dismiss flag", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    const { container } = render(<DemoModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("«Створити свій» wipes the demo payload, fires event, and navigates to /welcome", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    // Seed a couple of the keys the banner is supposed to reset on confirm.
    localStorage.setItem("finyk_manual_expenses_v1", "[]");
    localStorage.setItem("hub_onboarding_done_v1", "1");
    render(<DemoModeBanner />);

    fireEvent.click(screen.getByRole("button", { name: /Створити свій/i }));

    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DEMO_TO_WIZARD_CONFIRMED,
    );
    // resetDemoData() removes every SEEDED_KEYS entry; spot-check two.
    expect(localStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
    expect(window.location.assign).toHaveBeenCalledWith("/welcome");
  });
});
