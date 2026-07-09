/**
 * Handler-level tests for `/api/internal/ai-usage`.
 *
 * The `usage_day` column written here must use the **Europe/Kyiv** civil day
 * (domain invariant), because the same `ai_usage_daily.usage_day` column is
 * written elsewhere via `toLocalISODate` (`lib/anthropicUsageStore.ts`) and
 * read back as a Kyiv-day in `modules/openclaw/aiCostSummary.ts`. A UTC-day
 * key here would split the same civil day across two rows.
 *
 * We invoke the route handler directly with fake `req`/`res` (no HTTP layer)
 * so the assertion stays focused on the day-key derivation.
 */

import type { Request, Response } from "express";
import type { RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiUsageInternalRouter } from "./ai-usage.js";

function extractPostHandler(query: ReturnType<typeof vi.fn>): RequestHandler {
  const router = createAiUsageInternalRouter({ pool: { query } as never });
  const layer = (
    router as unknown as {
      stack: Array<{ route?: { stack: Array<{ handle: RequestHandler }> } }>;
    }
  ).stack.find((l) => l.route);
  const handle = layer?.route?.stack[0]?.handle;
  if (!handle) throw new Error("route handler not found");
  return handle;
}

interface FakeRes {
  statusCode: number;
  jsonBody: unknown;
  onDone: () => void;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
}

function makeRes(onDone: () => void): Response & FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    jsonBody: undefined,
    onDone,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      this.onDone();
      return this;
    },
  };
  return res as unknown as Response & FakeRes;
}

async function invoke(
  handle: RequestHandler,
  req: Partial<Request>,
): Promise<Response & FakeRes> {
  // Express 5 catches a rejected handler promise and calls `next` only on
  // error; resolve when the handler has produced a response via `res.json`.
  return await new Promise<Response & FakeRes>((resolve, reject) => {
    const res = makeRes(() => resolve(res));
    const next = (err?: unknown) => (err ? reject(err) : resolve(res));
    handle(req as Request, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/internal/ai-usage handler", () => {
  it("400 when source is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const handle = extractPostHandler(query);

    const res = await invoke(handle, { body: { inputTokens: 10 } });

    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("keys usage_day on the Europe/Kyiv civil day at the UTC→Kyiv boundary", async () => {
    // 2026-05-15T21:30:00Z = 2026-05-16 00:30 Kyiv (summer, UTC+3). The row's
    // usage_day must be `2026-05-16`, not the UTC day `2026-05-15`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T21:30:00Z"));

    const query = vi.fn().mockResolvedValue({ rows: [] });
    const handle = extractPostHandler(query);

    const res = await invoke(handle, {
      body: { source: "classify", inputTokens: 100, outputTokens: 50 },
    });

    expect(res.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    const [, values] = query.mock.calls[0]! as [string, unknown[]];
    // params: [subject_key, usage_day, bucket, input, output, total]
    expect(values[1]).toBe("2026-05-16");
  });
});
