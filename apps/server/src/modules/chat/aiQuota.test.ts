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
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";
import {
  issueRoundTripTicket,
  __resetRoundTripTickets,
} from "./chatRoundTripTicket.js";

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

function makeReq(
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {},
): Request {
  return {
    headers,
    body,
    socket: { remoteAddress: "1.2.3.4" },
  } as unknown as Request;
}

const ENV_VARS = [
  "AI_QUOTA_DISABLED",
  "AI_DAILY_USER_LIMIT",
  "AI_QUOTA_TOOL_COST",
  "AI_QUOTA_TOOL_LIMITS",
  "AI_QUOTA_TOOL_DEFAULT_LIMIT",
  "AI_QUOTA_FOUNDER_IDS",
  "DATABASE_URL",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
  vi.clearAllMocks();
  aiQuotaCircuitBreaker.reset();
  __resetRoundTripTickets();
});

afterEach(() => {
  aiQuotaCircuitBreaker.reset();
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
      // Params order: subject, day, bucket, endpoint, cost, limit (міграції
      // 104/106 додали `endpoint` як 4-ту колонку PK).
      const [subject, day, bucket, endpoint, cost, limit] = values as [
        string,
        string,
        string,
        string,
        number,
        number,
      ];
      const key = `${subject}|${day}|${bucket}|${endpoint}`;
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

  // Замінює колишній тест «429 із sign-in кодом для аноніма». Анонімна гілка
  // (`AI_QUOTA_ANON` + `AI_DAILY_ANON_LIMIT`) прибрана як недосяжна: усі
  // роути, що монтують цю квоту, стоять за `requireSession()`, тож без сесії
  // запит уже віддав 401 задовго до квоти. `sessionUser === null` тут лишився
  // означати лише збій session-lookup — і мусить давати Free-стелю, а не
  // окремий анонімний ліміт і не безліміт.
  it("session-lookup вернув null → Free-стеля, не безліміт і не анон-ліміт", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 1 }], rowCount: 1 });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    // Ліміт, переданий в UPSERT — саме FREE_LIMITS.aiRequestsPerDay (5).
    const [, values] = pool.query.mock.calls[0]!;
    expect((values as unknown[])[5]).toBe(5);
    // Плану не питали: без userId `getUserPlan` немає до чого звертатись.
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it("returns 429 with the plain quota code for a signed-in caller", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-1" });
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(429);
    const body = res.body as { code?: string; error?: string } | undefined;
    expect(body?.code).toBe("AI_QUOTA");
    expect(body?.error).toMatch(/завтра/);
    // Копія називає ОДИНИЦЮ, яку насправді метрять: запит, не повідомлення.
    // Один чат-меседж із tool-раундом коштує кілька запитів (наступний POST
    // із tool_results проходить ту саму квоту), і копія «5 повідомлень»
    // давала 429 після чотирьох відповідей.
    expect(body?.error).toMatch(/запит/i);
    expect(body?.error).not.toMatch(/^Денний ліміт AI вичерпано/);
  });

  it("returns true and sets remaining header on success", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 4 }], rowCount: 1 });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("1"); // 5 - 4
    // Перевіряємо, що це ATOMIC UPSERT, а не BEGIN/SELECT FOR UPDATE/UPDATE/COMMIT.
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO ai_usage_daily/);
    expect(sql).toMatch(
      /ON CONFLICT \(subject_key, usage_day, bucket, endpoint\)/,
    );
    expect(sql).toMatch(/DO UPDATE/);
    expect(values[2]).toBe("default");
    expect(values[3]).toBe(__aiQuotaTestHooks.AI_QUOTA_ENDPOINT);
    expect(values[4]).toBe(1); // cost for plain chat
    expect(values[5]).toBe(5); // limit — FREE_LIMITS.aiRequestsPerDay
  });

  it("fails closed with 503 when the quota circuit breaker is open", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    for (let i = 0; i < 20; i += 1) {
      aiQuotaCircuitBreaker.recordFailure(new Error(`db down ${i}`));
    }

    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);

    expect(ok).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.headers["Retry-After"]).toBeDefined();
    expect((res.body as { code?: string }).code).toBe("AI_QUOTA_DB_DOWN");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("attaches an idempotent refund that decrements consumed quota once", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ request_count: 1 }], rowCount: 1 });
    const req = makeReq() as Request & {
      aiQuotaRefund?: () => Promise<void>;
    };

    const ok = await assertAiQuota(req, makeRes());
    await req.aiQuotaRefund?.();
    await req.aiQuotaRefund?.();

    expect(ok).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[1]![0]).toMatch(/UPDATE ai_usage_daily/);
    expect(pool.query.mock.calls[1]![1]).toEqual([
      "ip:unknown",
      expect.any(String),
      __aiQuotaTestHooks.DEFAULT_BUCKET,
      1,
      __aiQuotaTestHooks.AI_QUOTA_ENDPOINT,
    ]);
  });

  it("keys the daily bucket on the Europe/Kyiv civil day at the UTC→Kyiv boundary", async () => {
    // 2026-05-15T21:30:00Z = 2026-05-16 00:30 Kyiv (summer, UTC+3). The user's
    // Kyiv day has already rolled to the 16th, so the quota bucket must be
    // keyed `2026-05-16`, not the UTC-day `2026-05-15`. Otherwise "Спробуй
    // завтра" would open a new quota window at half past midnight Kyiv.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T21:30:00Z"));
    try {
      process.env["DATABASE_URL"] = "postgres://ignored";
      process.env["AI_QUOTA_DISABLED"] = "0";
      getSessionUser.mockResolvedValue(null);
      pool.query.mockResolvedValue({
        rows: [{ request_count: 1 }],
        rowCount: 1,
      });

      const ok = await assertAiQuota(makeReq(), makeRes());

      expect(ok).toBe(true);
      const [, values] = pool.query.mock.calls[0]!;
      expect(values[1]).toBe("2026-05-16");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refundConsumed test hook", () => {
  it("swallows refund store errors", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    pool.query.mockRejectedValue(
      Object.assign(new Error("refund write failed"), { code: "EWRITE" }),
    );

    await expect(
      __aiQuotaTestHooks.refundConsumed({
        subject: "u:test",
        day: "2026-01-01",
        bucket: "default",
        cost: 2,
      }),
    ).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledOnce();
  });
});

describe("assertAiQuota (plan-aware user limit — ADR-1.7)", () => {
  const findUpsert = () =>
    pool.query.mock.calls.find((c) =>
      /INSERT INTO ai_usage_daily/.test(c[0] as string),
    );

  beforeEach(() => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
  });

  it("caps an authenticated FREE user at 5/day (billing FREE_LIMITS)", async () => {
    getSessionUser.mockResolvedValue({ id: "u-free" });
    pool.query.mockImplementation(async (sql: string) => {
      // No subscription row → getUserPlan() returns synthetic free plan.
      if (/FROM subscriptions/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [{ request_count: 1 }], rowCount: 1 };
    });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.headers["X-AI-Quota-Remaining"]).toBe("4"); // 5 - 1
    const upsert = findUpsert();
    expect(upsert).toBeDefined();
    expect((upsert![1] as unknown[])[5]).toBe(5); // limit passed to UPSERT
  });

  it("leaves an authenticated PRO user unlimited (no quota row written)", async () => {
    getSessionUser.mockResolvedValue({ id: "u-pro" });
    pool.query.mockImplementation(async (sql: string) => {
      if (/FROM subscriptions/i.test(sql))
        return {
          rows: [
            {
              plan: "pro",
              status: "active",
              current_period_end: null,
              cancel_at_period_end: false,
              provider: "stripe",
            },
          ],
          rowCount: 1,
        };
      return { rows: [{ request_count: 1 }], rowCount: 1 };
    });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(findUpsert()).toBeUndefined(); // unlimited → no ai_usage_daily write
  });

  it("bypasses quota entirely for a founder user (AI_QUOTA_FOUNDER_IDS)", async () => {
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u-founder, u-teammate";
    getSessionUser.mockResolvedValue({ id: "u-founder" });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    // Founder short-circuits before the plan lookup AND the quota UPSERT.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("still caps a non-founder user when AI_QUOTA_FOUNDER_IDS is set", async () => {
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u-founder";
    getSessionUser.mockResolvedValue({ id: "u-free" });
    pool.query.mockImplementation(async (sql: string) => {
      if (/FROM subscriptions/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [{ request_count: 1 }], rowCount: 1 };
    });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    const upsert = findUpsert();
    expect(upsert).toBeDefined();
    expect((upsert![1] as unknown[])[5]).toBe(5); // free cap still enforced
  });

  it("falls back to the FREE cap when the plan lookup throws", async () => {
    getSessionUser.mockResolvedValue({ id: "u-err" });
    pool.query.mockImplementation(async (sql: string) => {
      if (/FROM subscriptions/i.test(sql)) throw new Error("subs db blip");
      return { rows: [{ request_count: 1 }], rowCount: 1 };
    });
    const res = makeRes();
    const ok = await assertAiQuota(makeReq(), res);
    expect(ok).toBe(true);
    const upsert = findUpsert();
    expect(upsert).toBeDefined();
    expect((upsert![1] as unknown[])[5]).toBe(5); // free cap enforced despite error
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
    expect(values![3]).toBe(__aiQuotaTestHooks.AI_QUOTA_ENDPOINT);
    expect(values![4]).toBe(3); // cost
    expect(values![5]).toBe(12); // limit
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
    expect(values![5]).toBe(5);
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
    // Key includes `endpoint` (constant `AI_QUOTA_ENDPOINT`), mirroring the
    // real 4-column PK (subject_key, usage_day, bucket, endpoint).
    expect(
      store.get(
        `u:x|2026-01-01|default|${__aiQuotaTestHooks.AI_QUOTA_ENDPOINT}`,
      ),
    ).toBe(3);
    expect(
      store.get(
        `u:x|2026-01-01|tool:create_debt|${__aiQuotaTestHooks.AI_QUOTA_ENDPOINT}`,
      ),
    ).toBe(9);
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

// AI-5 рішення 1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`)
// — «хід з дією коштує ОДИН запит». `chat.ts` видає `round_trip_ticket`
// лише коли перший тур повертає `tool_calls`; тут перевіряється сама
// перевірка квитка всередині `assertAiQuota`, незалежно від HTTP-шару.
describe("assertAiQuota — AI-5 round-trip ticket bypass", () => {
  it("валідний квиток для СВОГО юзера пропускає списання (нуль запитів до БД)", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-1" });
    const ticket = issueRoundTripTicket({ userId: "u-1" });

    const req = makeReq({}, { round_trip_ticket: ticket });
    const ok = await assertAiQuota(req, makeRes());

    expect(ok).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("квиток одноразовий: другий запит із тим самим квитком списує як звичайний", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-1" });
    pool.query.mockResolvedValue({ rows: [{ request_count: 1 }], rowCount: 1 });
    const ticket = issueRoundTripTicket({ userId: "u-1" });

    const ok1 = await assertAiQuota(
      makeReq({}, { round_trip_ticket: ticket }),
      makeRes(),
    );
    expect(ok1).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();

    // Replay того самого квитка — вже спожитий, тож падає на звичайне списання
    // (план + upsert квоти — 2 запити до БД).
    const ok2 = await assertAiQuota(
      makeReq({}, { round_trip_ticket: ticket }),
      makeRes(),
    );
    expect(ok2).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("підроблений / невідомий квиток НЕ звільняє від списання (не можна вдати continuation без реального першого ходу)", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-1" });
    pool.query.mockResolvedValue({ rows: [{ request_count: 1 }], rowCount: 1 });

    const ok = await assertAiQuota(
      makeReq({}, { round_trip_ticket: "forged-ticket-not-issued" }),
      makeRes(),
    );

    expect(ok).toBe(true);
    // Падає на звичайне списання: план + upsert квоти — 2 запити до БД.
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("квиток, виданий іншому userId, не спрацьовує для цього юзера", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-1" });
    pool.query.mockResolvedValue({ rows: [{ request_count: 1 }], rowCount: 1 });
    const ticket = issueRoundTripTicket({ userId: "someone-else" });

    const ok = await assertAiQuota(
      makeReq({}, { round_trip_ticket: ticket }),
      makeRes(),
    );

    expect(ok).toBe(true);
    // Падає на звичайне списання: план + upsert квоти — 2 запити до БД.
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("5 дій поспіль (перший запит + безкоштовний continuation) проходять на Free; 6-та впирається в 429", async () => {
    process.env["DATABASE_URL"] = "postgres://ignored";
    process.env["AI_QUOTA_DISABLED"] = "0";
    getSessionUser.mockResolvedValue({ id: "u-free" });
    const { query } = makeAtomicPoolMock();
    pool.query = query;

    for (let i = 0; i < 5; i += 1) {
      // Перший запит ходу — списує один квиток із денних 5.
      const firstOk = await assertAiQuota(makeReq(), makeRes());
      expect(firstOk).toBe(true);

      // `chat.ts` видає квиток лише коли модель повернула tool_use — тут
      // симулюємо саме цю гілку (хід з дією).
      const ticket = issueRoundTripTicket({ userId: "u-free" });
      const contOk = await assertAiQuota(
        makeReq({}, { round_trip_ticket: ticket }),
        makeRes(),
      );
      expect(contOk).toBe(true);
    }

    // 6-та дія: перший запит нового ходу впирається в вичерпаний денний ліміт.
    const sixthRes = makeRes();
    const sixthOk = await assertAiQuota(makeReq(), sixthRes);
    expect(sixthOk).toBe(false);
    expect(sixthRes.statusCode).toBe(429);
    expect((sixthRes.body as { code?: string }).code).toBe("AI_QUOTA");
  });
});
