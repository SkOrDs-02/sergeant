import type { Pool } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPlan,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import { env } from "../../env/env.js";
import { isoOrNull } from "./stripeShared.js";

// Stripe webhook (`verifyStripeSignature` / `processStripeWebhook` /
// `DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS`) винесено у `./stripeWebhook.ts`,
// PostHog lifecycle + payment-failed capture — у `./stripeLifecycle.ts`,
// а спільні helper-и/типи/PostHog-capture setter — у `./stripeShared.ts`.
// Re-export нижче зберігає імпорт-шлях `billing/stripe.js` для routes і тестів
// (Hard Rule #18 — тримає stripe.ts під module-size cap).
export {
  DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  processStripeWebhook,
  verifyStripeSignature,
} from "./stripeWebhook.js";
export { __setPostHogCaptureForTesting } from "./stripeShared.js";

const STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_BILLING_PORTAL_URL =
  "https://api.stripe.com/v1/billing_portal/sessions";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
// Customers in `past_due` haven't churned yet — they should still be able
// to fix their payment method via the Customer Portal, otherwise the only
// escape hatch is contacting support. Mirrors the SQL filter in
// `createCustomerPortalSession`.
const PORTAL_ELIGIBLE_STATUSES = ["active", "trialing", "past_due"] as const;

interface SessionUser {
  id: string;
  email?: string | null;
}

interface CheckoutInput {
  pool: Pool;
  user: SessionUser;
  plan: BillingPlan;
}

interface StripeCheckoutSession {
  id: string;
  url: string;
  customer?: string | null;
}

interface BillingRow {
  id: string | number;
  provider: "stripe";
  plan: BillingPlan;
  status: string;
  current_period_end: Date | string | null;
}

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

/**
 * Thrown when a user without an active Stripe customer record asks for a
 * Customer Portal session. The route handler maps this to `409
 * NO_BILLING_CUSTOMER` so the web client can prompt them to start a
 * checkout flow instead.
 */
export class NoBillingCustomerError extends Error {
  constructor(message = "User has no billing customer record") {
    super(message);
    this.name = "NoBillingCustomerError";
  }
}

function getStripeSecretKey(): string {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingConfigurationError("STRIPE_SECRET_KEY is not set");
  return key;
}

function getPriceId(): string {
  // Pricing v3 (ADR-0051): Stripe sells Pro only.
  // P0-7 (docs/audits/2026-05-13-revenue-monetization-roast.md): read from the
  // Zod-validated `env` so the `price_*` format is checked up-front and
  // `assertStartupEnv` can refuse to boot when billing is wired but the price
  // ID is missing.
  const priceId = env.STRIPE_PRICE_ID_PRO_MONTHLY;
  if (!priceId) {
    throw new BillingConfigurationError(
      "STRIPE_PRICE_ID_PRO_MONTHLY is not set",
    );
  }
  return priceId;
}

function getAppBaseUrl(): string {
  return (
    process.env["PUBLIC_WEB_BASE_URL"] ||
    process.env["VITE_PUBLIC_APP_URL"] ||
    process.env["BETTER_AUTH_URL"] ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
}

function getStripeMode(secretKey: string): "test" | "live" {
  return secretKey.startsWith("sk_live_") ? "live" : "test";
}

function serializeBillingRow(row: BillingRow | null): BillingStatusResponse {
  return {
    subscription: row
      ? {
          id: Number(row.id),
          provider: row.provider,
          plan: row.plan,
          status: row.status,
          active: ACTIVE_STATUSES.has(row.status),
          currentPeriodEnd: isoOrNull(row.current_period_end),
        }
      : {
          id: null,
          provider: null,
          plan: null,
          status: null,
          active: false,
          currentPeriodEnd: null,
        },
  };
}

async function createStripeCheckoutSession({
  user,
  plan,
}: Pick<CheckoutInput, "user" | "plan">): Promise<{
  mode: "test" | "live";
  session: StripeCheckoutSession;
}> {
  const secretKey = getStripeSecretKey();
  const baseUrl = getAppBaseUrl();
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${baseUrl}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?checkout=cancel`,
    client_reference_id: user.id,
    customer_email: user.email ?? "",
    "line_items[0][price]": getPriceId(),
    "line_items[0][quantity]": "1",
    "metadata[user_id]": user.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][plan]": plan,
  });
  if (!user.email) body.delete("customer_email");

  const response = await fetch(STRIPE_CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as Partial<StripeCheckoutSession> & {
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message || "Stripe checkout failed");
  }

  return {
    mode: getStripeMode(secretKey),
    session: {
      id: payload.id,
      url: payload.url,
      customer: payload.customer ?? null,
    },
  };
}

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<BillingCheckoutResponse> {
  const { session, mode } = await createStripeCheckoutSession(input);
  // Subscription row is created by the checkout.session.completed webhook (idempotent).
  // No INSERT here — 'incomplete'/'checkout_created' pseudo-status has no place in subscriptions table.
  return { ok: true, mode, sessionId: session.id, url: session.url };
}

interface StripePortalSession {
  id: string;
  url: string;
}

async function createStripePortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams({
    customer: customerId,
    return_url: returnUrl,
  });

  const response = await fetch(STRIPE_BILLING_PORTAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as Partial<StripePortalSession> & {
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message || "Stripe portal session failed");
  }
  return { id: payload.id, url: payload.url };
}

/**
 * Look up the most relevant Stripe customer id for `userId` and create a
 * short-lived Customer Portal session pointed at the app's pricing page.
 *
 * Pre-conditions:
 *   - `STRIPE_SECRET_KEY` must be set (else `BillingConfigurationError`).
 *   - User must have a `subscriptions` row in
 *     `(active | trialing | past_due)` carrying a non-null
 *     `provider_customer_id` (else `NoBillingCustomerError`).
 *
 * Return URL goes back to `/settings` so that, after the user closes the
 * portal, the web app can refetch `billing.status` and reflect any plan
 * change immediately. Stripe webhooks update DB independently — the return
 * URL is purely UX glue.
 */
export async function createCustomerPortalSession({
  pool,
  userId,
}: {
  pool: Pool;
  userId: string;
}): Promise<BillingPortalResponse> {
  // Ensure Stripe is configured before we touch the DB — keeps the error
  // surface symmetric with `createCheckoutSession` and avoids leaking a
  // 500 from `fetch()` failing on an empty Authorization header.
  getStripeSecretKey();

  const { rows } = await pool.query<{ provider_customer_id: string | null }>(
    `SELECT provider_customer_id
       FROM subscriptions
      WHERE user_id = $1
        AND provider = 'stripe'
        AND status = ANY($2::text[])
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, [...PORTAL_ELIGIBLE_STATUSES]],
  );
  const customerId = rows[0]?.provider_customer_id;
  if (!customerId) {
    throw new NoBillingCustomerError();
  }

  const baseUrl = getAppBaseUrl();
  const { url } = await createStripePortalSession({
    customerId,
    returnUrl: `${baseUrl}/settings?billing=portal-return`,
  });
  return { ok: true, url };
}

export async function getSubscriptionStatus(
  pool: Pool,
  userId: string,
): Promise<BillingStatusResponse> {
  const { rows } = await pool.query<BillingRow>(
    `SELECT id, provider, plan, status, current_period_end
       FROM subscriptions
      WHERE user_id = $1
      ORDER BY
        CASE WHEN status IN ('active', 'trialing') THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT 1`,
    [userId],
  );
  return serializeBillingRow(rows[0] ?? null);
}
