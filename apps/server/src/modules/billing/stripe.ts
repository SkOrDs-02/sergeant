import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPlan,
  BillingStatusResponse,
} from "@sergeant/shared";

const STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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

function getStripeSecretKey(): string {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new BillingConfigurationError("STRIPE_SECRET_KEY is not set");
  return key;
}

function getPriceId(plan: BillingPlan): string {
  const envName =
    plan === "plus" ? "STRIPE_PRICE_PLUS_MONTHLY" : "STRIPE_PRICE_PRO_MONTHLY";
  const priceId = process.env[envName];
  if (!priceId) throw new BillingConfigurationError(`${envName} is not set`);
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
    "line_items[0][price]": getPriceId(plan),
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

function normalizePlan(_raw: unknown): BillingPlan {
  // Pricing v3 (ADR-0051): Stripe sells Pro only; no 'plus' tier
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
      normalizePlan(metadata["plan"]),
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
      normalizePlan(metadata["plan"]),
      subscriptionStatus,
      getStripeObjectString(object, "customer"),
      subscriptionId,
      unixSecondsToDate(object["current_period_end"]),
      cancelAtPeriodEnd,
    ],
  );
}

export function verifyStripeSignature(
  rawPayload: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return process.env["NODE_ENV"] !== "production";
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
    if (object && typeof object === "object" && !Array.isArray(object)) {
      if (event.type === "checkout.session.completed") {
        await upsertCheckoutCompleted(client, object);
      } else if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        await upsertSubscriptionEvent(client, object);
      }
    }

    await client.query("COMMIT");
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
