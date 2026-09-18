/**
 * Stripe as a {@link BillingProvider} — thin adapter over the existing
 * `./stripe.ts` functions (Phase 7 UA billing).
 *
 * Stripe стає **dormant** у Phase 7: `getEnabledProviders('UA')` ніколи не
 * пропонує його українцям, а `/api/billing/stripe-webhook` лишається
 * власним route-ом (не через registry). Цей адаптер існує, щоб
 * `providerRegistry` мав повний `Record<ProviderId, BillingProvider>` і щоб
 * `cancelSubscription` працював уніфіковано (deletion юзера / admin-cancel).
 *
 * Логіка не переписується — лише обгортка навколо наявних функцій.
 */
import type { Pool } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import { env } from "../../env/env.js";
import type {
  BillingProvider,
  ProviderCheckoutInput,
  ProviderPortalInput,
} from "./provider.js";
import {
  createCheckoutSession as stripeCreateCheckout,
  createCustomerPortalSession as stripeCreatePortal,
  getSubscriptionStatus as stripeGetStatus,
  processStripeWebhook,
  verifyStripeSignature,
} from "./stripe.js";

const STRIPE_SUBSCRIPTIONS_URL = "https://api.stripe.com/v1/subscriptions";

export const stripeProvider: BillingProvider = {
  id: "stripe",

  createCheckoutSession(
    input: ProviderCheckoutInput,
  ): Promise<BillingCheckoutResponse> {
    return stripeCreateCheckout(input);
  },

  createCustomerPortalSession(
    input: ProviderPortalInput,
  ): Promise<BillingPortalResponse> {
    return stripeCreatePortal({ pool: input.pool, userId: input.user.id });
  },

  getSubscriptionStatus(
    pool: Pool,
    userId: string,
  ): Promise<BillingStatusResponse> {
    return stripeGetStatus(pool, userId);
  },

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyStripeSignature(Buffer.from(rawBody, "utf8"), signature);
  },

  async processWebhook(pool: Pool, rawBody: string): Promise<void> {
    const raw = Buffer.from(rawBody, "utf8");
    const event = JSON.parse(rawBody) as {
      id?: unknown;
      type?: unknown;
      data?: unknown;
    };
    if (typeof event.id !== "string" || typeof event.type !== "string") return;
    const stripeEvent =
      event.data && typeof event.data === "object"
        ? {
            id: event.id,
            type: event.type,
            data: event.data as { object?: Record<string, unknown> },
          }
        : { id: event.id, type: event.type };
    await processStripeWebhook(pool, stripeEvent, raw);
  },

  async cancelSubscription(pool: Pool, userId: string): Promise<void> {
    const { rows } = await pool.query<{
      provider_subscription_id: string | null;
    }>(
      `SELECT provider_subscription_id
         FROM subscriptions
        WHERE user_id = $1 AND provider = 'stripe'
          AND status IN ('active', 'trialing', 'past_due')
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId],
    );
    const subscriptionId = rows[0]?.provider_subscription_id;
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!subscriptionId || !secretKey) return; // no-op — DB-side cancel covers it

    // `cancel_at_period_end=true` — доступ до кінця оплаченого періоду
    // (паритет із LiqPay/Plata cancel-семантикою, ADR-1.11).
    const body = new URLSearchParams({ cancel_at_period_end: "true" });
    const response = await fetch(
      `${STRIPE_SUBSCRIPTIONS_URL}/${subscriptionId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      throw new Error(`Stripe cancel failed: HTTP ${response.status}`);
    }
    await pool.query(
      `UPDATE subscriptions
          SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'stripe'
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId],
    );
  },
};
