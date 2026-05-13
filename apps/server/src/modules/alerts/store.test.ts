/**
 * Unit tests for `modules/alerts/store.ts`. We mock the `pg.Pool.query`
 * surface and assert the SQL shape + parameter binding — same pattern
 * as `modules/openclaw/store.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import {
  findRecentDedupMatch,
  incrementOccurrence,
  listPendingAlerts,
  markAlertEscalated,
  markAlertRepeated,
  markAlertSentryWarned,
  markAlertSnoozed,
  recordAlertAck,
  recordAlertPost,
  recordTelegramMessage,
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
      // Sprint 6 / escalation tiers (migration 063) — default to null
      // when the row was inserted without tier-transitions yet.
      repeated_at: null,
      sentry_warned_at: null,
      snoozed_until_at: null,
      metadata: { exec: 1 },
      // O4 / B.1 dedup fields default to null/1 when the DB row was
      // inserted without a `dedup_signature` (legacy path).
      dedup_signature: null,
      occurrence_count: 1,
      last_occurrence_at: null,
      telegram_chat_id: null,
      telegram_message_id: null,
    });
  });

  it("composes WF-105 repeat-ping filters (60min, not repeated, not snoozed)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, {
      olderThanMinutes: 60,
      notYetRepeated: true,
      notSnoozed: true,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("posted_at < NOW() - make_interval(mins => $1)");
    expect(sql).toContain("repeated_at IS NULL");
    expect(sql).toContain(
      "(snoozed_until_at IS NULL OR snoozed_until_at < NOW())",
    );
    // listPendingAlerts must NOT auto-filter `escalated_at` — WF-105 wants
    // ALL unacked >60min rows regardless of T1 outcome.
    expect(sql).not.toContain("escalated_at IS NULL");
    expect(params).toEqual([60, 50]);
  });

  it("composes WF-106 sentry-warn filters (120min, not sentry-warned, not snoozed)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listPendingAlerts(pool as unknown as Pool, {
      olderThanMinutes: 120,
      notYetSentryWarned: true,
      notSnoozed: true,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("sentry_warned_at IS NULL");
    expect(sql).toContain(
      "(snoozed_until_at IS NULL OR snoozed_until_at < NOW())",
    );
    expect(params).toEqual([120, 50]);
  });
});

describe("markAlertRepeated", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("marks repeated_at=NOW() with idempotency guard", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertRepeated(pool as unknown as Pool, "wf-15:9");
    expect(result).toEqual({
      ok: true,
      alreadyRepeated: false,
      notFound: false,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("UPDATE tg_alert_acks");
    expect(sql).toContain("SET repeated_at = NOW()");
    expect(sql).toContain("WHERE alert_id = $1 AND repeated_at IS NULL");
    expect(params).toEqual(["wf-15:9"]);
  });

  it("reports alreadyRepeated=true on cron retry within same tick", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertRepeated(pool as unknown as Pool, "wf-15:9");
    expect(result.alreadyRepeated).toBe(true);
    expect(result.notFound).toBe(false);
  });

  it("reports notFound=true for unknown alert", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await markAlertRepeated(pool as unknown as Pool, "ghost");
    expect(result).toEqual({
      ok: false,
      alreadyRepeated: false,
      notFound: true,
    });
  });
});

describe("markAlertSentryWarned", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("marks sentry_warned_at=NOW() with idempotency guard", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertSentryWarned(
      pool as unknown as Pool,
      "wf-15:9",
    );
    expect(result).toEqual({
      ok: true,
      alreadySentryWarned: false,
      notFound: false,
    });
    const [sql] = pool.query.mock.calls[0]!;
    expect(sql).toContain("SET sentry_warned_at = NOW()");
    expect(sql).toContain("WHERE alert_id = $1 AND sentry_warned_at IS NULL");
  });

  it("reports alreadySentryWarned=true on retry", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await markAlertSentryWarned(
      pool as unknown as Pool,
      "wf-15:9",
    );
    expect(result.alreadySentryWarned).toBe(true);
  });

  it("reports notFound=true for unknown alert", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await markAlertSentryWarned(
      pool as unknown as Pool,
      "ghost",
    );
    expect(result.notFound).toBe(true);
  });
});

describe("markAlertSnoozed", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("persists absolute snoozed_until_at and returns ISO string", async () => {
    const until = new Date("2026-05-13T11:00:00.000Z");
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ snoozed_until_at: until }],
    });
    const result = await markAlertSnoozed(pool as unknown as Pool, {
      alertId: "wf-15:9",
      snoozedUntilAt: until,
    });
    expect(result).toEqual({
      ok: true,
      notFound: false,
      snoozedUntilAt: "2026-05-13T11:00:00.000Z",
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("SET snoozed_until_at = $2");
    expect(sql).toContain("WHERE alert_id = $1");
    expect(params).toEqual(["wf-15:9", until]);
  });

  it("latest-write-wins: operator can extend 1h snooze to 4h", async () => {
    // First call — 1h snooze.
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ snoozed_until_at: new Date("2026-05-13T11:00:00Z") }],
    });
    await markAlertSnoozed(pool as unknown as Pool, {
      alertId: "wf-15:9",
      snoozedUntilAt: new Date("2026-05-13T11:00:00Z"),
    });
    // Second call — 4h snooze (no idempotency guard, UPDATE always wins).
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ snoozed_until_at: new Date("2026-05-13T14:00:00Z") }],
    });
    const result = await markAlertSnoozed(pool as unknown as Pool, {
      alertId: "wf-15:9",
      snoozedUntilAt: new Date("2026-05-13T14:00:00Z"),
    });
    expect(result.snoozedUntilAt).toBe("2026-05-13T14:00:00.000Z");
    // Both calls hit UPDATE, no separate SELECT — latest-write-wins.
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("reports notFound=true for unknown alert", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await markAlertSnoozed(pool as unknown as Pool, {
      alertId: "ghost",
      snoozedUntilAt: new Date(),
    });
    expect(result).toEqual({
      ok: false,
      notFound: true,
      snoozedUntilAt: null,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// O4 / B.1 — alert dedup / occurrence-counter
// ──────────────────────────────────────────────────────────────────────

describe("findRecentDedupMatch", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("returns null when no row matches in the window", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await findRecentDedupMatch(pool as unknown as Pool, {
      topic: "incidents",
      dedupSignature: "wf-15:railway-deploy-failed",
      windowMs: 600_000,
    });
    expect(result).toBeNull();
  });

  it("binds windowMs as seconds (double precision) for make_interval", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await findRecentDedupMatch(pool as unknown as Pool, {
      topic: "incidents",
      dedupSignature: "sig-a",
      windowMs: 600_000,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("make_interval(secs => $3::double precision)");
    expect(sql).toContain("last_occurrence_at IS NOT NULL");
    expect(sql).toContain("ORDER BY last_occurrence_at DESC");
    expect(params).toEqual(["incidents", "sig-a", 600]);
  });

  it("returns mapped record with dedup fields when match found", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "77",
          posted_at: new Date("2026-05-13T10:00:00Z"),
          alert_id: "wf-15:exec-1",
          topic: "incidents",
          severity: "P1",
          summary: "boom",
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          repeated_at: null,
          sentry_warned_at: null,
          snoozed_until_at: null,
          metadata: {},
          dedup_signature: "wf-15:boom",
          occurrence_count: 3,
          last_occurrence_at: new Date("2026-05-13T10:08:00Z"),
          telegram_chat_id: "-1001234567890",
          telegram_message_id: "99",
        },
      ],
    });
    const result = await findRecentDedupMatch(pool as unknown as Pool, {
      topic: "incidents",
      dedupSignature: "wf-15:boom",
      windowMs: 600_000,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(77);
    expect(result!.occurrence_count).toBe(3);
    expect(result!.dedup_signature).toBe("wf-15:boom");
    // BIGINT coercion to number per server-api SKILL hard rule.
    expect(result!.telegram_chat_id).toBe(-1001234567890);
    expect(result!.telegram_message_id).toBe(99);
    expect(result!.last_occurrence_at).toBe("2026-05-13T10:08:00.000Z");
  });
});

describe("incrementOccurrence", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("atomically increments occurrence_count and bumps last_occurrence_at", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          occurrence_count: 5,
          last_occurrence_at: new Date("2026-05-13T10:09:00Z"),
        },
      ],
    });
    const result = await incrementOccurrence(pool as unknown as Pool, 42);
    expect(result).toEqual({
      occurrenceCount: 5,
      lastOccurrenceAt: "2026-05-13T10:09:00.000Z",
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("occurrence_count = occurrence_count + 1");
    expect(sql).toContain("last_occurrence_at = NOW()");
    expect(sql).toContain("WHERE id = $1");
    expect(params).toEqual([42]);
  });

  it("returns NaN guard-value when row not found (race scenario)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await incrementOccurrence(pool as unknown as Pool, 999);
    expect(Number.isNaN(result.occurrenceCount)).toBe(true);
    expect(result.lastOccurrenceAt).toBe("");
  });
});

describe("recordTelegramMessage", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("sets telegram_chat_id + telegram_message_id and ok=true on success", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "42" }] });
    const result = await recordTelegramMessage(pool as unknown as Pool, {
      alertId: "wf-15:1",
      telegramChatId: -1001234567890,
      telegramMessageId: 99,
    });
    expect(result).toEqual({ ok: true });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("telegram_chat_id = $2");
    expect(sql).toContain("telegram_message_id = $3");
    expect(sql).toContain(
      "last_occurrence_at = COALESCE(last_occurrence_at, NOW())",
    );
    expect(sql).toContain("telegram_message_id IS NULL");
    expect(params).toEqual(["wf-15:1", -1001234567890, 99]);
  });

  it("returns ok=false when row already had message_id (n8n retry race)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await recordTelegramMessage(pool as unknown as Pool, {
      alertId: "wf-15:1",
      telegramChatId: -1,
      telegramMessageId: 1,
    });
    expect(result).toEqual({ ok: false });
  });
});
