// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./longTaskMonitor", () => ({
  getLongTasksSince: vi.fn(),
}));

vi.mock("../observability/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { trackEvent } from "../observability/analytics";
import { getLongTasksSince } from "./longTaskMonitor";
import {
  __resetForTests,
  beginRouteChange,
  endRouteChange,
} from "./routeChangePerf";

const mockTrack = vi.mocked(trackEvent);
const mockGetLongTasks = vi.mocked(getLongTasksSince);

describe("routeChangePerf", () => {
  beforeEach(() => {
    __resetForTests();
    mockTrack.mockReset();
    mockGetLongTasks.mockReset();
    mockGetLongTasks.mockReturnValue([]);
  });

  it("fires route_change event with durationMs ≥ 0 on begin → end", () => {
    beginRouteChange("/finyk", "/fizruk");
    endRouteChange("/fizruk");
    expect(mockTrack).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mockTrack.mock.calls[0] ?? [];
    expect(eventName).toBe(ANALYTICS_EVENTS.ROUTE_CHANGE);
    expect(payload).toMatchObject({
      from: "/finyk",
      to: "/fizruk",
      longTaskMs: 0,
      longTaskCount: 0,
    });
    expect(
      (payload as { durationMs: number }).durationMs,
    ).toBeGreaterThanOrEqual(0);
  });

  it("aggregates longTaskMs + count from getLongTasksSince(startedAt)", () => {
    mockGetLongTasks.mockReturnValue([
      { startTime: 10, duration: 75 },
      { startTime: 95, duration: 150 },
    ]);
    beginRouteChange("/", "/finyk");
    endRouteChange("/finyk");
    const payload = mockTrack.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload["longTaskMs"]).toBe(225);
    expect(payload["longTaskCount"]).toBe(2);
  });

  it("end without a matching begin is a silent no-op", () => {
    endRouteChange("/finyk");
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("end with a mismatched `to` after super-fast renavigate emits nothing", () => {
    beginRouteChange("/", "/finyk");
    beginRouteChange("/finyk", "/fizruk");
    // Stale `end` from the first navigation — slot is now keyed to "/fizruk".
    endRouteChange("/finyk");
    expect(mockTrack).not.toHaveBeenCalled();
    endRouteChange("/fizruk");
    expect(mockTrack).toHaveBeenCalledTimes(1);
    const payload = mockTrack.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ from: "/finyk", to: "/fizruk" });
  });

  it("double end clears the slot — second call is a no-op", () => {
    beginRouteChange("/", "/finyk");
    endRouteChange("/finyk");
    endRouteChange("/finyk");
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});
