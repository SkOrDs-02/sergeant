import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { liqpayProvider, NotImplementedError } from "./liqpay.js";

// Phase 7 scaffold: every method must throw NotImplementedError until the
// live LiqPay integration lands. These tests pin the contract so a future
// partial implementation can't silently ship a half-wired provider.
const fakePool = {} as Pool;
const fakeUser = { id: "user-1", email: "u@example.com" };

describe("liqpayProvider (scaffold)", () => {
  it("identifies itself as 'liqpay'", () => {
    expect(liqpayProvider.id).toBe("liqpay");
  });

  it("createCheckoutSession throws NotImplementedError", async () => {
    await expect(
      liqpayProvider.createCheckoutSession({
        pool: fakePool,
        user: fakeUser,
        plan: "pro",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("createCustomerPortalSession throws NotImplementedError", async () => {
    await expect(
      liqpayProvider.createCustomerPortalSession({
        pool: fakePool,
        user: fakeUser,
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("getSubscriptionStatus throws NotImplementedError", async () => {
    await expect(
      liqpayProvider.getSubscriptionStatus(fakePool, "user-1"),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("verifyWebhookSignature throws NotImplementedError", () => {
    expect(() => liqpayProvider.verifyWebhookSignature("{}", "sig")).toThrow(
      NotImplementedError,
    );
  });

  it("processWebhook throws NotImplementedError", async () => {
    await expect(
      liqpayProvider.processWebhook(fakePool, "{}"),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
