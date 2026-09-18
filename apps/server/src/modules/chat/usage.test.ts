import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../db.js", () => ({ default: {} }));

const { getUserPlanMock, getTodayChatUsageMock } = vi.hoisted(() => ({
  getUserPlanMock: vi.fn(),
  getTodayChatUsageMock: vi.fn(),
}));

vi.mock("../billing/getUserPlan.js", () => ({
  getUserPlan: getUserPlanMock,
}));

vi.mock("./aiQuota.js", () => ({
  getTodayChatUsage: getTodayChatUsageMock,
}));

import chatUsageHandler from "./usage.js";

function makeReq(userId: string): Request {
  return { user: { id: userId } } as unknown as Request;
}

function makeRes() {
  const res = {
    body: undefined as unknown,
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { body: unknown };
}

describe("chatUsageHandler (GET /api/chat/usage — PR-42 chat counter)", () => {
  beforeEach(() => {
    getUserPlanMock.mockReset();
    getTodayChatUsageMock.mockReset();
  });

  it("returns null limit/remaining for an unlimited Pro plan (never queries usage)", async () => {
    getUserPlanMock.mockResolvedValue({ plan: "pro" });
    const res = makeRes();
    await chatUsageHandler(makeReq("u1"), res);
    expect(res.body).toEqual({ plan: "pro", limit: null, remaining: null });
    expect(getTodayChatUsageMock).not.toHaveBeenCalled();
  });

  it("computes remaining = limit - used for a Free plan", async () => {
    getUserPlanMock.mockResolvedValue({ plan: "free" });
    getTodayChatUsageMock.mockResolvedValue(3);
    const res = makeRes();
    await chatUsageHandler(makeReq("u1"), res);
    const body = res.body as { plan: string; limit: number; remaining: number };
    expect(body.plan).toBe("free");
    expect(body.remaining).toBe(body.limit - 3);
    expect(getTodayChatUsageMock).toHaveBeenCalledWith("u1");
  });

  it("clamps remaining at 0 when usage already exceeds the limit (race with concurrent request)", async () => {
    getUserPlanMock.mockResolvedValue({ plan: "free" });
    getTodayChatUsageMock.mockResolvedValue(999);
    const res = makeRes();
    await chatUsageHandler(makeReq("u1"), res);
    const body = res.body as { remaining: number };
    expect(body.remaining).toBe(0);
  });
});
