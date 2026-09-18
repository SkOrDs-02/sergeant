import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLMMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
}));

vi.mock("../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: invokeLLMMock,
}));

const INTERNAL_AUTH_GUARD_TIMEOUT_MS = 45_000;

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

async function makeApp(internalKey: string | undefined, pool = makePool()) {
  vi.resetModules();
  invokeLLMMock.mockReset();
  vi.doMock("../lib/llm/provider.js", () => ({
    getLLMProvider: vi.fn(() => ({ name: "stub" })),
    invokeLLM: invokeLLMMock,
  }));
  if (internalKey === undefined) delete process.env["INTERNAL_API_KEY"];
  else process.env["INTERNAL_API_KEY"] = internalKey;
  process.env["ANTHROPIC_API_KEY"] = "anthropic-test-key";

  const { createInternalRouter } = await import("./internal/index.js");
  const app = express();
  app.use(express.json());
  app.use(createInternalRouter({ pool: pool as never }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    },
  );
  return { app, pool };
}

describe("/api/internal/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "fails closed when INTERNAL_API_KEY is not configured",
    async () => {
      const { app } = await makeApp(undefined);
      const res = await request(app)
        .post("/api/internal/ai-usage")
        .send({ source: "n8n" });

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "Internal API not configured" });
    },
    INTERNAL_AUTH_GUARD_TIMEOUT_MS,
  );

  it(
    "rejects requests with an invalid bearer token",
    async () => {
      const { app } = await makeApp("secret");
      const res = await request(app)
        .post("/api/internal/ai-usage")
        .set("Authorization", "Bearer wrong")
        .send({ source: "n8n" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    },
    INTERNAL_AUTH_GUARD_TIMEOUT_MS,
  );

  it("records n8n AI usage using the real ai_usage_daily schema", async () => {
    const pool = makePool();
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/ai-usage")
      .set("Authorization", "Bearer secret")
      .send({
        source: "mono-enrichment",
        bucket: "categorize",
        inputTokens: 17,
        outputTokens: 5,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toContain("request_count");
    expect(sql).toContain("input_tokens");
    expect(sql).toContain("output_tokens");
    expect(sql).toContain("total_tokens");
    expect(sql).not.toContain("requests_count");
    expect(values).toEqual([
      "n8n:mono-enrichment",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      "categorize",
      17,
      5,
      22,
      // Міграція 091 додала ендпоінт у грануляцію UPSERT-у: без нього рядки
      // n8n не дедуплікуються (NULL-и в Postgres унікальні між собою).
      "n8n:mono-enrichment",
    ]);
  });

  it("upgrades billing through the internal guarded route (canonical subscriptions table)", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, plan: "pro", status: "active", provider: "manual" }],
    });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/billing/upgrade")
      .set("Authorization", "Bearer secret")
      .send({ userId: "u_1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      subscription: {
        id: 1,
        plan: "pro",
        status: "active",
        provider: "manual",
      },
    });
    const [sql, values] = pool.query.mock.calls[0]!;
    // Guard проти регресії audit ws-08: попередня версія писала в
    // неіснуючу таблицю `users` і падала 500 на проді.
    expect(sql).toContain("INSERT INTO subscriptions");
    expect(sql).not.toContain("UPDATE users");
    expect(values).toEqual(["u_1"]);
  });

  it("downgrade returns 404 when the user has no active subscription", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/billing/downgrade")
      .set("Authorization", "Bearer secret")
      .send({ userId: "u_ghost" });

    expect(res.status).toBe(404);
    // Downgrade спершу best-effort сигналить провайдерам зупинити списання
    // (SELECT provider_subscription_id …), і лише потім робить SQL-cancel.
    const sqls = pool.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("UPDATE subscriptions"))).toBe(true);
  });

  it("rejects unsafe prompt slugs before reading from disk", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .get("/api/internal/prompts/console/ops.agent")
      .set("Authorization", "Bearer secret");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid prompt slug" });
  });

  it("returns 502 when internal categorization cannot reach the AI service", async () => {
    const { app } = await makeApp("secret");
    invokeLLMMock.mockResolvedValueOnce({
      ok: false,
      error: "Anthropic error",
      status: 502,
    });

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "test@example.com grocery", amount: -12345 });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "AI service error" });
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    const [, opts] = invokeLLMMock.mock.calls[0]!;
    expect(JSON.stringify(opts)).not.toContain("test@example.com");
  });

  it("rule-based MCC fast-path skips Anthropic for known supermarket MCC", async () => {
    const { app } = await makeApp("secret");

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "СІЛЬПО Київ", amount: -54321, mcc: 5411 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "groceries", confidence: 1 });
    // Critical: AI fallback MUST NOT be invoked when MCC is known.
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("rule-based MCC fast-path skips Anthropic for known fuel-station MCC", async () => {
    const { app } = await makeApp("secret");

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "WOG Kyiv", amount: -120000, mcc: 5541 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "transport", confidence: 1 });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("falls through to Anthropic when MCC is unknown", async () => {
    const { app } = await makeApp("secret");
    invokeLLMMock.mockResolvedValueOnce({
      ok: true,
      text: '{"category":"other","confidence":0.42}',
    });

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "some merchant", amount: -1000, mcc: 1234 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "other", confidence: 0.42 });
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to Anthropic when MCC is 0 / absent", async () => {
    const { app } = await makeApp("secret");
    invokeLLMMock.mockResolvedValueOnce({
      ok: true,
      text: '{"category":"shopping","confidence":0.7}',
    });

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "p2p transfer", amount: -500 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "shopping", confidence: 0.7 });
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
  });

  it("logs an email sent and reports xmax=0 as isNew=true", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "1", xmax: "0" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/email/sent")
      .set("Authorization", "Bearer secret")
      .send({
        campaignKey: "d7_check",
        recipientId: "u_42",
        recipientEmailHash: "sha256:abc",
        providerMessageId: "msg_xyz",
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 1, isNew: true });
  });

  it("rejects email events with an unknown event type", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/email/event")
      .set("Authorization", "Bearer secret")
      .send({
        providerMessageId: "msg_xyz",
        eventType: "exploded",
        occurredAt: "2026-04-29T10:00:00Z",
      });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid eventType" });
  });

  it("returns the user cohort for the requested day", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "u_1",
          email: "first@example.com",
          name: "First",
          createdAt: "2026-04-22T08:30:00Z",
        },
        {
          id: "u_2",
          email: "second@example.com",
          name: "Second",
          createdAt: "2026-04-22T11:15:00Z",
        },
      ],
    });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .get("/api/internal/users/cohort?days=7")
      .set("Authorization", "Bearer secret");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      days: 7,
      users: [
        {
          id: "u_1",
          email: "first@example.com",
          name: "First",
          createdAt: "2026-04-22T08:30:00Z",
        },
        {
          id: "u_2",
          email: "second@example.com",
          name: "Second",
          createdAt: "2026-04-22T11:15:00Z",
        },
      ],
    });
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toContain('FROM "user"');
    expect(values).toEqual([7, 200]);
  });

  it("rejects /api/internal/users/cohort when days is out of range", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .get("/api/internal/users/cohort?days=999")
      .set("Authorization", "Bearer secret");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "days must be a non-negative integer <= 365",
    });
  });
});
