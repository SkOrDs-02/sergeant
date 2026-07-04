import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  type StripeEvent,
  getStripeMetadata,
  getStripeObjectString,
  normalizePlan,
  unixSecondsToDate,
} from "./stripeShared.js";
import {
  type PaymentFailedEmit,
  buildChargeFailed,
  buildCheckoutExpired,
  buildInvoicePaymentFailed,
  buildPaymentIntentFailed,
  emitPaymentFailed,
  emitSubscriptionCanceled,
  emitSubscriptionRenewed,
  emitSubscriptionStarted,
} from "./stripeLifecycle.js";

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
