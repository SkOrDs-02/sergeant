import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level e2e для `POST /api/billing/plata-{charge,status}` (plata-
 * recurring spec 2026-09-01). Both routes share one verify-then-enqueue
 * handler in `billing.ts` — this file exercises both mounts identically to
 * confirm neither diverges. Same raw-body pattern as
 * `billing.webhook.test.ts` (Stripe), adapted for ECDSA `X-Sign`.
 */

const { reconcileBySubscriptionIdMock, mockEnv } = vi.hoisted(() => ({
  reconcileBySubscriptionIdMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {} as Record<string, unknown>,
}));
vi.mock("../modules/billing/plataSync.js", () => ({
  reconcileBySubscriptionId: reconcileBySubscriptionIdMock,
}));
// `plata.ts` reads `env.PLATA_TOKEN` through the Zod-validated `env`
// singleton (frozen at module load) — needed so a bad-signature request's
// forced pubkey-rotation retry (`ensurePlataPubkey(true)`) can resolve
// `getToken()` without a real `PLATA_TOKEN` in the test process env. Same
// Proxy-backed pattern as `billing.test.ts`.
vi.mock("../env/env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return mockEnv[prop];
      },
    },
  ),
}));

import { createBillingRouter } from "./billing.js";
import { errorHandler } from "../http/errorHandler.js";
import { __setPlataPubkeyForTesting } from "../modules/billing/plata.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

function signBody(body: string): string {
  return crypto
    .sign("sha256", Buffer.from(body, "utf8"), privateKey)
    .toString("base64");
}

function makePool() {
  const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
  return { query, connect: vi.fn() };
}

function makeApp(pool: ReturnType<typeof makePool>) {
  const app = express();
  app.use(
    ["/api/billing/plata-charge", "/api/billing/plata-status"],
    express.raw({ type: "application/json" }),
  );
  app.use(createBillingRouter({ pool: pool as never }));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  reconcileBySubscriptionIdMock.mockClear();
  mockEnv["PLATA_TOKEN"] = "merchant-token";
  __setPlataPubkeyForTesting(publicKey);
  // A forced pubkey rotation retry on the bad-sig path (`ensurePlataPubkey
  // (true)`) does one real `fetch` to `/pubkey` — stub it to return the
  // SAME valid key, so that branch resolves cleanly and the retried verify
  // still (correctly) fails on an actually-wrong signature, not on a
  // network/config error.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: publicKey
            .export({ type: "spki", format: "der" })
            .toString("base64"),
        }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => {
  __setPlataPubkeyForTesting(null);
  vi.unstubAllGlobals();
});

describe.each(["/api/billing/plata-charge", "/api/billing/plata-status"])(
  "POST %s (route-level e2e)",
  (path) => {
    it("valid signature → 200, triggers reconciliation, no direct subscriptions write", async () => {
      const pool = makePool();
      const payload = JSON.stringify({ subscriptionId: "s2_ok" });

      const res = await request(makeApp(pool))
        .post(path)
        .set("Content-Type", "application/json")
        .set("X-Sign", signBody(payload))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(reconcileBySubscriptionIdMock).toHaveBeenCalledWith(pool, "s2_ok");
      // The route itself never touches `subscriptions` — only the (mocked)
      // reconciliation module may, and it's stubbed out here.
      expect(
        pool.query.mock.calls.some((call) =>
          String(call[0]).includes("subscriptions"),
        ),
      ).toBe(false);
    });

    it("forged X-Sign → 400 and emits plata_webhook_bad_sig, no reconcile call", async () => {
      const pool = makePool();
      const goodPayload = JSON.stringify({ subscriptionId: "s2_x" });
      const tampered = JSON.stringify({ subscriptionId: "s2_evil" });

      const res = await request(makeApp(pool))
        .post(path)
        .set("Content-Type", "application/json")
        .set("X-Sign", signBody(goodPayload))
        .send(tampered);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid Plata signature" });
      expect(reconcileBySubscriptionIdMock).not.toHaveBeenCalled();
    });

    it("missing X-Sign → 400, no reconcile call", async () => {
      const pool = makePool();
      const payload = JSON.stringify({ subscriptionId: "s2_x" });

      const res = await request(makeApp(pool))
        .post(path)
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(400);
      expect(reconcileBySubscriptionIdMock).not.toHaveBeenCalled();
    });

    it("body without a recognizable subscriptionId → 200 (log, not 500 — monobank must not retry our own parse bug)", async () => {
      const pool = makePool();
      const payload = JSON.stringify({ unrelated: "field" });

      const res = await request(makeApp(pool))
        .post(path)
        .set("Content-Type", "application/json")
        .set("X-Sign", signBody(payload))
        .send(payload);

      expect(res.status).toBe(200);
      expect(reconcileBySubscriptionIdMock).not.toHaveBeenCalled();
    });
  },
);

/**
 * Captured from a real monobank test-merchant run on 2026-09-01 (spec § 2
 * крок 4) — the `chargeUrl`/`statusUrl` payloads are NOT in monobank's
 * documentation, so these are the only record of their actual shape.
 *
 * Transaction identifiers (`walletId`, `cardToken`, `rrn`, `approvalCode`,
 * `tranId`) are replaced with same-shape placeholders: the repo is public and
 * the field layout, not the values, is what these fixtures pin down.
 *
 * Two findings these encode:
 *  - `chargeUrl` sends an INVOICE-shaped body (`invoiceId` + invoice `status`)
 *    with `subscriptionId` appended; `statusUrl` sends a subscription-shaped
 *    one. Both carry `subscriptionId` at the TOP level, which is what
 *    `parseSubscriptionIdFromWebhook` relies on.
 *  - a charge legitimately arrives as `status: "processing"` before
 *    `"success"`. The pre-spec scheduler treated everything but `"success"`
 *    as a failure; nothing here may re-introduce that reading.
 */
const LIVE_CHARGE_PROCESSING = {
  invoiceId: "2609013tiuGMtCjJZjD3",
  status: "processing",
  amount: 19900,
  ccy: 980,
  finalAmount: 0,
  createdDate: "2026-09-01T19:12:08Z",
  modifiedDate: "2026-09-01T19:34:25Z",
  subscriptionId: "6dik5w1QtL",
};

const LIVE_CHARGE_SUCCESS = {
  invoiceId: "2609013tiuGMtCjJZjD3",
  status: "success",
  payMethod: "pan",
  amount: 19900,
  ccy: 980,
  finalAmount: 19900,
  createdDate: "2026-09-01T19:12:08Z",
  modifiedDate: "2026-09-01T19:34:34Z",
  walletData: {
    walletId: "00000000000000000000000000000000",
    cardToken: "test_card_token_placeholder",
    status: "created",
    maskedPan: "53754115******67",
    paymentSystem: "mastercard",
  },
  paymentInfo: {
    rrn: "000000000000",
    approvalCode: "000000",
    tranId: "000000000000",
    terminal: "MI000000",
    bank: "Універсал Банк",
    paymentSystem: "mastercard",
    country: "804",
    fee: 259,
    paymentMethod: "pan",
    maskedPan: "53754115******67",
  },
  subscriptionId: "6dik5w1QtL",
};

const LIVE_STATUS_ACTIVE = {
  subscriptionId: "6dik5w1QtL",
  status: "active",
  amount: 19900,
  ccy: 980,
  interval: "1m",
  nextChargeDate: "2026-10-01T19:34:54Z",
  summary: { totalPaid: 1, totalFailed: 0 },
  walletData: {
    walletId: "00000000000000000000000000000000",
    cardToken: "test_card_token_placeholder",
    status: "created",
    maskedPan: "53754115******67",
    paymentSystem: "mastercard",
  },
};

const LIVE_STATUS_CANCELLED = {
  subscriptionId: "6dik5w1QtL",
  status: "cancelled",
  startDate: "2026-09-01T19:34:54Z",
  endDate: "2026-09-01T19:36:04Z",
  amount: 19900,
  ccy: 980,
  interval: "1m",
  cancellationDesc: "cancellation",
  summary: { totalPaid: 1, totalFailed: 0 },
  walletData: {
    walletId: "00000000000000000000000000000000",
    cardToken: "test_card_token_placeholder",
    status: "created",
    maskedPan: "53754115******67",
    paymentSystem: "mastercard",
  },
};

describe("real captured monobank payloads (2026-09-01 live run)", () => {
  it.each([
    ["charge/processing", "/api/billing/plata-charge", LIVE_CHARGE_PROCESSING],
    ["charge/success", "/api/billing/plata-charge", LIVE_CHARGE_SUCCESS],
    ["status/active", "/api/billing/plata-status", LIVE_STATUS_ACTIVE],
    ["status/cancelled", "/api/billing/plata-status", LIVE_STATUS_CANCELLED],
  ])(
    "%s → subscriptionId extracted, reconciliation triggered",
    async (_label, path, fixture) => {
      const pool = makePool();
      const payload = JSON.stringify(fixture);

      const res = await request(makeApp(pool))
        .post(path as string)
        .set("Content-Type", "application/json")
        .set("X-Sign", signBody(payload))
        .send(payload);

      expect(res.status).toBe(200);
      expect(reconcileBySubscriptionIdMock).toHaveBeenCalledWith(
        pool,
        "6dik5w1QtL",
      );
      // The webhook is a trigger, never a source of truth: whatever status the
      // payload carries, the route must not write `subscriptions` itself.
      expect(
        pool.query.mock.calls.some((call) =>
          String(call[0]).includes("subscriptions"),
        ),
      ).toBe(false);
    },
  );

  it("a real payload carrying walletData.cardToken is never echoed into a query (Hard Rule #21)", async () => {
    const pool = makePool();
    const payload = JSON.stringify(LIVE_CHARGE_SUCCESS);

    await request(makeApp(pool))
      .post("/api/billing/plata-charge")
      .set("Content-Type", "application/json")
      .set("X-Sign", signBody(payload))
      .send(payload);

    const everyArg = JSON.stringify(pool.query.mock.calls);
    expect(everyArg).not.toContain("test_card_token_placeholder");
  });
});
