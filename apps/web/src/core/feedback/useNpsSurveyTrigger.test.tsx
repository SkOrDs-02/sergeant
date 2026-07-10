/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { User } from "@sergeant/shared";
import {
  useNpsSurveyTrigger,
  NPS_MIN_ACCOUNT_AGE_DAYS,
} from "./useNpsSurveyTrigger";

const trackEvent = vi.fn();
vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  ANALYTICS_EVENTS: {},
}));

function makeUser(createdAt: string | null): User {
  return {
    id: "user-1",
    email: null,
    name: null,
    image: null,
    emailVerified: true,
    createdAt,
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("useNpsSurveyTrigger", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    window.localStorage.clear();
  });

  it("fires nps_survey_eligible once the account is 7+ days old", () => {
    renderHook(() => useNpsSurveyTrigger(makeUser(isoDaysAgo(8))));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("nps_survey_eligible", {
      account_age_days: 8,
    });
  });

  it("does not fire for accounts younger than the threshold", () => {
    renderHook(() =>
      useNpsSurveyTrigger(makeUser(isoDaysAgo(NPS_MIN_ACCOUNT_AGE_DAYS - 1))),
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not fire for signed-out or legacy (createdAt: null) users", () => {
    renderHook(() => useNpsSurveyTrigger(null));
    renderHook(() => useNpsSurveyTrigger(makeUser(null)));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("is idempotent across remounts (localStorage flag)", () => {
    const user = makeUser(isoDaysAgo(10));
    const first = renderHook(() => useNpsSurveyTrigger(user));
    first.unmount();
    renderHook(() => useNpsSurveyTrigger(user));
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
