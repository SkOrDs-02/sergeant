import type { PoolClient } from "pg";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import {
  type StripeEvent,
  extractSubscriptionPricing,
  getMetadataUserId,
  getPostHogCapture,
  getStripeMetadata,
  getStripeNestedRecord,
  getStripeObjectString,
  isoOrNull,
  normalizePlan,
  unixSecondsToDate,
} from "./stripeShared.js";

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
    const result = await getPostHogCapture()({
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

export async function emitSubscriptionStarted(
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<void> {
  await captureLifecycle(event, object, ANALYTICS_EVENTS.SUBSCRIPTION_STARTED);
}

export async function emitSubscriptionRenewed(
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

export async function emitSubscriptionCanceled(
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

type PaymentFailedKind =
  "payment_intent" | "invoice" | "charge" | "checkout_expired";

export interface PaymentFailedEmit {
  distinctId: string;
  userResolved: boolean;
  properties: Record<string, unknown>;
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

export async function buildPaymentIntentFailed(
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

export async function buildInvoicePaymentFailed(
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

export async function buildChargeFailed(
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

export function buildCheckoutExpired(
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
export async function emitPaymentFailed(
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
    const result = await getPostHogCapture()({
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
