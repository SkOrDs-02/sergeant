/**
 * Jest coverage for `trackEvent` — verifies the dual-transport
 * contract: console.log breadcrumb + handoff to PostHog. PostHog
 * itself is mocked at module level so we don't touch fetch.
 */

jest.mock("../observability/posthog", () => ({
  __esModule: true,
  capturePostHogEvent: jest.fn(),
  initPostHog: jest.fn(),
  identifyPostHogUser: jest.fn(),
  resetPostHog: jest.fn(),
}));

import { trackEvent, ANALYTICS_EVENTS } from "../analytics";
import { capturePostHogEvent } from "../observability/posthog";

const captureMock = capturePostHogEvent as jest.Mock;

describe("trackEvent", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    captureMock.mockReset();
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("логує у console.log і викликає capturePostHogEvent", () => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED, { source: "demo" });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[analytics]",
      expect.objectContaining({
        eventName: "onboarding_started",
        payload: { source: "demo" },
      }),
    );
    expect(captureMock).toHaveBeenCalledWith("onboarding_started", {
      source: "demo",
    });
  });

  it("ігнорує порожній eventName", () => {
    trackEvent("");
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("ловить throw з PostHog-транспорта і не валиться", () => {
    captureMock.mockImplementation(() => {
      throw new Error("transport down");
    });

    expect(() => trackEvent("test_event", { foo: "bar" })).not.toThrow();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("payload без обʼєкта замінюється на {}", () => {
    trackEvent("typed_event");
    expect(captureMock).toHaveBeenCalledWith("typed_event", {});
  });
});
