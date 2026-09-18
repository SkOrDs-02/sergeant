/**
 * Integration tests for `processStripeWebhook` + route-level signature gate.
 *
 * Uses a real Postgres container (pgvector/pg17) so SQL-level invariants are
 * verified:
 *   1. checkout.session.completed creates both a stripe_webhook_events row
 *      (idempotency) AND a subscriptions row (FK-bound to "user").
 *   2. Sending the same event_id twice returns { duplicate: true } and leaves
 *      only one row in stripe_webhook_events.
 *   3. An invalid Stripe signature causes the route to return 400 before any
 *      DB write happens.
 *
 * PostHog capture (emitSubscriptionStarted etc.) is suppressed via
 * __setPostHogCaptureForTesting so there are no external HTTP calls.
 */

import { createHmac } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";
import { processStripeWebhook } from "./stripeWebhook.js";
import { __setPostHogCaptureForTesting } from "./stripeShared.js";
import { errorHandler } from "../../http/errorHandler.js";

let harness: IntegrationHarness;
let dockerAvailable = false;

const USER_ID = "u_stripe_intg_01";
const WEBHOOK_SECRET = "whsec_integration_test_abc123";

function signPayload(rawBody: Buffer): string {
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${ts}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return `t=${ts},v1=${v1}`;
}

beforeAll(async () => {
  // Suppress PostHog network calls — these tests verify DB writes only.
  __setPostHogCaptureForTesting(vi.fn().mockResolvedValue({ outcome: "ok" }));
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[stripeWebhook integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  __setPostHogCaptureForTesting(null);
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_ID);
});

describe("stripeWebhook — integration (real Postgres)", () => {
  it(
    "checkout.session.completed → idempotency row + subscriptions row",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const event = {
        id: "evt_intg_checkout_001",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_intg_001",
            client_reference_id: USER_ID,
            customer: "cus_intg_001",
            subscription: "sub_intg_001",
            metadata: { plan: "pro" },
          },
        },
      };

      const result = await processStripeWebhook(
        harness.pool,
        event,
        Buffer.from(JSON.stringify(event)),
      );

      expect(result).toEqual({ ok: true, duplicate: false });

      // Idempotency record must exist.
      const { rows: evtRows } = await harness.pool.query<{
        event_id: string;
        event_type: string;
      }>(
        `SELECT event_id, event_type FROM stripe_webhook_events WHERE event_id = $1`,
        ["evt_intg_checkout_001"],
      );
      expect(evtRows).toHaveLength(1);
      expect(evtRows[0]!.event_type).toBe("checkout.session.completed");

      // Subscription row must be written with FK to user.
      const { rows: subRows } = await harness.pool.query<{
        user_id: string;
        plan: string;
        status: string;
        provider: string;
        provider_customer_id: string;
        provider_subscription_id: string;
      }>(
        `SELECT user_id, plan, status, provider,
                provider_customer_id, provider_subscription_id
           FROM subscriptions WHERE user_id = $1`,
        [USER_ID],
      );
      expect(subRows).toHaveLength(1);
      expect(subRows[0]!.plan).toBe("pro");
      expect(subRows[0]!.status).toBe("active");
      expect(subRows[0]!.provider).toBe("stripe");
      expect(subRows[0]!.provider_customer_id).toBe("cus_intg_001");
      expect(subRows[0]!.provider_subscription_id).toBe("sub_intg_001");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "duplicate event id → { duplicate: true }, no double write",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const event = {
        id: "evt_intg_dup_001",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_intg_dup",
            client_reference_id: USER_ID,
            customer: "cus_intg_dup",
            subscription: "sub_intg_dup",
            metadata: {},
          },
        },
      };
      const raw = Buffer.from(JSON.stringify(event));

      const r1 = await processStripeWebhook(harness.pool, event, raw);
      expect(r1).toEqual({ ok: true, duplicate: false });

      const r2 = await processStripeWebhook(harness.pool, event, raw);
      expect(r2).toEqual({ ok: true, duplicate: true });

      // Exactly one idempotency row — no double insertion.
      const { rows } = await harness.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM stripe_webhook_events WHERE event_id = $1`,
        ["evt_intg_dup_001"],
      );
      expect(Number(rows[0]!.c)).toBe(1);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "invalid signature → 400, no DB writes",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      process.env["STRIPE_WEBHOOK_SECRET"] = WEBHOOK_SECRET;
      try {
        // Dynamically import AFTER setting env so billing route can read the
        // secret. Each integration test file runs in its own fork (isolated
        // module cache), so this import is always fresh.
        const { createBillingRouter } = await import("../../routes/billing.js");

        const app = express();
        app.use(
          "/api/billing/stripe-webhook",
          express.raw({ type: "application/json" }),
        );
        app.use(createBillingRouter({ pool: harness.pool }));
        // Match the production app: route-level ValidationError instances are
        // serialized by the central handler instead of Express' empty test body.
        app.use(errorHandler);

        // Sign a _different_ payload than what we actually send.
        const goodPayload = Buffer.from(
          JSON.stringify({ id: "evt_good", type: "ping" }),
        );
        const tamperedPayload = Buffer.from(
          JSON.stringify({ id: "evt_tampered", type: "evil" }),
        );
        const sig = signPayload(goodPayload);

        const res = await request(app)
          .post("/api/billing/stripe-webhook")
          .set("Content-Type", "application/json")
          .set("stripe-signature", sig)
          .send(tamperedPayload.toString("utf8"));

        expect(res.status).toBe(400);
        expect(res.body).toEqual(
          expect.objectContaining({
            error: "Invalid Stripe signature",
            message: "Invalid Stripe signature",
          }),
        );

        // No rows must have been written.
        const { rows } = await harness.pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM stripe_webhook_events
           WHERE event_id IN ('evt_tampered', 'evt_good')`,
        );
        expect(Number(rows[0]!.c)).toBe(0);
      } finally {
        delete process.env["STRIPE_WEBHOOK_SECRET"];
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
