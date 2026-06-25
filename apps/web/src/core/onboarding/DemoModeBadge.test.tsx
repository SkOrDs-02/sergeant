// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return { ...actual, trackEvent: vi.fn() };
});

import { DemoModeBadge } from "./DemoModeBadge";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";

describe("DemoModeBadge", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
    // jsdom's real `location.assign` throws on navigation — stub it.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn() },
    });
  });

  it("renders nothing when demo flag is not set", () => {
    const { container } = render(<DemoModeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an exit button when demo flag is set", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    render(<DemoModeBadge />);
    const badge = screen.getByRole("button", { name: /вийти/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Демо");
    expect(badge).toHaveTextContent("Вийти");
  });

  it("exits demo on click: wipes the payload, fires event, navigates to /welcome", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    localStorage.setItem("hub_onboarding_done_v1", "1");
    render(<DemoModeBadge />);

    fireEvent.click(screen.getByRole("button", { name: /вийти/i }));

    // resetDemoData() removes every SEEDED_KEYS entry; spot-check two.
    expect(localStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DEMO_TO_WIZARD_CONFIRMED,
    );
    expect(window.location.assign).toHaveBeenCalledWith("/welcome");
  });
});
