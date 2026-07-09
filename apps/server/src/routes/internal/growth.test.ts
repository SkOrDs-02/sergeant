import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function makeApp(
  queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "11" }] }),
) {
  const { createGrowthInternalRouter } = await import("./growth.js");
  const app = express();
  app.use(express.json());
  app.use(createGrowthInternalRouter({ pool: { query: queryMock } as never }));
  return app;
}

describe("createGrowthInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and upserts funnel rows while skipping incomplete rows", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    const app = await makeApp(queryMock);

    const invalid = await request(app)
      .post("/api/internal/growth/funnel")
      .send({ snapshotDate: "2026/06/25", rows: [] });
    expect(invalid.status).toBe(400);

    const res = await request(app)
      .post("/api/internal/growth/funnel")
      .send({
        snapshotDate: "2026-06-25",
        rows: [
          { step: "signup" },
          {
            step: "activated",
            stepOrder: 2.9,
            count: -5,
            conversionRate: 0.42,
            raw: { source: "test" },
          },
        ],
      });

    expect(res.body).toEqual({ ok: true, inserted: 1 });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-25",
      "activated",
      2,
      "all",
      0,
      0.42,
      JSON.stringify({ source: "test" }),
    ]);
  });

  it("upserts cohort, acquisition, feature adoption and revenue snapshots", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "42" }] });
    const app = await makeApp(queryMock);

    const cohort = await request(app)
      .post("/api/internal/growth/cohort")
      .send({
        rows: [
          { cohortStart: "bad", periodOffset: 1 },
          {
            cohortStart: "2026-06-02",
            periodOffset: 2.7,
            cohortSize: 10,
            retained: 7,
            retentionRate: 0.7,
          },
        ],
      });
    expect(cohort.body).toEqual({ ok: true, inserted: 1 });

    const acquisition = await request(app)
      .post("/api/internal/growth/acquisition")
      .send({
        snapshotDate: "2026-06-25",
        rows: [
          { medium: "email" },
          {
            source: "linkedin",
            signups: 3,
            spendCents: 1250.9,
            cacCents: 416.7,
            raw: { campaignId: "c1" },
          },
        ],
      });
    expect(acquisition.body).toEqual({ ok: true, inserted: 1 });

    const adoption = await request(app)
      .post("/api/internal/growth/feature-adoption")
      .send({
        weekStart: "2026-06-22",
        rows: [
          { module: "finyk" },
          {
            featureKey: "mono-sync",
            activeUsers: 8,
            totalUsers: 10,
            adoptionRate: 0.8,
          },
        ],
      });
    expect(adoption.body).toEqual({ ok: true, inserted: 1 });

    const revenue = await request(app)
      .post("/api/internal/revenue/snapshot")
      .send({
        snapshotDate: "2026-06-25",
        mrrCents: 1234.9,
        arrCents: 14_819,
        activeSubscriptions: 4,
        logoChurnCount: -2,
        raw: { source: "stripe" },
      });
    expect(revenue.body).toEqual({ ok: true, id: 42 });

    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(queryMock.mock.calls[0]?.[1]).toEqual(["2026-06-02", 2, 10, 7, 0.7]);
    expect(queryMock.mock.calls[1]?.[1]).toEqual([
      "2026-06-25",
      "linkedin",
      "",
      "",
      3,
      "1250",
      "416",
      JSON.stringify({ campaignId: "c1" }),
    ]);
    expect(queryMock.mock.calls[2]?.[1]).toEqual([
      "2026-06-22",
      "mono-sync",
      "core",
      8,
      10,
      0.8,
    ]);
    expect(queryMock.mock.calls[3]?.[1]).toEqual([
      "2026-06-25",
      "1234",
      "14819",
      "0",
      4,
      "0",
      "0",
      "0",
      "0",
      "0",
      0,
      JSON.stringify({ source: "stripe" }),
    ]);
  });

  it("clamps negative acquisition spend/cac cents to 0 before binding", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "5" }] });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/growth/acquisition")
      .send({
        snapshotDate: "2026-06-25",
        rows: [
          {
            source: "linkedin",
            signups: 3,
            spendCents: -1250.9,
            cacCents: -416.7,
          },
        ],
      });

    expect(res.body).toEqual({ ok: true, inserted: 1 });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0]?.[1];
    // spend_cents ($6) та cac_cents ($7) не мають персистити від'ємне.
    expect(params?.[5]).toBe("0");
    expect(params?.[6]).toBe("0");
  });

  it("rejects invalid snapshot dates before writing", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const revenue = await request(app)
      .post("/api/internal/revenue/snapshot")
      .send({ snapshotDate: "not-a-date" });
    const acquisition = await request(app)
      .post("/api/internal/growth/acquisition")
      .send({ snapshotDate: "not-a-date" });
    const adoption = await request(app)
      .post("/api/internal/growth/feature-adoption")
      .send({ weekStart: "not-a-date" });

    expect(revenue.status).toBe(400);
    expect(acquisition.status).toBe(400);
    expect(adoption.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
