import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { stripeCancelMock, liqpayCancelMock, plataCancelMock, loggerWarnMock } =
  vi.hoisted(() => ({
    stripeCancelMock: vi.fn(),
    liqpayCancelMock: vi.fn(),
    plataCancelMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock("../../modules/billing/index.js", () => ({
  providerRegistry: {
    stripe: { cancelSubscription: stripeCancelMock },
    liqpay: { cancelSubscription: liqpayCancelMock },
    plata: { cancelSubscription: plataCancelMock },
  },
}));

vi.mock("../../obs/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../obs/logger.js")>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      warn: loggerWarnMock,
    },
  };
});

async function makeApp(queryMock = vi.fn().mockResolvedValue({ rows: [] })) {
  const { createBillingInternalRouter } = await import("./billing.js");
  const app = express();
  app.use(express.json());
  app.use(createBillingInternalRouter({ pool: { query: queryMock } as never }));
  return app;
}

describe("createBillingInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeCancelMock.mockResolvedValue(undefined);
    liqpayCancelMock.mockResolvedValue(undefined);
    plataCancelMock.mockResolvedValue(undefined);
  });

  it("rejects upgrade without userId before reaching the DB", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/billing/upgrade")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "userId is required" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("upgrades a manual subscription and coerces bigint id to number", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "88", plan: "pro", status: "active", provider: "manual" }],
    });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/billing/upgrade")
      .send({ userId: "user_opaque" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      subscription: {
        id: 88,
        plan: "pro",
        status: "active",
        provider: "manual",
      },
    });
    expect(queryMock.mock.calls[0]?.[1]).toEqual(["user_opaque"]);
  });

  it("maps FK violations on upgrade to 404 User not found", async () => {
    const queryMock = vi.fn().mockRejectedValue({ code: "23503" });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/billing/upgrade")
      .send({ userId: "missing_user" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });

  it("downgrades after best-effort provider cancellation and returns numeric id", async () => {
    stripeCancelMock.mockRejectedValueOnce(new Error("stripe down"));
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "99", plan: "pro", status: "canceled" }],
    });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/billing/downgrade")
      .send({ userId: "user_opaque" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      subscription: { id: 99, plan: "pro", status: "canceled" },
    });
    expect(stripeCancelMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_opaque",
    );
    expect(liqpayCancelMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_opaque",
    );
    expect(plataCancelMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_opaque",
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "internal_downgrade_provider_cancel_failed",
        provider: "stripe",
      }),
    );
  });

  it("returns 404 when downgrade finds no active subscription", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/billing/downgrade")
      .send({ userId: "free_user" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "No active subscription" });
  });
});
