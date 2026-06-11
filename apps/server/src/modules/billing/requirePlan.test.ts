import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { getUserPlanMock } = vi.hoisted(() => ({
  getUserPlanMock: vi.fn(),
}));

vi.mock("./getUserPlan.js", () => ({
  getUserPlan: getUserPlanMock,
}));

/**
 * `requirePlan` читає `env.STRIPE_ENABLED` із Zod-схеми (audit 2026-06-11
 * ws-08), а `env/env.ts` парсить `process.env` один раз при імпорті — тому
 * кожен кейс стабить env і пере-імпортує модуль з чистого реєстру
 * (паттерн `env/__tests__/assertStartupEnv.test.ts`).
 */
async function loadRequirePlan(stripeEnabled?: string) {
  if (stripeEnabled !== undefined) {
    vi.stubEnv("STRIPE_ENABLED", stripeEnabled);
  }
  vi.resetModules();
  const mod = await import("./requirePlan.js");
  return mod.requirePlan;
}

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

describe("requirePlan middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("calls next() when STRIPE_ENABLED is off (billing not active)", async () => {
    const requirePlan = await loadRequirePlan();
    const next = vi.fn() as unknown as NextFunction;
    await requirePlan(pool, "pro")(makeReq("user_1"), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getUserPlanMock).not.toHaveBeenCalled();
  });

  it("calls next() when STRIPE_ENABLED=false explicitly", async () => {
    const requirePlan = await loadRequirePlan("false");
    const next = vi.fn() as unknown as NextFunction;
    await requirePlan(pool, "pro")(makeReq("user_1"), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when STRIPE_ENABLED=true and no session user", async () => {
    const requirePlan = await loadRequirePlan("true");
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("enforces with STRIPE_ENABLED=1 (legacy spelling, strict parser)", async () => {
    const requirePlan = await loadRequirePlan("1");
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("calls next() when user has active pro subscription", async () => {
    const requirePlan = await loadRequirePlan("true");
    const next = vi.fn() as unknown as NextFunction;
    getUserPlanMock.mockResolvedValue({
      plan: "pro",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    await requirePlan(pool, "pro")(makeReq("user_1"), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 402 when user is on free plan", async () => {
    const requirePlan = await loadRequirePlan("true");
    const next = vi.fn() as unknown as NextFunction;
    getUserPlanMock.mockResolvedValue({
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
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
    const requirePlan = await loadRequirePlan("true");
    const next = vi.fn() as unknown as NextFunction;
    getUserPlanMock.mockResolvedValue({
      plan: "pro",
      status: "canceled",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    const res = makeRes();
    await requirePlan(pool, "pro")(makeReq("user_1"), res, next);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("env module refuses to parse garbage STRIPE_ENABLED (strict flag)", async () => {
    vi.stubEnv("STRIPE_ENABLED", "TRUE_oops");
    vi.resetModules();
    await expect(import("../../env/env.js")).rejects.toThrow(/STRIPE_ENABLED/);
  });
});
