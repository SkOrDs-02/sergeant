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
  it("defaults to true (opt-out model, matches UserPreferencesSchema.analytics default)", () => {
    expect(getAnalyticsConsent()).toBe(true);
  });

  it("reflects the last value written by setAnalyticsConsent", () => {
    setAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
    setAnalyticsConsent(true);
    expect(getAnalyticsConsent()).toBe(true);
  });

  it("__resetAnalyticsConsentForTests restores the default", () => {
    setAnalyticsConsent(false);
    __resetAnalyticsConsentForTests();
    expect(getAnalyticsConsent()).toBe(true);
  });
});
