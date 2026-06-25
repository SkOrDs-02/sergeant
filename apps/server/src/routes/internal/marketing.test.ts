import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../http/index.js", () => ({
  asyncHandler:
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    },
}));

async function makeApp(
  queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "11", xmax: "0" }] }),
) {
  const { createMarketingInternalRouter } = await import("./marketing.js");
  const app = express();
  app.use(express.json());
  app.use(
    createMarketingInternalRouter({ pool: { query: queryMock } as never }),
  );
  return app;
}

describe("createMarketingInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and upserts brand mentions", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "7", xmax: "0" }],
    });
    const app = await makeApp(queryMock);

    const invalid = await request(app)
      .post("/api/internal/marketing/mention")
      .send({ source: "google-alerts" });
    expect(invalid.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();

    const res = await request(app)
      .post("/api/internal/marketing/mention")
      .send({
        source: "google-alerts",
        url: "https://example.com/post",
        title: "Sergeant mentioned",
        excerpt: "A useful app",
        author: "Analyst",
        sentiment: "POSITIVE",
        relevanceScore: 0.82,
        mentionedAt: "2026-06-25T08:00:00.000Z",
        raw: { source: "fixture" },
      });

    expect(res.body).toEqual({
      ok: true,
      kind: "brand",
      id: 7,
      isNew: true,
    });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "google-alerts",
      "https://example.com/post",
      "Sergeant mentioned",
      "A useful app",
      "Analyst",
      "positive",
      0.82,
      "2026-06-25T08:00:00.000Z",
      JSON.stringify({ source: "fixture" }),
    ]);
  });

  it("validates and upserts social mentions", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "9", xmax: "42" }],
    });
    const app = await makeApp(queryMock);

    const missingUrl = await request(app)
      .post("/api/internal/marketing/mention")
      .send({ platform: "x", postId: "p1" });
    expect(missingUrl.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/marketing/mention")
      .send({
        platform: "x",
        postId: "p1",
        url: "https://x.example/p1",
        authorHandle: "@sergeant",
        authorFollowers: 1200.8,
        text: "Trying Sergeant",
        engagement: -3,
        sentiment: "mixed",
        postedAt: "2026-06-25T08:00:00.000Z",
      });

    expect(res.body).toEqual({
      ok: true,
      kind: "social",
      id: 9,
      isNew: false,
    });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "x",
      "p1",
      "https://x.example/p1",
      "@sergeant",
      1200,
      "Trying Sergeant",
      0,
      null,
      "2026-06-25T08:00:00.000Z",
      "{}",
    ]);
  });

  it("validates and upserts app-store reviews", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "12", xmax: "0" }],
    });
    const app = await makeApp(queryMock);

    const invalidPlatform = await request(app)
      .post("/api/internal/marketing/review")
      .send({ platform: "web" });
    const missingExternalId = await request(app)
      .post("/api/internal/marketing/review")
      .send({ platform: "ios" });
    const invalidRating = await request(app)
      .post("/api/internal/marketing/review")
      .send({ platform: "ios", externalId: "r1", rating: 6 });

    expect(invalidPlatform.status).toBe(400);
    expect(missingExternalId.status).toBe(400);
    expect(invalidRating.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/marketing/review")
      .send({
        platform: "android",
        externalId: "r1",
        rating: 4.9,
        title: "Useful",
        body: "Keeps me on track",
        locale: "uk-UA",
        author: "D",
        topic: "habits",
        sentiment: "neutral",
        postedAt: "2026-06-24",
        raw: { store: "play" },
      });

    expect(res.body).toEqual({ ok: true, id: 12, isNew: true });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "android",
      "r1",
      4,
      "Useful",
      "Keeps me on track",
      "uk-UA",
      "D",
      "habits",
      "neutral",
      "2026-06-24",
      JSON.stringify({ store: "play" }),
    ]);
  });

  it("validates and upserts social channel snapshots", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "14" }] });
    const app = await makeApp(queryMock);

    const invalidDate = await request(app)
      .post("/api/internal/marketing/social-channel")
      .send({ snapshotDate: "today", platform: "telegram", channel: "main" });
    const missingChannel = await request(app)
      .post("/api/internal/marketing/social-channel")
      .send({ snapshotDate: "2026-06-25", platform: "telegram" });

    expect(invalidDate.status).toBe(400);
    expect(missingChannel.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/marketing/social-channel")
      .send({
        snapshotDate: "2026-06-25",
        platform: "telegram",
        channel: "main",
        followers: 42.9,
        newFollowers: -2,
        unsubs: 1.8,
        impressions: 1234.7,
        engagements: Number.POSITIVE_INFINITY,
      });

    expect(res.body).toEqual({ ok: true, id: 14 });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-25",
      "telegram",
      "main",
      42,
      0,
      1,
      "1234",
      "0",
      "{}",
    ]);
  });
});
