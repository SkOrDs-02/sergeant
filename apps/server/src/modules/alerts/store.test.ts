/**
 * Unit tests for `modules/alerts/store.ts`. We mock the `pg.Pool.query`
 * surface and assert the SQL shape + parameter binding — same pattern
 * as `modules/openclaw/store.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import {
  listPendingAlerts,
  markAlertEscalated,
  recordAlertAck,
  recordAlertPost,
} from "./store.js";

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function makePool(): MockPool {
  return { query: vi.fn() };
}

describe("recordAlertPost", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("inserts a fresh row and returns alreadyPosted=false", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await recordAlertPost(pool as unknown as Pool, {
      alertId: "wf-15:1234",
      topic: "control_plane",
      severity: "P1",
      summary: "Railway deploy failed",
    });
    expect(result).toEqual({ id: 42, alreadyPosted: false });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO tg_alert_acks");
    expect(sql).toContain("ON CONFLICT (alert_id) DO NOTHING");
    expect(params).toEqual([
      "wf-15:1234",
      "control_plane",
      "P1",
      "Railway deploy failed",
      JSON.stringify({}),
    ]);
  });

  it("falls back to SELECT and returns alreadyPosted=true on conflict", async () => {
    // 1st call: INSERT … ON CONFLICT DO NOTHING → 0 rows.
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // 2nd call: SELECT id FROM tg_alert_acks WHERE alert_id = $1.
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "7" }] });

    const result = await recordAlertPost(pool as unknown as Pool, {
      alertId: "wf-15:1234",
      topic: "control_plane",
      severity: "P1",
    });
    expect(result).toEqual({ id: 7, alreadyPosted: true });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("serializes nullable metadata + summary as JSONB / NULL", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    await recordAlertPost(pool as unknown as Pool, {
      alertId: "wf-3:99",
      topic: "incidents",
      severity: "P0",
      metadata: { exec: 99 },
    });
    const params = pool.query.mock.calls[0]![1] as unknown[];
    expect(params[3]).toBeNull(); // summary
    expect(params[4]).toBe(JSON.stringify({ exec: 99 }));
  });
});

describe("recordAlertAck", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("returns ok=true / alreadyAcked=false on first click", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await recordAlertAck(pool as unknown as Pool, {
      alertId: "wf-15:1234",
      ackByTgUserId: 12345,
      ackAction: "read",
    });
    expect(result).toEqual({ ok: true, alreadyAcked: false, notFound: false });
    const [sql] = pool.query.mock.calls[0]!;
    expect(sql).toContain("UPDATE tg_alert_acks");
    expect(sql).toContain("ack_at IS NULL");
  });

  it("reports alreadyAcked=true when row exists with ack_at populated", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await recordAlertAck(pool as unknown as Pool, {
      alertId: "wf-15:1234",
      ackByTgUserId: 12345,
      ackAction: "investigating",
    });
    expect(result).toEqual({ ok: true, alreadyAcked: true, notFound: false });
  });

  it("reports notFound=true when alert row does not exist at all", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await recordAlertAck(pool as unknown as Pool, {
      alertId: "ghost",
      ackByTgUserId: 1,
      ackAction: "muted",
    });
    expect(result).toEqual({ ok: false, alreadyAcked: false, notFound: true });
  });
});

describe("markAlertEscalated", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("escalates a row with escalated_at NULL (cron first run)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertEscalated(pool as unknown as Pool, "wf-15:9");
    expect(result).toEqual({
      ok: true,
      alreadyEscalated: false,
      notFound: false,
    });
  });

  it("returns alreadyEscalated=true on cron retry", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertEscalated(pool as unknown as Pool, "wf-15:9");
    expect(result.alreadyEscalated).toBe(true);
    expect(result.notFound).toBe(false);
  });

  it("returns notFound=true for unknown alert", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await markAlertEscalated(pool as unknown as Pool, "ghost");
    expect(result.notFound).toBe(true);
  });
});

describe("listPendingAlerts", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("filters on ack_at IS NULL by default with limit fallback", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, {});
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("WHERE ack_at IS NULL");
    expect(sql).toContain("ORDER BY posted_at DESC");
    // Only the limit param.
    expect(params).toEqual([50]);
  });

  it("composes WF-103 cron filters (severity P0, 15-min, not escalated)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, {
      severity: "P0",
      olderThanMinutes: 15,
      notYetEscalated: true,
      limit: 25,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("severity = $1");
    expect(sql).toContain("posted_at < NOW() - make_interval(mins => $2)");
    expect(sql).toContain("escalated_at IS NULL");
    expect(params).toEqual(["P0", 15, 25]);
  });

  it("clamps limit between 1 and 100", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, { limit: 999 });
    const params = pool.query.mock.calls[0]![1] as unknown[];
    expect(params[params.length - 1]).toBe(100);

    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, { limit: 0 });
    const params2 = pool.query.mock.calls[1]![1] as unknown[];
    expect(params2[params2.length - 1]).toBe(1);
  });

  it("maps DB row -> ISO timestamps + Number coercion for BIGINTs", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "42",
          posted_at: new Date("2026-05-03T10:00:00Z"),
          alert_id: "wf-15:1",
          topic: "control_plane",
          severity: "P1",
          summary: "boom",
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: { exec: 1 },
        },
      ],
    });
    const list = await listPendingAlerts(pool as unknown as Pool, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 42,
      posted_at: "2026-05-03T10:00:00.000Z",
      alert_id: "wf-15:1",
      topic: "control_plane",
      severity: "P1",
      summary: "boom",
      ack_at: null,
      ack_by_tg_user_id: null,
      ack_action: null,
      escalated_at: null,
      metadata: { exec: 1 },
    });
  });
});
