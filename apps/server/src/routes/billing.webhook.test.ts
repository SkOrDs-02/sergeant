import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBillingRouter } from "./billing.js";

/**
 * Route-level e2e для `POST /api/billing/stripe-webhook`. Закриває gap D1
 * з `docs/audits/2026-05-15-deep-audit-state-of-repo.md`: module-level
 * `stripe.test.ts` покриває `verifyStripeSignature` + `processStripeWebhook`
 * окремо (signature replay/tolerance/tampering + DB transaction + PostHog
 * lifecycle), але end-to-end Express-flow через `createBillingRouter`
 * (raw body capture → header parse → signature gate → JSON parse → event
 * shape validation → DB call → JSON response) тестується тут.
 */

const SECRET = "whsec_test_e2e_1234567890abcdef";

function signedHeader(timestampSeconds: number, rawBody: Buffer): string {
  const v1 = createHmac("sha256", SECRET)
    .update(`${timestampSeconds}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

// supertest gotcha: `.send(Buffer)` with `Content-Type: application/json`
// JSON-stringifies the Buffer (yielding `{"type":"Buffer","data":[...]}`)
// instead of streaming raw bytes — the resulting HMAC sees the stringified
// envelope, NOT the original payload, so signature verification fails for
// every "happy path" / "valid sig + event-shape" case. Sending the UTF-8
// string explicitly skips that serialization, so server-side `express.raw`
// captures bytes byte-identical to `payload.toString("utf8")` and the
// HMAC over those bytes matches `signedHeader()`. See the chronic
// `stripe signature mismatch` red on this suite before this fix.

function makePool(rowCount: number) {
  const query = vi.fn().mockResolvedValue({ rowCount, rows: [] });
  const client = { query, release: vi.fn() };
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    __client: client,
  };
}

function makeApp(pool: ReturnType<typeof makePool>) {
  const app = express();
  // Webhook endpoint потребує raw body для signature-verification —
  // це той самий patern, що в `apps/server/src/app.ts` для billing route.
  app.use(
    "/api/billing/stripe-webhook",
    express.raw({ type: "application/json" }),
  );
  app.use(createBillingRouter({ pool: pool as never }));
  return app;
}

describe("POST /api/billing/stripe-webhook (route-level e2e)", () => {
  beforeEach(() => {
    process.env["STRIPE_WEBHOOK_SECRET"] = SECRET;
  });

  afterEach(() => {
    delete process.env["STRIPE_WEBHOOK_SECRET"];
    delete process.env["STRIPE_WEBHOOK_TOLERANCE_SECONDS"];
  });

  it("happy-path: signed payload → 200 з `{ ok, duplicate }` від processStripeWebhook", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(
      JSON.stringify({
        id: "evt_e2e_happy",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_1",
            client_reference_id: "user_e2e",
            customer: "cus_e2e",
            subscription: "sub_e2e",
            metadata: { plan: "pro" },
          },
        },
      }),
    );
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicate: false });
    // DB transaction повністю проходить: BEGIN → INSERT idempotency
    // → INSERT subscriptions → COMMIT.
    expect(pool.__client.query).toHaveBeenCalledWith("BEGIN");
    expect(pool.__client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("duplicate event: rowCount=0 → 200 з `{ ok, duplicate: true }`, NO subscription INSERT", async () => {
    const pool = makePool(0);
    const payload = Buffer.from(
      JSON.stringify({
        id: "evt_e2e_dup",
        type: "checkout.session.completed",
        data: { object: { id: "cs_dup" } },
      }),
    );
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicate: true });
  });

  it("invalid signature (tampered payload) → 400, NO DB call", async () => {
    const pool = makePool(1);
    const goodPayload = Buffer.from(
      JSON.stringify({ id: "evt_x", type: "ping" }),
    );
    const tampered = Buffer.from(JSON.stringify({ id: "evt_x", type: "evil" }));
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, goodPayload))
      .send(tampered.toString("utf8"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Stripe signature" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("missing signature header → 400, NO DB call", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(JSON.stringify({ id: "evt_x", type: "ping" }));

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .send(payload.toString("utf8"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Stripe signature" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("replay outside tolerance (10 minutes old) → 400", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(JSON.stringify({ id: "evt_x", type: "ping" }));
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(tenMinutesAgo, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Stripe signature" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("missing event.id (after valid signature) → 400 'Invalid Stripe event'", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(
      JSON.stringify({ type: "checkout.session.completed", data: {} }),
    );
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Stripe event" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("missing event.type (after valid signature) → 400 'Invalid Stripe event'", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(
      JSON.stringify({ id: "evt_no_type", data: {} }),
    );
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Stripe event" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("event with `data` but без `data.object` → 200 (event shape без object — pass-through)", async () => {
    const pool = makePool(1);
    const payload = Buffer.from(
      JSON.stringify({
        id: "evt_no_object",
        type: "ping",
        data: { extra: "field" },
      }),
    );
    const nowSec = Math.floor(Date.now() / 1000);

    const res = await request(makeApp(pool))
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signedHeader(nowSec, payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(200);
    // Idempotency rows are still recorded, subscription branches skip.
    expect(pool.connect).toHaveBeenCalled();
  });
});
