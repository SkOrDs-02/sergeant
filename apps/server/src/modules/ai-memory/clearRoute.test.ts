import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { __resetAiMemoryForTest } from "./bootstrap.js";
import { clearAiMemoryHandler } from "./clearRoute.js";
import type { AiMemoryService } from "./service.js";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(userId: string): Request {
  return { user: { id: userId } } as unknown as Request;
}

afterEach(() => {
  __resetAiMemoryForTest(undefined);
});

describe("clearAiMemoryHandler", () => {
  it("hard-deletes all memories for the session user and returns the deleted count", async () => {
    const forgetUser = vi.fn().mockResolvedValue(7);
    __resetAiMemoryForTest({ forgetUser } as unknown as AiMemoryService);

    const req = makeReq("user_1");
    const res = makeRes();
    await clearAiMemoryHandler(req, res);

    expect(forgetUser).toHaveBeenCalledWith("user_1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: 7 });
  });

  it("returns deleted=0 when the user had no stored memories", async () => {
    const forgetUser = vi.fn().mockResolvedValue(0);
    __resetAiMemoryForTest({ forgetUser } as unknown as AiMemoryService);

    const req = makeReq("user_2");
    const res = makeRes();
    await clearAiMemoryHandler(req, res);

    expect(res.body).toEqual({ ok: true, deleted: 0 });
  });
});
