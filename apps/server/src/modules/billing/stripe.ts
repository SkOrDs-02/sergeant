import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPlan,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { env } from "../../env/env.js";
import { capturePostHogEvent } from "../../lib/posthogCapture.js";
import { logger } from "../../obs/logger.js";

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

interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
}

interface StripeSubscriptionPricing {
  priceCents: number | null;
  currency: string | null;
  cadence: string | null;
}

function extractSubscriptionPricing(
  object: Record<string, unknown>,
): StripeSubscriptionPricing {
  const items = object["items"];
  const data =
    items && typeof items === "object" && !Array.isArray(items)
      ? (items as Record<string, unknown>)["data"]
      : null;
  const first = Array.isArray(data) ? (data[0] as unknown) : null;
  const price =
    first && typeof first === "object" && !Array.isArray(first)
      ? ((first as Record<string, unknown>)["price"] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const recurring =
    price &&
    typeof price["recurring"] === "object" &&
    price["recurring"] !== null &&
    !Array.isArray(price["recurring"])
      ? (price["recurring"] as Record<string, unknown>)
      : undefined;
  return {
    priceCents:
      typeof price?.["unit_amount"] === "number"
        ? (price["unit_amount"] as number)
        : null,
    currency:
      typeof price?.["currency"] === "string"
        ? (price["currency"] as string).toUpperCase()
        : null,
    cadence:
      typeof recurring?.["interval"] === "string"
        ? (recurring["interval"] as string)
        : null,
  };
}

/**
 * Inject-point для unit-тестів. Production-код викликає `capturePostHogEvent`
 * напряму (default), але `stripe.test.ts` підмінює fetch через цей setter,
 * щоб НЕ stub-ити global `fetch` і не залежати від мережі.
 */
type CaptureFn = typeof capturePostHogEvent;
let captureImpl: CaptureFn = capturePostHogEvent;
export function __setPostHogCaptureForTesting(fn: CaptureFn | null): void {
  captureImpl = fn ?? capturePostHogEvent;
}

type LifecycleEvent =
  | typeof ANALYTICS_EVENTS.SUBSCRIPTION_STARTED
  | typeof ANALYTICS_EVENTS.SUBSCRIPTION_RENEWED
  | typeof ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED;

type CaptureFailureLog =
  | "subscription_started_capture_non_ok"
  | "subscription_started_capture_threw"
  | "subscription_renewed_capture_non_ok"
  | "subscription_renewed_capture_threw"
  | "subscription_canceled_capture_non_ok"
  | "subscription_canceled_capture_threw";

const LIFECYCLE_LOG_KEYS: Record<
  LifecycleEvent,
  { nonOk: CaptureFailureLog; threw: CaptureFailureLog }
> = {
  [ANALYTICS_EVENTS.SUBSCRIPTION_STARTED]: {
    nonOk: "subscription_started_capture_non_ok",
    threw: "subscription_started_capture_threw",
  },
  [ANALYTICS_EVENTS.SUBSCRIPTION_RENEWED]: {
    nonOk: "subscription_renewed_capture_non_ok",
    threw: "subscription_renewed_capture_threw",
  },
  [ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED]: {
    nonOk: "subscription_canceled_capture_non_ok",
    threw: "subscription_canceled_capture_threw",
  },
};

async function captureLifecycle(
  event: StripeEvent,
  object: Record<string, unknown>,
  eventName: LifecycleEvent,
  extraProperties: Record<string, unknown> = {},
): Promise<void> {
  const metadata = getStripeMetadata(object);
  const userId =
    typeof metadata["user_id"] === "string" ? metadata["user_id"] : null;
  if (!userId) {
    logger.warn({
      msg: "subscription_lifecycle_skipped_no_user",
      event_name: eventName,
      stripe_event_id: event.id,
    });
    return;
  }
  const subscriptionId = getStripeObjectString(object, "id");
  const status = getStripeObjectString(object, "status");
  const pricing = extractSubscriptionPricing(object);
  const plan = normalizePlan();
  const properties: Record<string, unknown> = {
    plan,
    cadence: pricing.cadence,
    source: "stripe_webhook",
    status,
    price_cents: pricing.priceCents,
    currency: pricing.currency,
    stripe_event_id: event.id,
    stripe_subscription_id: subscriptionId,
    ...extraProperties,
  };
  if (
    eventName !== ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED &&
    pricing.priceCents != null &&
    pricing.currency
  ) {
    // PostHog revenue analytics — `$revenue` super-property powers
    // MRR / LTV dashboards. Major-unit number (e.g. 7 for $7), не cents.
    // Skipped on cancellation: PostHog should not double-count cancel
    // events as revenue, and there is no fresh charge to attribute.
    properties["$revenue"] = pricing.priceCents / 100;
  }
  const logKeys = LIFECYCLE_LOG_KEYS[eventName];
  try {
    const result = await captureImpl({
      event: eventName,
      distinctId: userId,
      properties,
      uuid: event.id,
    });
    if (result.outcome !== "ok" && result.outcome !== "skipped") {
      logger.warn({
        msg: logKeys.nonOk,
        outcome: result.outcome,
        stripe_event_id: event.id,
      });
    }
  } catch (err) {
    // Analytics is best-effort; never break webhook processing on it.
    logger.warn({
      msg: logKeys.threw,
      stripe_event_id: event.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function emitSubscriptionStarted(
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<void> {
  await captureLifecycle(event, object, ANALYTICS_EVENTS.SUBSCRIPTION_STARTED);
}

async function emitSubscriptionRenewed(
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<void> {
  // `invoice.paid` (subscription cycle) hands us the parent subscription
  // record under `subscription` and the invoice line items under `lines`.
  // For revenue analytics we want the parent subscription's price / cadence,
  // which `extractSubscriptionPricing` already pulls from `items.data[0]`
  // — fall through to that path on `customer.subscription.updated`.
  await captureLifecycle(event, object, ANALYTICS_EVENTS.SUBSCRIPTION_RENEWED);
}

async function emitSubscriptionCanceled(
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<void> {
  const reason: "user" | "billing" | "expired" =
    getStripeObjectString(object, "status") === "unpaid"
      ? "billing"
      : object["cancellation_details"] &&
          typeof object["cancellation_details"] === "object" &&
          (object["cancellation_details"] as Record<string, unknown>)[
            "reason"
          ] === "cancellation_requested"
        ? "user"
        : "expired";
  await captureLifecycle(
    event,
    object,
    ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED,
    { reason },
  );
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

function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
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

function getStripeObjectString(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStripeMetadata(
  object: Record<string, unknown>,
): Record<string, unknown> {
  const metadata = object["metadata"];
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function unixSecondsToDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function normalizePlan(): BillingPlan {
  return "pro";
}

async function insertWebhookEvent(
  client: PoolClient,
  event: StripeEvent,
  rawPayload: Buffer | string,
): Promise<boolean> {
  // Use dedicated stripe_webhook_events table (migration 057) for idempotency
  void rawPayload; // payload stored in jsonb column via event object
  const result = await client.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.id, event.type, JSON.stringify(event)],
  );
  return result.rowCount === 1;
}

async function upsertCheckoutCompleted(
  client: PoolClient,
  object: Record<string, unknown>,
): Promise<void> {
  const metadata = getStripeMetadata(object);
  const userId =
    getStripeObjectString(object, "client_reference_id") ||
    (typeof metadata["user_id"] === "string" ? metadata["user_id"] : null);
  const sessionId = getStripeObjectString(object, "id");
  if (!userId || !sessionId) return;

  await client.query(
    `INSERT INTO subscriptions
       (user_id, provider, plan, status, provider_customer_id, provider_subscription_id)
     VALUES ($1, 'stripe', $2, 'active', $3, $4)
     ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       provider = EXCLUDED.provider,
       provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
       provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
       updated_at = NOW()`,
    [
      userId,
      normalizePlan(),
      getStripeObjectString(object, "customer"),
      getStripeObjectString(object, "subscription"),
    ],
  );
}

async function upsertSubscriptionEvent(
  client: PoolClient,
  object: Record<string, unknown>,
): Promise<void> {
  const metadata = getStripeMetadata(object);
  const userId =
    typeof metadata["user_id"] === "string" ? metadata["user_id"] : null;
  const subscriptionId = getStripeObjectString(object, "id");
  if (!userId || !subscriptionId) return;

  const subscriptionStatus =
    getStripeObjectString(object, "status") ?? "unknown";
  const cancelAtPeriodEnd = object["cancel_at_period_end"] === true;

  await client.query(
    `INSERT INTO subscriptions
       (user_id, provider, plan, status, provider_customer_id, provider_subscription_id,
        current_period_end, cancel_at_period_end)
     VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
       provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = NOW()`,
    [
      userId,
      normalizePlan(),
      subscriptionStatus,
      getStripeObjectString(object, "customer"),
      subscriptionId,
      unixSecondsToDate(object["current_period_end"]),
      cancelAtPeriodEnd,
    ],
  );
}

/**
 * Default replay-window tolerance for Stripe webhook timestamps, in seconds.
 * Matches the value `stripe-node` uses for `constructEvent` (300s = 5 min).
 * Override at runtime via `STRIPE_WEBHOOK_TOLERANCE_SECONDS` if your platform
 * has unusual clock skew; values <= 0 disable the check (NOT recommended).
 */
export const DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

function getStripeWebhookToleranceSeconds(): number {
  const raw = process.env["STRIPE_WEBHOOK_TOLERANCE_SECONDS"];
  if (!raw) return DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  return parsed;
}

/**
 * Verify a Stripe webhook signature.
 *
 * Hardening (T2 audit findings 1 & 2):
 *   1. If `STRIPE_WEBHOOK_SECRET` is unset we ALWAYS return `false`. The
 *      previous behaviour of accepting any payload in non-production
 *      effectively turned every staging / preview deploy into an
 *      unauthenticated write endpoint into the billing DB.
 *   2. The signed payload includes a timestamp; we enforce a tolerance
 *      window (`STRIPE_WEBHOOK_TOLERANCE_SECONDS`, default 300s) so that
 *      a captured signed body cannot be replayed indefinitely.
 */
export function verifyStripeSignature(
  rawPayload: Buffer,
  signatureHeader: string | undefined,
  options: { now?: () => number; toleranceSeconds?: number } = {},
): boolean {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return false;
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value] as const;
    }),
  );
  const timestamp = parts.get("t");
  const expected = parts.get("v1");
  if (!timestamp || !expected) return false;

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return false;
  const tolerance =
    options.toleranceSeconds ?? getStripeWebhookToleranceSeconds();
  if (tolerance > 0) {
    const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > tolerance) return false;
  }

  const actual = createHmac("sha256", secret)
    .update(`${timestamp}.${rawPayload.toString("utf8")}`)
    .digest("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

type PaymentFailedKind =
  | "payment_intent"
  | "invoice"
  | "charge"
  | "checkout_expired";

interface PaymentFailedEmit {
  distinctId: string;
  userResolved: boolean;
  properties: Record<string, unknown>;
}

function getStripeNestedRecord(
  object: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = object[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getMetadataUserId(object: Record<string, unknown>): string | null {
  const metadata = getStripeMetadata(object);
  return typeof metadata["user_id"] === "string" ? metadata["user_id"] : null;
}

/**
 * Resolve the Better Auth user id behind a Stripe customer through the
 * `subscriptions.provider_customer_id` mapping. Needed for failure events on
 * objects Stripe creates itself (`payment_intent`, `charge`, dunning
 * `invoice`) — those never carry our `metadata.user_id`, so without this
 * lookup the analytics event would be fully anonymous. Returns `null` when the
 * customer has no subscription row yet (e.g. a first-charge decline before any
 * row was written by `checkout.session.completed`).
 */
async function resolveUserIdByStripeCustomer(
  client: PoolClient,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  const { rows } = await client.query<{ user_id: string }>(
    `SELECT user_id
       FROM subscriptions
      WHERE provider = 'stripe'
        AND provider_customer_id = $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [customerId],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Pick the PostHog `distinctId` for a failure event. A resolved Better Auth id
 * is preferred; otherwise fall back to a namespaced Stripe identifier so the
 * event still lands and aggregate drop-rate / 3DS-fail-rate stay countable
 * (PostHog attributes it to an anonymous person). The `stripe_customer:` form
 * groups repeated failures from the same payer; `stripe_event:` is the last
 * resort when even the customer is absent.
 */
function resolveFailureDistinctId(
  userId: string | null,
  customerId: string | null,
  event: StripeEvent,
): { distinctId: string; userResolved: boolean } {
  if (userId) return { distinctId: userId, userResolved: true };
  if (customerId) {
    return { distinctId: `stripe_customer:${customerId}`, userResolved: false };
  }
  return { distinctId: `stripe_event:${event.id}`, userResolved: false };
}

async function buildPaymentIntentFailed(
  client: PoolClient,
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<PaymentFailedEmit> {
  const error = getStripeNestedRecord(object, "last_payment_error");
  const errorCode = getStripeObjectString(error, "code");
  const customerId = getStripeObjectString(object, "customer");
  const userId =
    getMetadataUserId(object) ??
    (await resolveUserIdByStripeCustomer(client, customerId));
  const { distinctId, userResolved } = resolveFailureDistinctId(
    userId,
    customerId,
    event,
  );
  return {
    distinctId,
    userResolved,
    properties: {
      kind: "payment_intent" satisfies PaymentFailedKind,
      error_code: errorCode,
      decline_code: getStripeObjectString(error, "decline_code"),
      // 3DS / SCA challenge the cardholder failed or abandoned.
      is_3ds: errorCode === "payment_intent_authentication_failure",
      stripe_customer_id: customerId,
      stripe_payment_intent_id: getStripeObjectString(object, "id"),
    },
  };
}

async function buildInvoicePaymentFailed(
  client: PoolClient,
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<PaymentFailedEmit> {
  const customerId = getStripeObjectString(object, "customer");
  const userId =
    getMetadataUserId(object) ??
    (await resolveUserIdByStripeCustomer(client, customerId));
  const { distinctId, userResolved } = resolveFailureDistinctId(
    userId,
    customerId,
    event,
  );
  const attemptCount = object["attempt_count"];
  return {
    distinctId,
    userResolved,
    properties: {
      kind: "invoice" satisfies PaymentFailedKind,
      attempt_count: typeof attemptCount === "number" ? attemptCount : null,
      // Stripe Smart Retries schedule; null once Stripe gives up (→ churn).
      next_payment_attempt: isoOrNull(
        unixSecondsToDate(object["next_payment_attempt"]),
      ),
      stripe_customer_id: customerId,
      stripe_invoice_id: getStripeObjectString(object, "id"),
      stripe_subscription_id: getStripeObjectString(object, "subscription"),
    },
  };
}

async function buildChargeFailed(
  client: PoolClient,
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<PaymentFailedEmit> {
  const customerId = getStripeObjectString(object, "customer");
  const userId =
    getMetadataUserId(object) ??
    (await resolveUserIdByStripeCustomer(client, customerId));
  const { distinctId, userResolved } = resolveFailureDistinctId(
    userId,
    customerId,
    event,
  );
  const outcome = getStripeNestedRecord(object, "outcome");
  return {
    distinctId,
    userResolved,
    properties: {
      kind: "charge" satisfies PaymentFailedKind,
      failure_code: getStripeObjectString(object, "failure_code"),
      network_decline_code: getStripeObjectString(
        outcome,
        "network_decline_code",
      ),
      stripe_customer_id: customerId,
      stripe_charge_id: getStripeObjectString(object, "id"),
    },
  };
}

function buildCheckoutExpired(
  event: StripeEvent,
  object: Record<string, unknown>,
): PaymentFailedEmit {
  // Unlike payment_intent / charge, an expired Checkout Session still carries
  // our `client_reference_id` + `metadata.user_id` — no DB lookup needed.
  const userId =
    getStripeObjectString(object, "client_reference_id") ??
    getMetadataUserId(object);
  const customerId = getStripeObjectString(object, "customer");
  const { distinctId, userResolved } = resolveFailureDistinctId(
    userId,
    customerId,
    event,
  );
  return {
    distinctId,
    userResolved,
    properties: {
      kind: "checkout_expired" satisfies PaymentFailedKind,
      stripe_customer_id: customerId,
      stripe_session_id: getStripeObjectString(object, "id"),
    },
  };
}

/**
 * POST-COMMIT, best-effort emit for a negative Stripe payment signal. Mirrors
 * `captureLifecycle`: a Pino `warn` always fires (operational visibility even
 * when PostHog is down) and the analytics capture is wrapped so a network
 * failure never breaks webhook processing. No card data / PII is logged —
 * only Stripe decline codes and ids; `uuid = event.id` dedupes PostHog-side.
 */
async function emitPaymentFailed(
  event: StripeEvent,
  emit: PaymentFailedEmit,
): Promise<void> {
  const properties: Record<string, unknown> = {
    source: "stripe_webhook",
    stripe_event_id: event.id,
    user_resolved: emit.userResolved,
    ...emit.properties,
  };
  logger.warn({
    msg: "stripe_payment_failed",
    stripe_event_id: event.id,
    kind: properties["kind"],
    error_code: properties["error_code"],
    decline_code: properties["decline_code"],
    is_3ds: properties["is_3ds"],
    failure_code: properties["failure_code"],
    network_decline_code: properties["network_decline_code"],
    attempt_count: properties["attempt_count"],
    user_resolved: emit.userResolved,
  });
  try {
    const result = await captureImpl({
      event: ANALYTICS_EVENTS.PAYMENT_FAILED,
      distinctId: emit.distinctId,
      properties,
      uuid: event.id,
    });
    if (result.outcome !== "ok" && result.outcome !== "skipped") {
      logger.warn({
        msg: "payment_failed_capture_non_ok",
        outcome: result.outcome,
        stripe_event_id: event.id,
      });
    }
  } catch (err) {
    // Analytics is best-effort; never break webhook processing on it.
    logger.warn({
      msg: "payment_failed_capture_threw",
      stripe_event_id: event.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function processStripeWebhook(
  pool: Pool,
  event: StripeEvent,
  rawPayload: Buffer | string,
): Promise<{ ok: true; duplicate: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const shouldProcess = await insertWebhookEvent(client, event, rawPayload);
    if (!shouldProcess) {
      await client.query("COMMIT");
      return { ok: true, duplicate: true };
    }

    const object = event.data?.object;
    type LifecycleEmit = "started" | "renewed" | "canceled";
    let lifecycleEmit: LifecycleEmit | null = null;
    let paymentFailedEmit: PaymentFailedEmit | null = null;
    if (object && typeof object === "object" && !Array.isArray(object)) {
      if (event.type === "checkout.session.completed") {
        await upsertCheckoutCompleted(client, object);
      } else if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        await upsertSubscriptionEvent(client, object);
        if (event.type === "customer.subscription.created") {
          lifecycleEmit = "started";
        } else if (event.type === "customer.subscription.updated") {
          // `customer.subscription.updated` fires on renewal (Stripe rolls
          // `current_period_end` forward) and on cancellation flag flips.
          // We split: status='canceled' → canceled event; otherwise treat
          // a period_end bump after the previous tick as a renewal. The
          // simpler signal here — status now reads 'active' and the
          // event ID hash differs — is good enough for the MRR funnel
          // because PostHog dedupes via `uuid = event.id`.
          if (getStripeObjectString(object, "status") === "canceled") {
            lifecycleEmit = "canceled";
          } else {
            lifecycleEmit = "renewed";
          }
        } else {
          lifecycleEmit = "canceled";
        }
      } else if (event.type === "payment_intent.payment_failed") {
        paymentFailedEmit = await buildPaymentIntentFailed(
          client,
          event,
          object,
        );
      } else if (event.type === "invoice.payment_failed") {
        paymentFailedEmit = await buildInvoicePaymentFailed(
          client,
          event,
          object,
        );
      } else if (event.type === "charge.failed") {
        paymentFailedEmit = await buildChargeFailed(client, event, object);
      } else if (event.type === "checkout.session.expired") {
        paymentFailedEmit = buildCheckoutExpired(event, object);
      }
    }

    await client.query("COMMIT");
    // PostHog subscription lifecycle capture — POST-COMMIT, щоб не блокувати
    // транзакцію і щоб мережева помилка PostHog НЕ призводила до rollback-у
    // (DB row уже записано — idempotency по `stripe_webhook_events.event_id`
    // забезпечує одноразовість). Idempotency PostHog-у — через `uuid =
    // event.id`. Викликається тільки коли подія НЕ duplicate (above).
    if (lifecycleEmit && object) {
      if (lifecycleEmit === "started") {
        await emitSubscriptionStarted(event, object);
      } else if (lifecycleEmit === "renewed") {
        await emitSubscriptionRenewed(event, object);
      } else {
        await emitSubscriptionCanceled(event, object);
      }
    }
    // Negative-signal capture — same POST-COMMIT, best-effort contract as the
    // lifecycle block above. Only one of `lifecycleEmit` / `paymentFailedEmit`
    // is ever set per event (mutually-exclusive event types).
    if (paymentFailedEmit) {
      await emitPaymentFailed(event, paymentFailedEmit);
    }
    return { ok: true, duplicate: false };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
}
