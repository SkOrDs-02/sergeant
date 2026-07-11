import { describe, expect, it } from "vitest";
import {
  ProviderNotAvailableError,
  getEnabledProviders,
  resolveProvider,
} from "./provider.js";

describe("getEnabledProviders", () => {
  it("returns [] for UA when both UA providers are disabled (pre-rollout)", () => {
    expect(
      getEnabledProviders({
        country: "UA",
        liqpayEnabled: false,
        plataEnabled: false,
      }),
    ).toEqual([]);
  });

  it("returns ['liqpay','plata'] for UA when both are enabled", () => {
    expect(
      getEnabledProviders({
        country: "UA",
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toEqual(["liqpay", "plata"]);
  });

  it("filters to only the enabled UA provider", () => {
    expect(
      getEnabledProviders({
        country: "UA",
        liqpayEnabled: true,
        plataEnabled: false,
      }),
    ).toEqual(["liqpay"]);
    expect(
      getEnabledProviders({
        country: "UA",
        liqpayEnabled: false,
        plataEnabled: true,
      }),
    ).toEqual(["plata"]);
  });

  it("keeps LiqPay before Plata (rollout order)", () => {
    expect(
      getEnabledProviders({
        country: "ua",
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toEqual(["liqpay", "plata"]);
  });

  it("never offers a UA provider to non-UA countries — Stripe only", () => {
    expect(
      getEnabledProviders({
        country: "US",
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toEqual(["stripe"]);
  });

  it("defaults to ['stripe'] when country is missing", () => {
    expect(
      getEnabledProviders({ liqpayEnabled: true, plataEnabled: true }),
    ).toEqual(["stripe"]);
    expect(
      getEnabledProviders({
        country: null,
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toEqual(["stripe"]);
  });
});

describe("resolveProvider", () => {
  it("returns the id when it is enabled for the country", () => {
    expect(
      resolveProvider("liqpay", {
        country: "UA",
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toBe("liqpay");
  });

  it("rejects 'stripe' for a UA user (Stripe is dormant for UA)", () => {
    expect(() =>
      resolveProvider("stripe", {
        country: "UA",
        liqpayEnabled: true,
        plataEnabled: true,
      }),
    ).toThrow(ProviderNotAvailableError);
  });

  it("rejects a provider whose flag is off", () => {
    expect(() =>
      resolveProvider("plata", {
        country: "UA",
        liqpayEnabled: true,
        plataEnabled: false,
      }),
    ).toThrow(ProviderNotAvailableError);
  });
});
