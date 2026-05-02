import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicMessagesMock } = vi.hoisted(() => ({
  anthropicMessagesMock: vi.fn(),
}));

vi.mock("../lib/anthropic.js", () => ({
  anthropicMessages: anthropicMessagesMock,
}));

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

async function makeApp(internalKey: string | undefined, pool = makePool()) {
  vi.resetModules();
  anthropicMessagesMock.mockReset();
  vi.doMock("../lib/anthropic.js", () => ({
    anthropicMessages: anthropicMessagesMock,
  }));
  if (internalKey === undefined) delete process.env.INTERNAL_API_KEY;
  else process.env.INTERNAL_API_KEY = internalKey;
  process.env.ANTHROPIC_API_KEY = "anthropic-test-key";

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

  it("fails closed when INTERNAL_API_KEY is not configured", async () => {
    const { app } = await makeApp(undefined);
    const res = await request(app)
      .post("/api/internal/ai-usage")
      .send({ source: "n8n" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Internal API not configured" });
  });

  it("rejects requests with an invalid bearer token", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/ai-usage")
      .set("Authorization", "Bearer wrong")
      .send({ source: "n8n" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

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
    const [sql, values] = pool.query.mock.calls[0];
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
    ]);
  });

  it("updates billing through the internal guarded route", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: "u_1", email: "paid@example.com" }],
    });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/billing/upgrade")
      .set("Authorization", "Bearer secret")
      .send({ stripeCustomerId: "cus_123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      user: { id: "u_1", email: "paid@example.com" },
    });
    expect(pool.query.mock.calls[0][1]).toEqual(["cus_123"]);
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
    anthropicMessagesMock.mockResolvedValueOnce({
      response: { ok: false },
      data: {},
    });

    const res = await request(app)
      .post("/api/internal/categorize")
      .set("Authorization", "Bearer secret")
      .send({ description: "test@example.com grocery", amount: -12345 });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "AI service error" });
    expect(anthropicMessagesMock).toHaveBeenCalledTimes(1);
    const [, payload] = anthropicMessagesMock.mock.calls[0];
    expect(JSON.stringify(payload)).not.toContain("test@example.com");
  });

  // ── n8n base endpoints (PR — base for SEO/growth/marketing/governance) ──

  it("rejects /api/internal/seo/gsc-snapshot without a valid date", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/seo/gsc-snapshot")
      .set("Authorization", "Bearer secret")
      .send({ snapshotDate: "yesterday", rows: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "snapshotDate must be YYYY-MM-DD" });
  });

  it("upserts GSC rows and returns the inserted count", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [{ id: "42" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/seo/gsc-snapshot")
      .set("Authorization", "Bearer secret")
      .send({
        snapshotDate: "2026-04-29",
        rows: [
          {
            dimension: "query",
            dimensionValue: "трекер фінансів",
            clicks: 12,
            impressions: 480,
            ctr: 0.025,
            position: 6.4,
          },
          {
            dimension: "totals",
            clicks: 31,
            impressions: 1500,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, inserted: 2 });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("lists active SEO keywords with bigint→number coercion", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "9007199254740993", // > Number.MAX_SAFE_INTEGER would lose precision; we coerce blindly per Hard Rule #1
          term: "ai тренер",
          locale: "uk",
          market: "UA",
          priority: 80,
          target_url: "https://sergeant.app/fizruk",
          cluster: "fizruk",
          is_active: true,
        },
      ],
    });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .get("/api/internal/seo/keywords")
      .set("Authorization", "Bearer secret");

    expect(res.status).toBe(200);
    expect(typeof res.body.keywords[0].id).toBe("number");
    expect(res.body.keywords[0].term).toBe("ai тренер");
    expect(res.body.keywords[0].targetUrl).toBe("https://sergeant.app/fizruk");
  });

  it("validates strategy on /api/internal/seo/pagespeed", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/seo/pagespeed")
      .set("Authorization", "Bearer secret")
      .send({
        snapshotDate: "2026-04-29",
        url: "https://sergeant.app",
        strategy: "tablet",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "strategy must be mobile or desktop" });
  });

  it("upserts a competitor + snapshot and returns coerced ids", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "5" }] }) // competitor upsert
      .mockResolvedValueOnce({ rows: [{ id: "11" }] }); // snapshot
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/seo/competitor-snapshot")
      .set("Authorization", "Bearer secret")
      .send({
        snapshotDate: "2026-04-29",
        competitorDomain: "monobank.ua",
        competitorName: "Monobank",
        trafficEstimate: 500_000,
        topKeywords: [{ term: "monobank", position: 1 }],
        backlinksCount: 1234,
        domainRating: 70,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 11, competitorId: 5 });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("upserts a daily revenue snapshot with bigint cents", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "1" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/revenue/snapshot")
      .set("Authorization", "Bearer secret")
      .send({
        snapshotDate: "2026-04-29",
        mrrCents: 1_234_500,
        arrCents: 14_814_000,
        arpuCents: 49900,
        activeSubscriptions: 247,
        newMrrCents: 12_000,
        churnMrrCents: 9_500,
        netNewMrrCents: 2_500,
        logoChurnCount: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 1 });
    const [, values] = pool.query.mock.calls[0];
    expect(values[1]).toBe("1234500"); // mrr_cents passed as string per pg bigint protocol
    expect(values[3]).toBe("49900"); // arpu_cents
  });

  it("upserts a growth funnel snapshot row-by-row", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [{ id: "1" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/growth/funnel")
      .set("Authorization", "Bearer secret")
      .send({
        snapshotDate: "2026-04-29",
        rows: [
          { step: "visit", stepOrder: 1, count: 1000 },
          { step: "signup", stepOrder: 2, count: 50, conversionRate: 0.05 },
          { step: "paid", stepOrder: 6, count: 5, conversionRate: 0.005 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, inserted: 3 });
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("rejects /api/internal/marketing/review with rating out of range", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/marketing/review")
      .set("Authorization", "Bearer secret")
      .send({
        platform: "ios",
        externalId: "rev-123",
        rating: 6,
      });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "rating must be 1..5" });
  });

  it("upserts a brand mention and reports isNew", async () => {
    const pool = makePool();
    // xmax='0' means a fresh insert (no conflict).
    pool.query.mockResolvedValueOnce({ rows: [{ id: "7", xmax: "0" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/marketing/mention")
      .set("Authorization", "Bearer secret")
      .send({
        source: "google_alerts",
        url: "https://example.com/article-1",
        title: "Sergeant — нова українська суперапка",
        sentiment: "positive",
        relevanceScore: 0.93,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      kind: "brand",
      id: 7,
      isNew: true,
    });
  });

  it("normalizes invalid sentiment to NULL on social mention", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "9", xmax: "0" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/marketing/mention")
      .set("Authorization", "Bearer secret")
      .send({
        platform: "twitter",
        postId: "1234567890",
        url: "https://x.com/u/status/1234567890",
        authorHandle: "@somebody",
        authorFollowers: 12_000,
        text: "love sergeant",
        engagement: 18,
        sentiment: "love-it", // invalid → NULL
      });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("social");
    const [, values] = pool.query.mock.calls[0];
    // sentiment is the 8th positional ($8): platform=$1, post_id=$2, url=$3,
    // author_handle=$4, author_followers=$5, text=$6, engagement=$7, sentiment=$8
    expect(values[7]).toBeNull();
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
    const [sql, values] = pool.query.mock.calls[0];
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

  it("records a hard-rules violation through the governance audit endpoint", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "13" }] });
    const { app } = await makeApp("secret", pool);

    const res = await request(app)
      .post("/api/internal/governance/audit")
      .set("Authorization", "Bearer secret")
      .send({
        ruleId: 1,
        ruleTitle: "DB types: coerce bigint to number",
        prNumber: 707,
        commitSha: "abc1234",
        filePath: "apps/server/src/modules/finyk/foo.ts",
        lineNumber: 42,
        message: "bigint leaked as string in /finyk/foo response",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 13 });
    const [sql, values] = pool.query.mock.calls[0];
    expect(sql).toContain("hard_rules_violations");
    expect(values[2]).toBe("blocker"); // default severity
    expect(values[3]).toBe(707);
  });

  it("rejects governance audit without ruleId", async () => {
    const { app } = await makeApp("secret");
    const res = await request(app)
      .post("/api/internal/governance/audit")
      .set("Authorization", "Bearer secret")
      .send({ message: "missing ruleId" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "ruleId is required (number)" });
  });
});
