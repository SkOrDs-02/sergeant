import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE importing the SUT. Vitest hoists `vi.mock`
// calls so the mocked modules are in place before the dynamic import.
vi.mock("./longTaskMonitor", () => ({
  getLongTasksSince: vi.fn(),
}));

vi.mock("./useRoutePrefetch", () => ({
  isPagePrefetched: vi.fn(),
}));

vi.mock("../observability/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { trackEvent } from "../observability/analytics";
import { getLongTasksSince } from "./longTaskMonitor";
import { isPagePrefetched } from "./useRoutePrefetch";
import { __resetForTests, beginHubTabSwitch, endHubTabSwitch } from "./hubPerf";

const mockTrack = vi.mocked(trackEvent);
const mockGetLongTasks = vi.mocked(getLongTasksSince);
const mockIsPrefetched = vi.mocked(isPagePrefetched);

describe("hubPerf", () => {
  beforeEach(() => {
    __resetForTests();
    mockTrack.mockReset();
    mockGetLongTasks.mockReset();
    mockIsPrefetched.mockReset();
    mockGetLongTasks.mockReturnValue([]);
    mockIsPrefetched.mockReturnValue(false);
  });

  it("fires hub_tab_switch_perf event with ttiMs ≥ 0 on begin → end flow", () => {
    const t0 = performance.now();
    beginHubTabSwitch("reports");
    // Defensive ≥ 0 — depending on platform `performance.now()` between
    // two synchronous calls may be 0 or a small positive number.
    endHubTabSwitch("reports");
    expect(t0).toBeGreaterThanOrEqual(0);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mockTrack.mock.calls[0] ?? [];
    expect(eventName).toBe(ANALYTICS_EVENTS.HUB_TAB_SWITCH_PERF);
    expect(payload).toMatchObject({
      tab: "reports",
      longTaskMs: 0,
      longTaskCount: 0,
      cacheHit: false,
    });
    expect(typeof (payload as { ttiMs: number }).ttiMs).toBe("number");
    expect((payload as { ttiMs: number }).ttiMs).toBeGreaterThanOrEqual(0);
  });

  it("aggregates longTaskMs + count from getLongTasksSince(startedAt)", () => {
    mockGetLongTasks.mockReturnValue([
      { startTime: 5, duration: 60 },
      { startTime: 50, duration: 120 },
      { startTime: 90, duration: 80 },
    ]);
    beginHubTabSwitch("settings");
    endHubTabSwitch("settings");
    const payload = mockTrack.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.longTaskMs).toBe(260);
    expect(payload.longTaskCount).toBe(3);
  });

  it("includes cacheHit=true when the page chunk was prefetched", () => {
    mockIsPrefetched.mockImplementation((page) => page === "settings");
    beginHubTabSwitch("settings");
    endHubTabSwitch("settings");
    const payload = mockTrack.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.cacheHit).toBe(true);
  });

  it("end without a matching begin is a silent no-op", () => {
    endHubTabSwitch("reports");
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("rapid double-begin then end fires exactly once and clears the slot", () => {
    beginHubTabSwitch("profile");
    beginHubTabSwitch("profile");
    endHubTabSwitch("profile");
    endHubTabSwitch("profile");
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("independent tabs do not cross-contaminate slots", () => {
    beginHubTabSwitch("reports");
    beginHubTabSwitch("settings");
    endHubTabSwitch("settings");
    endHubTabSwitch("reports");
    expect(mockTrack).toHaveBeenCalledTimes(2);
    const tabs = mockTrack.mock.calls.map(
      (call) => (call[1] as Record<string, unknown>).tab,
    );
    expect(tabs).toEqual(["settings", "reports"]);
  });
});
