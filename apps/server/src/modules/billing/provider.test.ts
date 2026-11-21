import { describe, expect, it } from "vitest";
import {
  ProviderNotAvailableError,
  getEnabledProviders,
  resolveProvider,
} from "./provider.js";

describe("getEnabledProviders", () => {
  it("returns [] when every provider is disabled (pre-rollout)", () => {
    expect(
      getEnabledProviders({
        liqpayEnabled: false,
        plataEnabled: false,
        stripeEnabled: false,
      }),
    ).toEqual([]);
  });

  it("returns ['liqpay','plata'] when both UA providers are enabled", () => {
    expect(
      getEnabledProviders({
        liqpayEnabled: true,
        plataEnabled: true,
        stripeEnabled: false,
      }),
    ).toEqual(["liqpay", "plata"]);
  });

  it("filters to only the enabled UA provider", () => {
    expect(
      getEnabledProviders({
        liqpayEnabled: true,
        plataEnabled: false,
        stripeEnabled: false,
      }),
    ).toEqual(["liqpay"]);
    expect(
      getEnabledProviders({
        liqpayEnabled: false,
        plataEnabled: true,
        stripeEnabled: false,
      }),
    ).toEqual(["plata"]);
  });

  // sec-33 / logic-33: Stripe раніше пропонувався кожному не-UA (або з
  // підробленим `X-Vercel-IP-Country`) попри `STRIPE_ENABLED=false`.
  it("never offers Stripe while STRIPE_ENABLED is off", () => {
    expect(
      getEnabledProviders({
        liqpayEnabled: false,
        plataEnabled: false,
        stripeEnabled: false,
      }),
    ).not.toContain("stripe");
  });

  it("appends Stripe after the UA providers only when STRIPE_ENABLED is on", () => {
    expect(
      getEnabledProviders({
        liqpayEnabled: true,
        plataEnabled: true,
        stripeEnabled: true,
      }),
    ).toEqual(["liqpay", "plata", "stripe"]);
    expect(
      getEnabledProviders({
        liqpayEnabled: false,
        plataEnabled: false,
        stripeEnabled: true,
      }),
    ).toEqual(["stripe"]);
  });
});

describe("resolveProvider", () => {
  it("returns the id when it is enabled", () => {
    expect(
      resolveProvider("liqpay", {
        liqpayEnabled: true,
        plataEnabled: true,
        stripeEnabled: false,
      }),
    ).toBe("liqpay");
  });

  it("rejects 'stripe' while STRIPE_ENABLED is off", () => {
    expect(() =>
      resolveProvider("stripe", {
        liqpayEnabled: true,
        plataEnabled: true,
        stripeEnabled: false,
      }),
    ).toThrow(ProviderNotAvailableError);
  });

  it("accepts 'stripe' when STRIPE_ENABLED is on", () => {
    expect(
      resolveProvider("stripe", {
        liqpayEnabled: false,
        plataEnabled: false,
        stripeEnabled: true,
      }),
    ).toBe("stripe");
  });

  it("rejects a provider whose flag is off", () => {
    expect(() =>
      resolveProvider("plata", {
        liqpayEnabled: true,
        plataEnabled: false,
        stripeEnabled: false,
      }),
    ).toThrow(ProviderNotAvailableError);
  });
});
