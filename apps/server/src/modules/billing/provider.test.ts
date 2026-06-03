import { describe, expect, it } from "vitest";
import { getProviderForCountry } from "./provider.js";

describe("getProviderForCountry", () => {
  it("returns 'stripe' for UA when LiqPay is disabled (default, pre-Phase 7)", () => {
    expect(getProviderForCountry({ country: "UA", liqpayEnabled: false })).toBe(
      "stripe",
    );
  });

  it("returns 'liqpay' for UA when LiqPay is enabled", () => {
    expect(getProviderForCountry({ country: "UA", liqpayEnabled: true })).toBe(
      "liqpay",
    );
  });

  it("returns 'stripe' for non-UA countries even when LiqPay is enabled", () => {
    expect(getProviderForCountry({ country: "US", liqpayEnabled: true })).toBe(
      "stripe",
    );
  });

  it("is case-insensitive on the country code", () => {
    expect(getProviderForCountry({ country: "ua", liqpayEnabled: true })).toBe(
      "liqpay",
    );
  });

  it("defaults to 'stripe' when country is missing", () => {
    expect(getProviderForCountry({ liqpayEnabled: true })).toBe("stripe");
    expect(getProviderForCountry({ country: null, liqpayEnabled: true })).toBe(
      "stripe",
    );
  });
});
