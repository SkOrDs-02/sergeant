import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryReplicaMock } = vi.hoisted(() => ({
  queryReplicaMock: vi.fn(),
}));

vi.mock("../../dbReplica.js", () => ({
  queryReplica: queryReplicaMock,
}));

async function makeApp(
  queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "1" }], rowCount: 1 }),
) {
  const { createSeoInternalRouter } = await import("./seo.js");
  const app = express();
  app.use(express.json());
  app.use(createSeoInternalRouter({ pool: { query: queryMock } as never }));
  return app;
}

describe("createSeoInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates GSC snapshots and inserts only dimensioned rows", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "7" }] });
    const app = await makeApp(queryMock);

    const invalid = await request(app)
      .post("/api/internal/seo/gsc-snapshot")
      .send({ snapshotDate: "today" });
    expect(invalid.status).toBe(400);

    const empty = await request(app)
      .post("/api/internal/seo/gsc-snapshot")
      .send({ snapshotDate: "2026-06-24", rows: [] });
    expect(empty.body).toEqual({ ok: true, inserted: 0 });

    const res = await request(app)
      .post("/api/internal/seo/gsc-snapshot")
      .send({
        snapshotDate: "2026-06-24",
        rows: [
          { clicks: 99 },
          {
            dimension: "query",
            dimensionValue: "sergeant",
            clicks: -3,
            impressions: 12.9,
            ctr: 0.25,
            position: 2.2,
            raw: { source: "gsc" },
          },
        ],
      });

    expect(res.body).toEqual({ ok: true, inserted: 1 });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-24",
      "query",
      "sergeant",
      0,
      12,
      0.25,
      2.2,
      JSON.stringify({ source: "gsc" }),
    ]);
  }, 60_000);

  it("stores rank snapshots and maps keyword reads through replica", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "9" }] });
    queryReplicaMock.mockResolvedValueOnce({
      rows: [
        {
          id: "123",
          term: "sergeant app",
          locale: "uk",
          market: "UA",
          priority: 10,
          target_url: "https://example.com",
          cluster: "brand",
          is_active: true,
        },
      ],
    });
    const app = await makeApp(queryMock);

    const rank = await request(app)
      .post("/api/internal/seo/rank-snapshot")
      .send({
        snapshotDate: "2026-06-24",
        rows: [
          { keywordId: Number.NaN },
          // Дробовий id (42.8) має бути відкинутий, а не truncated до 42 —
          // інакше rank прив'язався б до чужого keyword.
          {
            keywordId: 42.8,
            position: 5,
            url: "https://wrong.example",
            raw: { rank: 5 },
          },
          {
            keywordId: 42,
            position: 3.6,
            url: "https://example.com",
            hasFeaturedSnippet: true,
            raw: { rank: 3 },
          },
        ],
      });
    expect(rank.body).toEqual({ ok: true, inserted: 1 });
    // Лише валідний цілий id доходить до pool.query — рівно один INSERT.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      42,
      "2026-06-24",
      "uk",
      "UA",
      "google",
      3,
      "https://example.com",
      true,
      JSON.stringify({ rank: 3 }),
    ]);

    const keywords = await request(app).get("/api/internal/seo/keywords");
    expect(keywords.body).toEqual({
      keywords: [
        {
          id: 123,
          term: "sergeant app",
          locale: "uk",
          market: "UA",
          priority: 10,
          targetUrl: "https://example.com",
          cluster: "brand",
          isActive: true,
        },
      ],
    });
    expect(queryReplicaMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE is_active = TRUE"),
      undefined,
      { op: "seo_keywords_list", primary: expect.anything() },
    );
  });

  it("validates and stores PageSpeed snapshots", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "11" }] });
    const app = await makeApp(queryMock);

    const missingUrl = await request(app)
      .post("/api/internal/seo/pagespeed")
      .send({ snapshotDate: "2026-06-24", strategy: "mobile" });
    expect(missingUrl.status).toBe(400);

    const invalidStrategy = await request(app)
      .post("/api/internal/seo/pagespeed")
      .send({
        snapshotDate: "2026-06-24",
        url: "https://example.com",
        strategy: "tablet",
      });
    expect(invalidStrategy.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/seo/pagespeed")
      .send({
        snapshotDate: "2026-06-24",
        url: "https://example.com",
        strategy: "desktop",
        performanceScore: 98.9,
        accessibilityScore: null,
        bestPracticesScore: 91.2,
        seoScore: 100,
        lcpMs: 1234.8,
        inpMs: Number.POSITIVE_INFINITY,
        clsScore: 0.02,
        ttfbMs: 200.1,
        raw: { source: "psi" },
      });

    expect(res.body).toEqual({ ok: true, id: 11 });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-24",
      "https://example.com",
      "desktop",
      98,
      null,
      91,
      100,
      1234,
      null,
      0.02,
      200,
      JSON.stringify({ source: "psi" }),
    ]);
  });

  it("stores backlink and sitemap health snapshots with defaults", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "13" }] });
    const app = await makeApp(queryMock);

    const backlinks = await request(app)
      .post("/api/internal/seo/backlinks")
      .send({
        snapshotDate: "2026-06-24",
        links: [
          { sourceUrl: "https://ref.example/a" },
          {
            sourceUrl: "https://ref.example/a",
            targetUrl: "https://example.com",
            anchor: "brand",
            domainRating: 70,
            urlRating: 20,
            isDofollow: false,
            firstSeen: "2026-01-01",
            lastSeen: "bad",
          },
        ],
      });
    expect(backlinks.body).toEqual({ ok: true, inserted: 1 });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-24",
      "https://ref.example/a",
      "https://example.com",
      "brand",
      70,
      20,
      false,
      "2026-01-01",
      null,
      "{}",
    ]);

    const sitemap = await request(app)
      .post("/api/internal/seo/sitemap-health")
      .send({
        snapshotDate: "2026-06-24",
        urls: [
          { url: "https://example.com/no-status" },
          {
            url: "https://example.com",
            statusCode: 200.9,
            inSitemap: true,
            inIndex: false,
            robotsBlocked: true,
            lastModified: "2026-06-01",
            raw: { ok: true },
          },
        ],
      });
    expect(sitemap.body).toEqual({ ok: true, inserted: 1 });
    expect(queryMock.mock.calls[1]?.[1]).toEqual([
      "2026-06-24",
      "https://example.com",
      200,
      true,
      false,
      true,
      "2026-06-01",
      JSON.stringify({ ok: true }),
    ]);
  });

  it("normalizes malformed sitemap lastModified to null", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "31" }] });
    const app = await makeApp(queryMock);

    const sitemap = await request(app)
      .post("/api/internal/seo/sitemap-health")
      .send({
        snapshotDate: "2026-06-24",
        urls: [
          {
            url: "https://example.com",
            statusCode: 200,
            inSitemap: true,
            inIndex: false,
            robotsBlocked: false,
            // Малформатне значення не має долетіти до date-колонки.
            lastModified: "not-a-date",
            raw: { ok: true },
          },
        ],
      });

    expect(sitemap.body).toEqual({ ok: true, inserted: 1 });
    // 7-й bind-параметр (last_modified) — null, а не сире "not-a-date".
    expect(queryMock.mock.calls[0]?.[1]?.[6]).toBeNull();
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-24",
      "https://example.com",
      200,
      true,
      false,
      false,
      null,
      JSON.stringify({ ok: true }),
    ]);
  });

  it("upserts competitor records before storing competitor snapshots", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "21" }] })
      .mockResolvedValueOnce({ rows: [{ id: "22" }] });
    const app = await makeApp(queryMock);

    const missingDomain = await request(app)
      .post("/api/internal/seo/competitor-snapshot")
      .send({ snapshotDate: "2026-06-24" });
    expect(missingDomain.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/seo/competitor-snapshot")
      .send({
        snapshotDate: "2026-06-24",
        competitorDomain: "competitor.example",
        competitorName: "Competitor",
        trafficEstimate: 1234,
        topKeywords: ["budget"],
        topPages: ["/pricing"],
        backlinksCount: 50,
        domainRating: 40,
        raw: { source: "manual" },
      });

    expect(res.body).toEqual({ ok: true, id: 22, competitorId: 21 });
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "competitor.example",
      "Competitor",
    ]);
    expect(queryMock.mock.calls[1]?.[1]).toEqual([
      21,
      "2026-06-24",
      1234,
      JSON.stringify(["budget"]),
      JSON.stringify(["/pricing"]),
      50,
      40,
      JSON.stringify({ source: "manual" }),
    ]);
  });
});
