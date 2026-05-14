import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("../http/rateLimit.js")>(
    "../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

import { BillingPortalResponseSchema } from "@sergeant/shared";

import { createBillingRouter } from "./billing.js";

function createQueryPool(query: ReturnType<typeof vi.fn>) {
  return {
    query,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
}

function createTestApp(pool: ReturnType<typeof createQueryPool>) {
  const app = express();
  app.use(express.json());
  app.use(createBillingRouter({ pool: pool as never }));
  return app;
}

describe("billing routes", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    getSessionUserMock.mockReset();
    getSessionUserMock.mockResolvedValue({
      id: "user_1",
      email: "billing@example.com",
    });
    delete process.env["STRIPE_SECRET_KEY"];
    delete process.env["STRIPE_PRICE_PLUS_MONTHLY"];
    delete process.env["STRIPE_PRICE_PRO_MONTHLY"];
    delete process.env["STRIPE_WEBHOOK_SECRET"];
    delete process.env["PUBLIC_WEB_BASE_URL"];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates checkout plan before Stripe is called", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "enterprise" });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns BILLING_UNAVAILABLE when Stripe env is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "plus" });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "BILLING_UNAVAILABLE" });
  });

  it("serializes active subscription ids as numbers", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "42",
          provider: "stripe",
          plan: "pro",
          status: "active",
          current_period_end: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subscription: {
        id: 42,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      },
    });
  });

  // ───────── POST /api/billing/portal (P0-6) ─────────
  // Happy path: user with an active Stripe subscription gets a fresh
  // Customer Portal URL. Edge cases:
  //  - Stripe env missing → 503 BILLING_UNAVAILABLE (mirrors checkout).
  //  - No subscription / no provider_customer_id → 409 NO_BILLING_CUSTOMER.
  // We mock global `fetch` so the test never hits Stripe's network.

  it("creates a Customer Portal session and returns a redirect URL", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
    process.env["PUBLIC_WEB_BASE_URL"] = "https://app.example.com";

    const query = vi.fn().mockResolvedValue({
      rows: [{ provider_customer_id: "cus_xyz" }],
    });
    const fetchMock: typeof fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "bps_test_1",
            url: "https://billing.stripe.com/session/bps_test_1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = fetchMock;

    const app = createTestApp(createQueryPool(query));
    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(200);
    // API contract triplet (Hard Rule #3): response shape must round-trip
    // through the canonical zod schema that ships in @sergeant/shared.
    const parsed = BillingPortalResponseSchema.parse(res.body);
    expect(parsed).toEqual({
      ok: true,
      url: "https://billing.stripe.com/session/bps_test_1",
    });

    const calls = vi.mocked(fetchMock).mock.calls;
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("fetchMock was not called");
    const [stripeUrl, init] = call;
    expect(String(stripeUrl)).toBe(
      "https://api.stripe.com/v1/billing_portal/sessions",
    );
    const body = String(init?.body ?? "");
    expect(body).toContain("customer=cus_xyz");
    expect(body).toContain(
      `return_url=${encodeURIComponent("https://app.example.com/settings?billing=portal-return")}`,
    );
  });

  it("returns BILLING_UNAVAILABLE when Stripe env is missing", async () => {
    const query = vi.fn();
    const app = createTestApp(createQueryPool(query));

    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "BILLING_UNAVAILABLE" });
    // Guard: we should never hit Stripe or DB if env is misconfigured.
    expect(query).not.toHaveBeenCalled();
  });

  it("returns NO_BILLING_CUSTOMER when user has no Stripe customer record", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const fetchMock: typeof fetch = vi.fn(async () => new Response(null));
    globalThis.fetch = fetchMock;

    const app = createTestApp(createQueryPool(query));
    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "NO_BILLING_CUSTOMER" });
    // No Stripe API call when we know the user has no customer record.
    expect(vi.mocked(fetchMock)).not.toHaveBeenCalled();
  });
});
