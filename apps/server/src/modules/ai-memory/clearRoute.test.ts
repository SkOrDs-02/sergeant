import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { callOrder, purgeQueuedIngestForUser, cancelPendingProfileMirror } =
  vi.hoisted(() => {
    const order: string[] = [];
    return {
      callOrder: order,
      purgeQueuedIngestForUser: vi.fn(async (_userId: string) => {
        order.push("purgeQueue");
        return 0;
      }),
      cancelPendingProfileMirror: vi.fn(async (_userId: string) => {
        order.push("cancelMirror");
      }),
    };
  });

vi.mock("./ingestQueue.js", () => ({ purgeQueuedIngestForUser }));
vi.mock("./profileMirrorDebounce.js", () => ({ cancelPendingProfileMirror }));

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
  callOrder.length = 0;
  purgeQueuedIngestForUser.mockClear();
  cancelPendingProfileMirror.mockClear();
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

  // B12 (аудит ai-pipeline-2026-08-05): задачі ingest, що вже лежали в
  // Redis, повертали стерті факти. Черга чиститься і мітка ставиться ДО
  // видалення рядків, а відкладене дзеркалення профілю глушиться ще раніше.
  it("глушить дзеркалення і чистить чергу ingest до видалення рядків", async () => {
    const forgetUser = vi.fn(async () => {
      callOrder.push("forgetUser");
      return 3;
    });
    __resetAiMemoryForTest({ forgetUser } as unknown as AiMemoryService);

    await clearAiMemoryHandler(makeReq("user_3"), makeRes());

    expect(cancelPendingProfileMirror).toHaveBeenCalledWith("user_3");
    expect(purgeQueuedIngestForUser).toHaveBeenCalledWith("user_3");
    expect(callOrder).toEqual(["cancelMirror", "purgeQueue", "forgetUser"]);
  });
});
