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

function extractHandler(
  query: ReturnType<typeof vi.fn>,
  index: number,
): RequestHandler {
  const router = createAiUsageInternalRouter({ pool: { query } as never });
  const layers = (
    router as unknown as {
      stack: Array<{ route?: { stack: Array<{ handle: RequestHandler }> } }>;
    }
  ).stack.filter((l) => l.route);
  const handle = layers[index]?.route?.stack[0]?.handle;
  if (!handle) throw new Error("route handler not found");
  return handle;
}

/** POST — писалка. */
function extractPostHandler(query: ReturnType<typeof vi.fn>): RequestHandler {
  return extractHandler(query, 0);
}

/** GET — читалка звіту. */
function extractGetHandler(query: ReturnType<typeof vi.fn>): RequestHandler {
  return extractHandler(query, 1);
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

describe("GET /api/internal/ai-usage — вікно звіту", () => {
  it("рахує вікно від київського сьогодні, а не від CURRENT_DATE", async () => {
    // 21:30 UTC = 00:30 наступної доби за Києвом. `CURRENT_DATE` у сесії
    // Postgres (контейнер на UTC) віддав би 05-15, тоді як рядки за цю
    // добу вже пишуться під 05-16 — край вікна їхав рівно на день.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T21:30:00Z"));

    const query = vi.fn().mockResolvedValue({ rows: [] });
    const res = await invoke(extractGetHandler(query), {
      query: { days: "30" },
    });

    expect(res.statusCode).toBe(200);
    const [sql, values] = query.mock.calls[0]! as [string, unknown[]];
    expect(sql).not.toContain("CURRENT_DATE");
    expect(values[0]).toBe("2026-05-16");
    expect(values[1]).toBe(30);
    expect(values[2]).toBe("provider:anthropic");
  });

  it("«останні N днів» включають сьогодні — рівно N, не N+1", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const query = vi.fn().mockResolvedValue({ rows: [] });
    const res = (await invoke(extractGetHandler(query), {
      query: { days: "30" },
    })) as { jsonBody: { from: string; until: string; days: number } };

    // 2026-04-16 … 2026-05-15 включно = 30 діб. Раніше нижня межа була
    // 04-15, тобто 31 доба витрат ділилась на 30 у «середньому за добу».
    expect(res.jsonBody.from).toBe("2026-04-16");
    expect(res.jsonBody.until).toBe("2026-05-15");
    expect(res.jsonBody.days).toBe(30);
  });

  it("віддає $/виклик і $/1k — на них тримається питання «скільки коштує сто»", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          endpoint: "coach-insight",
          bucket: "anthropic:openai/gpt-5.1",
          calls: "250",
          input_tokens: "100000",
          cache_read_tokens: "40000",
          output_tokens: "5000",
          // NUMERIC приходить рядком — коерція на межі API (Hard Rule #1).
          cost_usd: "1.0175",
        },
      ],
    });
    const res = (await invoke(extractGetHandler(query), {
      query: { days: "30" },
    })) as {
      jsonBody: {
        totalCostUsd: number;
        totalCalls: number;
        items: Array<{
          calls: number;
          costPerCallUsd: number;
          costPer1kUsd: number;
          cacheHitPct: number;
        }>;
      };
    };

    const item = res.jsonBody.items[0]!;
    expect(item.calls).toBe(250);
    expect(item.costPerCallUsd).toBeCloseTo(0.00407, 6);
    expect(item.costPer1kUsd).toBeCloseTo(4.07, 2);
    expect(item.cacheHitPct).toBeCloseTo(40, 1);
    expect(res.jsonBody.totalCalls).toBe(250);
    expect(res.jsonBody.totalCostUsd).toBeCloseTo(1.0175, 4);
  });

  it("days затискається у [1, 90]", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const res = (await invoke(extractGetHandler(query), {
      query: { days: "365" },
    })) as { jsonBody: { days: number } };
    expect(res.jsonBody.days).toBe(90);
  });
});
