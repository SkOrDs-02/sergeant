import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { getSubscriptionStatusMock } = vi.hoisted(() => ({
  getSubscriptionStatusMock: vi.fn(),
}));

vi.mock("./stripe.js", () => ({
  getSubscriptionStatus: getSubscriptionStatusMock,
}));

import { requirePlan } from "./requirePlan.js";

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeReq(userId?: string) {
  return { user: userId ? { id: userId } : undefined } as Request & {
    user?: { id: string };
  };
}

const pool = {} as never;
const next = vi.fn() as unknown as NextFunction;

describe("requirePlan middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env["STRIPE_ENABLED"];
  });

  it("calls next() when STRIPE_ENABLED is not 'true' (billing not active)", async () => {
    const middleware = requirePlan(pool, "pro");
    await middleware(makeReq("user_1"), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
  });

  it("returns 401 when STRIPE_ENABLED=true and no session user", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user has active pro subscription", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    getSubscriptionStatusMock.mockResolvedValue({
      subscription: { active: true, plan: "pro" },
    });
    await requirePlan(pool, "pro")(makeReq("user_1"), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 402 when user is on free plan", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    getSubscriptionStatusMock.mockResolvedValue({
      subscription: { active: false, plan: null },
    });
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq("user_1"), res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PLAN_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 402 when subscription is inactive (expired/canceled)", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    getSubscriptionStatusMock.mockResolvedValue({
      subscription: { active: false, plan: "pro" },
    });
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq("user_1"), res, next);
    expect(res.status).toHaveBeenCalledWith(402);
  });
});
