import { describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({ granted: false }));
vi.mock("./analyticsConsent", () => ({
  getAnalyticsConsent: () => consent.granted,
}));

import { vercelAnalyticsBeforeSend } from "./vercelAnalytics";

describe("vercelAnalyticsBeforeSend", () => {
  it("без згоди скасовує подію", () => {
    consent.granted = false;
    expect(
      vercelAnalyticsBeforeSend({ type: "pageview", url: "https://a.b/finyk" }),
    ).toBeNull();
  });

  it("зі згодою шле адресу без query і hash", () => {
    consent.granted = true;
    expect(
      vercelAnalyticsBeforeSend({
        type: "pageview",
        url: "https://a.b/reset-password?token=abc#x",
      }),
    ).toEqual({ type: "pageview", url: "https://a.b/reset-password" });
  });
});
