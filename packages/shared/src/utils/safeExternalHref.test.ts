import { describe, expect, it } from "vitest";
import {
  BILLING_PROVIDER_HOSTS,
  isSilpoHost,
  safeExternalHref,
  safeSilpoHref,
} from "./safeExternalHref";

describe("safeExternalHref", () => {
  it("пропускає https на хості з allow-list", () => {
    expect(
      safeExternalHref(
        "https://www.liqpay.ua/api/3/checkout?data=x",
        BILLING_PROVIDER_HOSTS,
      ),
    ).toBe("https://www.liqpay.ua/api/3/checkout?data=x");
  });

  it.each([
    ["javascript:alert(document.domain)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["http://checkout.stripe.com/c/pay"],
    ["https://evil.example/phish"],
    ["https://user:pw@www.liqpay.ua/"],
    ["https://www.liqpay.ua:8443/"],
    ["/settings?billing=manage"],
    ["not a url"],
    [""],
    [null],
    [42],
  ])("відкидає %s", (raw) => {
    expect(safeExternalHref(raw, BILLING_PROVIDER_HOSTS)).toBeNull();
  });
});

describe("safeSilpoHref", () => {
  it("пропускає https на silpo.ua і піддоменах", () => {
    expect(safeSilpoHref("https://silpo.ua/checkout/abc")).toBe(
      "https://silpo.ua/checkout/abc",
    );
    expect(safeSilpoHref("https://shop.silpo.ua/cart")).toBe(
      "https://shop.silpo.ua/cart",
    );
  });

  it.each([
    ["javascript:alert(document.domain)"],
    ["http://silpo.ua/cart"],
    ["https://evil.example/phish"],
    ["https://evilsilpo.ua/cart"],
    ["https://silpo.ua.evil.com/cart"],
  ])("відкидає %s", (raw) => {
    expect(safeSilpoHref(raw)).toBeNull();
  });

  it("isSilpoHost не чутливий до регістру", () => {
    expect(isSilpoHost("SILPO.UA")).toBe(true);
  });
});
