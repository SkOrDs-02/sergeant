// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

// Heavy seeders are tangential to the dispatch contract under test.
// Stubbing keeps the unit hermetic and fast.
vi.mock("./seedDemoData/seedFinyk", () => ({ seedFinyk: vi.fn() }));
vi.mock("./seedDemoData/seedFizruk", () => ({ seedFizruk: vi.fn() }));
vi.mock("./seedDemoData/seedRoutine", () => ({ seedRoutine: vi.fn() }));
vi.mock("./seedDemoData/seedNutrition", () => ({ seedNutrition: vi.fn() }));
vi.mock("./seedDemoData/seedHubQuickStats", () => ({
  seedHubQuickStats: vi.fn(),
}));

import { runDemoSeedFromUrl } from "./seedDemoData";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

function setSearch(search: string): void {
  const url = new URL(`https://app.test/${search}`);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      href: url.toString(),
      search: url.search,
      pathname: "/",
      replace: vi.fn(),
    },
  });
}

describe("runDemoSeedFromUrl (S4.1 follow-up)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
  });

  it('fires DEMO_STARTED { source: "deeplink" } when ?demo=1 seeds', () => {
    setSearch("?demo=1");
    runDemoSeedFromUrl();
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEMO_STARTED, {
      source: "deeplink",
    });
  });

  it('fires DEMO_STARTED { source: "deeplink" } for the ?demo=seed alias', () => {
    setSearch("?demo=seed");
    runDemoSeedFromUrl();
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEMO_STARTED, {
      source: "deeplink",
    });
  });

  it("does NOT fire DEMO_STARTED on ?demo=reset (only resets state)", () => {
    setSearch("?demo=reset");
    runDemoSeedFromUrl();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does NOT fire DEMO_STARTED on URLs without ?demo", () => {
    setSearch("");
    runDemoSeedFromUrl();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
