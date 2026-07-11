import { describe, expect, it, vi } from "vitest";
import type { BillingProvider } from "./provider.js";
import { stripeProvider } from "./stripeProvider.js";

describe("stripeProvider adapter", () => {
  it("implements the full BillingProvider contract (dormant, Phase 7)", () => {
    // Compile-time контракт + runtime-перевірка, що жоден метод не забутий.
    const p: BillingProvider = stripeProvider;
    expect(p.id).toBe("stripe");
    for (const method of [
      "createCheckoutSession",
      "createCustomerPortalSession",
      "getSubscriptionStatus",
      "verifyWebhookSignature",
      "processWebhook",
      "cancelSubscription",
    ] as const) {
      expect(typeof p[method]).toBe("function");
    }
  });

  it("cancelSubscription is a no-op when the user has no Stripe row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = { query } as any;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      stripeProvider.cancelSubscription(pool, "user_1"),
    ).resolves.toBeUndefined();
    // Ніякого виклику Stripe API без наявної підписки.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
