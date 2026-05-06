import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
