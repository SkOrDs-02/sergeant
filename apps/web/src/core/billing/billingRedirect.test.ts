// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertAllowedBillingUrl } from "./billingRedirect";

describe("assertAllowedBillingUrl", () => {
  it("пропускає https провайдера", () => {
    expect(
      assertAllowedBillingUrl("https://billing.stripe.com/session/x"),
    ).toBe("https://billing.stripe.com/session/x");
  });

  it("пропускає same-origin manage-URL", () => {
    const url = `${window.location.origin}/settings?billing=manage`;
    expect(assertAllowedBillingUrl(url)).toBe(url);
  });

  it.each([
    ["javascript:alert(document.domain)"],
    ["http://checkout.stripe.com/c/pay"],
    ["https://evil.example/phish"],
  ])("відкидає %s", (raw) => {
    expect(() => assertAllowedBillingUrl(raw)).toThrow();
  });
});
