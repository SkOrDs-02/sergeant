import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../auth.js", () => ({ getSessionUser: vi.fn() }));
vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return { default: pool, pool };
});
vi.mock("../billing/getUserPlan.js", () => ({ getUserPlan: vi.fn() }));

import { getSessionUser as _getSessionUser } from "../../auth.js";
import _pool from "../../db.js";
import { getUserPlan as _getUserPlan } from "../billing/getUserPlan.js";
import { resolveProTier } from "./aiQuota.js";
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";

const getSessionUser = _getSessionUser as unknown as ReturnType<typeof vi.fn>;
const getUserPlan = _getUserPlan as unknown as ReturnType<typeof vi.fn>;
const pool = _pool as unknown as { query: ReturnType<typeof vi.fn> };

function makeReq(): Request {
  return {
    headers: {},
    socket: { remoteAddress: "1.2.3.4" },
  } as unknown as Request;
}
function makeRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(n: string, v: string) {
      headers[n] = v;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

/** A consumeQuota UPSERT that succeeded (row returned). */
const ok = (count = 1) => ({ rows: [{ request_count: count }] });
/** A consumeQuota UPSERT that was gated (no row → bucket full). */
const full = () => ({ rows: [] });

const ENV = [
  "AI_TIERED_PRO_ENABLED",
  "AI_QUOTA_DISABLED",
  "AI_QUOTA_FOUNDER_IDS",
  "AI_PRO_PREMIUM_DAILY_LIMIT",
  "AI_PRO_STANDARD_DAILY_LIMIT",
  "DATABASE_URL",
  "CHAT_MODEL_SYNTHESIS",
  "OPENROUTER_COACH_MODEL",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  vi.clearAllMocks();
  aiQuotaCircuitBreaker.reset();
  process.env["AI_TIERED_PRO_ENABLED"] = "true";
  process.env["DATABASE_URL"] = "postgres://x";
  delete process.env["AI_QUOTA_DISABLED"];
  delete process.env["AI_QUOTA_FOUNDER_IDS"];
  delete process.env["CHAT_MODEL_SYNTHESIS"];
  delete process.env["OPENROUTER_COACH_MODEL"];
  getSessionUser.mockResolvedValue({ id: "u1" });
  getUserPlan.mockResolvedValue({ plan: "pro" });
});
afterEach(() => {
  aiQuotaCircuitBreaker.reset();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveProTier — bypass paths return premium without touching DB", () => {
  it("flag off → premium, no DB roundtrip", async () => {
    process.env["AI_TIERED_PRO_ENABLED"] = "false";
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(pool.query).not.toHaveBeenCalled();
    expect(res.headers["X-AI-Tier"]).toBe("premium");
  });

  it("AI_QUOTA_DISABLED → premium", async () => {
    process.env["AI_QUOTA_DISABLED"] = "1";
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("anonymous (no session) → premium", async () => {
    getSessionUser.mockResolvedValue(null);
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("founder → premium, no plan lookup", async () => {
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u1,u2";
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(getUserPlan).not.toHaveBeenCalled();
  });

  it("free plan → premium (count-capped elsewhere, model not degraded)", async () => {
    getUserPlan.mockResolvedValue({ plan: "free" });
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("resolveProTier — Pro cascade premium → standard → floor", () => {
  it("premium bucket has room → premium tier (chat = Sonnet)", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(res.headers["X-AI-Tier"]).toBe("premium");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("premium exhausted, standard has room → standard tier (Haiku 4.5)", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(ok(1));
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(res.headers["X-AI-Tier"]).toBe("standard");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("both buckets exhausted → floor tier (Haiku 3), never blocks", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("floor");
    expect(r.model).toBe("claude-3-haiku-20240307");
    expect(res.headers["X-AI-Tier"]).toBe("floor");
  });

  it("coach endpoint premium → OpenRouter gpt-5.1", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("openai/gpt-5.1");
  });

  it("coach floor → reliable cheap OpenRouter model (gemini-flash-lite)", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("floor");
    expect(r.model).toBe("google/gemini-2.5-flash-lite");
  });
});

describe("resolveProTier — fail-open never blocks a paying user", () => {
  it("DB error on premium consume → premium (fail-open)", async () => {
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  it("plan lookup throws → premium (monetization-safe)", async () => {
    getUserPlan.mockRejectedValue(new Error("subs blip"));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("no DATABASE_URL → premium (fail-open)", async () => {
    delete process.env["DATABASE_URL"];
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });
});
