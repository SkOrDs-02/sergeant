import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../auth.js", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return { default: pool, pool };
});

import { getSessionUser as _getSessionUser } from "../../auth.js";
import _pool from "../../db.js";
import {
  assertAiQuota,
  consumeToolQuota,
  __aiQuotaTestHooks,
} from "./aiQuota.js";

const getSessionUser = _getSessionUser as unknown as ReturnType<typeof vi.fn>;
const pool = _pool as unknown as {
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
};

interface TestRes {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
  setHeader(name: string, value: string): void;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    headers: {},
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res as unknown as TestRes & Response;
}

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress: "1.2.3.4" },
  } as unknown as Request;
}

const ENV_VARS = [
  "AI_QUOTA_DISABLED",
  "AI_DAILY_USER_LIMIT",
  "AI_DAILY_ANON_LIMIT",
  "AI_QUOTA_TOOL_COST",
  "AI_QUOTA_TOOL_LIMITS",
  "AI_QUOTA_TOOL_DEFAULT_LIMIT",
  "DATABASE_URL",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
  vi.clearAllMocks();
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/**
 * Мок `pool.query`, що емулює атомарність UPSERT-а з ON CONFLICT DO UPDATE
 * WHERE — тобто ту саму поведінку, яку дає Postgres per-row lock. Тримає
 * стан у Map `(subject|day|bucket) -> count` і серіалізує запити через
 * queue-мутекс, щоб паралельні виклики проходили один-за-одним (як у реальній
 * БД з row-lock).
 */
function makeAtomicPoolMock() {
  const store = new Map<string, number>();
  interface QueueItem {
    fn: () => unknown;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }
  const queue: QueueItem[] = [];
  let running = false;
  function enqueue(fn: () => unknown) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      flush();
    });
  }
  function flush() {
    if (running) return;
    const next = queue.shift();
    if (!next) return;
    running = true;
    Promise.resolve()
      .then(next.fn)
      .then((v) => {
        running = false;
        next.resolve(v);
        flush();
      })
      .catch((e) => {
        running = false;
        next.reject(e);
        flush();
      });
  }
  const query = vi.fn(async (text: string, values: unknown[]) => {
    return enqueue(() => {
      const isUpsert = /INSERT INTO ai_usage_daily/i.test(text);
      if (!isUpsert) return { rows: [], rowCount: 0 };
      const [subject, day, bucket, cost, limit] = values as [
        string,
        string,
        string,
        number,
        number,
      ];
      const key = `${subject}|${day}|${bucket}`;
      const cur = store.get(key) ?? 0;
      const next = cur + cost;
      if (next > limit) {
        if (cur === 0) {
          // новий рядок, cost > limit — не вставляємо
          return { rows: [], rowCount: 0 };
        }
        // існуючий рядок, WHERE на ON CONFLICT блокує оновлення
        return { rows: [], rowCount: 0 };
      }
      store.set(key, next);
      return { rows: [{ request_count: next }], rowCount: 1 };
    });
  });
  return { query, store };
}

describe("assertAiQuota (default bucket)", () => {
  it("returns true (no-op) when AI_QUOTA_DISABLED=1", async () => {
    process.env["AI_QUOTA_DISABLED"] = "1";
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getSessionUser).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("fails open when DATABASE_URL is missing", async () => {
    delete process.env["DATABASE_URL"];
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("unknown");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("fails open when the quota DB call throws", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeUndefined();
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("unknown");
  });

  it("fails open when getSessionUser throws", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockRejectedValue(new Error("auth db down"));
    pool.query.mockRejectedValue(new Error("db down"));
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("unknown");
  });

  it("returns 429 when daily limit would be exceeded", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    process.env["AI_DAILY_ANON_LIMIT"] = "2";
    getSessionUser.mockResolvedValue(null);
    // Емулюємо: поточний count=2, cost=1 → WHERE 2+1<=2 false → 0 рядків.
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(429);
    expect((res.body as { code?: string } | undefined)?.code).toBe("AI_QUOTA");
  });

  it("returns true and sets remaining header on success", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    process.env["AI_DAILY_ANON_LIMIT"] = "10";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 4 }], rowCount: 1 });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("6");
    // Перевіряємо, що це ATOMIC UPSERT, а не BEGIN/SELECT FOR UPDATE/UPDATE/COMMIT.
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO ai_usage_daily/);
    expect(sql).toMatch(/ON CONFLICT \(subject_key, usage_day, bucket\)/);
    expect(sql).toMatch(/DO UPDATE/);
    expect(values[2]).toBe("default");
    expect(values[3]).toBe(1); // cost for plain chat
    expect(values[4]).toBe(10); // limit
  });
});

describe("consumeToolQuota (tool buckets)", () => {
  beforeEach(() => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
  });

  it("returns ok + unlimited when AI_QUOTA_TOOL_LIMITS is not set", async () => {
    delete process.env["AI_QUOTA_TOOL_LIMITS"];
    delete process.env["AI_QUOTA_TOOL_DEFAULT_LIMIT"];
    const r = await consumeToolQuota(makeReq(), "change_category");
    expect(r.ok).toBe(true);
    expect(r.limit).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("uses AI_QUOTA_TOOL_DEFAULT_LIMIT when env JSON is absent", async () => {
    delete process.env["AI_QUOTA_TOOL_LIMITS"];
    process.env["AI_QUOTA_TOOL_DEFAULT_LIMIT"] = "12";
    process.env["AI_QUOTA_TOOL_COST"] = "3";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 3 }], rowCount: 1 });
    const r = await consumeToolQuota(makeReq(), "change_category");
    expect(r.ok).toBe(true);
    expect(r.limit).toBe(12);
    expect(pool.query).toHaveBeenCalledOnce();
    const [, values] = pool.query.mock.calls[0]!;
    expect(values![2]).toBe("tool:change_category");
    expect(values![3]).toBe(3); // cost
    expect(values![4]).toBe(12); // limit
  });

  it("uses per-tool limit from AI_QUOTA_TOOL_LIMITS JSON", async () => {
    process.env["AI_QUOTA_TOOL_LIMITS"] = JSON.stringify({
      change_category: 20,
      create_debt: 5,
    });
    process.env["AI_QUOTA_TOOL_COST"] = "3";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 3 }], rowCount: 1 });

    await consumeToolQuota(makeReq(), "create_debt");
    const [, values] = pool.query.mock.calls[0]!;
    expect(values![4]).toBe(5);
    expect(values![2]).toBe("tool:create_debt");
  });

  it("blocks with reason=limit when tool-bucket is exhausted", async () => {
    process.env["AI_QUOTA_TOOL_LIMITS"] = JSON.stringify({ create_debt: 3 });
    process.env["AI_QUOTA_TOOL_COST"] = "3";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const r = await consumeToolQuota(makeReq(), "create_debt");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("limit");
    expect(r.remaining).toBe(0);
  });

  it("returns ok on broken AI_QUOTA_TOOL_LIMITS JSON (advisory fail-open)", async () => {
    process.env["AI_QUOTA_TOOL_LIMITS"] = "{not valid";
    delete process.env["AI_QUOTA_TOOL_DEFAULT_LIMIT"];
    const r = await consumeToolQuota(makeReq(), "change_category");
    expect(r.ok).toBe(true);
    expect(r.limit).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("does NOT consume from default bucket (separate quota)", async () => {
    process.env["AI_QUOTA_TOOL_LIMITS"] = JSON.stringify({
      change_category: 30,
    });
    process.env["AI_QUOTA_TOOL_COST"] = "3";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 3 }], rowCount: 1 });
    await consumeToolQuota(makeReq(), "change_category");
    const [, values] = pool.query.mock.calls[0]!;
    expect(values![2]).not.toBe("default");
    expect(values![2]).toBe("tool:change_category");
  });
});

describe("atomic consumeQuota — concurrent increments", () => {
  it("20 parallel increments with limit=10 yield exactly 10 ok + 10 blocked", async () => {
    const { query } = makeAtomicPoolMock();
    pool.query = query;

    const calls = Array.from({ length: 20 }, () =>
      __aiQuotaTestHooks.consumeQuota({
        subject: "u:test",
        day: "2026-01-01",
        limit: 10,
        cost: 1,
        bucket: "default",
      }),
    );
    const results = await Promise.all(calls);

    const okCount = results.filter((r) => r.ok).length;
    const blockedCount = results.filter((r) => !r.ok).length;
    expect(okCount).toBe(10);
    expect(blockedCount).toBe(10);

    // Після 10 успішних, remaining монотонно спадає до 0.
    const remainings = results.filter((r) => r.ok).map((r) => r.remaining);
    expect(remainings).toContain(0);
    expect(Math.max(...remainings)).toBe(9);
  });

  it("concurrent tool-use (cost=3) + plain (cost=1) use independent buckets", async () => {
    const { query, store } = makeAtomicPoolMock();
    pool.query = query;

    const plain = Array.from({ length: 5 }, () =>
      __aiQuotaTestHooks.consumeQuota({
        subject: "u:x",
        day: "2026-01-01",
        limit: 3,
        cost: 1,
        bucket: "default",
      }),
    );
    const tools = Array.from({ length: 5 }, () =>
      __aiQuotaTestHooks.consumeQuota({
        subject: "u:x",
        day: "2026-01-01",
        limit: 9,
        cost: 3,
        bucket: "tool:create_debt",
      }),
    );
    const [plainRes, toolsRes] = await Promise.all([
      Promise.all(plain),
      Promise.all(tools),
    ]);
    expect(plainRes.filter((r) => r.ok).length).toBe(3);
    expect(toolsRes.filter((r) => r.ok).length).toBe(3);
    expect(store.get("u:x|2026-01-01|default")).toBe(3);
    expect(store.get("u:x|2026-01-01|tool:create_debt")).toBe(9);
  });

  it("rejects cost that alone exceeds limit (pre-check)", async () => {
    const { query } = makeAtomicPoolMock();
    pool.query = query;
    const r = await __aiQuotaTestHooks.consumeQuota({
      subject: "u:y",
      day: "2026-01-01",
      limit: 2,
      cost: 3,
      bucket: "tool:expensive",
    });
    expect(r.ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
