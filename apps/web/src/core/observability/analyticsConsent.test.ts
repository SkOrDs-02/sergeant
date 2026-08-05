import { afterEach, describe, expect, it } from "vitest";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from "./analyticsConsent";

afterEach(() => {
  __resetAnalyticsConsentForTests();
});

describe("analyticsConsent", () => {
  it("defaults to false — deny until an authenticated boot hydrates the server value (CodeRabbit PR #627)", () => {
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("reflects the last value written by setAnalyticsConsent", () => {
    setAnalyticsConsent(true);
    expect(getAnalyticsConsent()).toBe(true);
    setAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("__resetAnalyticsConsentForTests restores the deny-by-default", () => {
    setAnalyticsConsent(true);
    __resetAnalyticsConsentForTests();
    expect(getAnalyticsConsent()).toBe(false);
  });
});
