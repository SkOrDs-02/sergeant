/**
 * Unit tests for `modules/topic-archive/store.ts`. Mocks the
 * `pg.Pool.query` surface and asserts SQL shape + parameter binding.
 * Mirrors the pattern in `modules/alerts/store.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { listTopicMessages, recordTopicMessage } from "./store.js";

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function makePool(): MockPool {
  return { query: vi.fn() };
}

describe("recordTopicMessage", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("inserts a fresh row and returns alreadyArchived=false", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "11" }] });
    const result = await recordTopicMessage(pool as unknown as Pool, {
      topic: "incidents",
      text: "Railway deploy failed",
      source: "alert",
      dedupeKey: "wf-15:1234",
      metadata: { severity: "P1" },
    });
    expect(result).toEqual({ id: 11, alreadyArchived: false });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO tg_topic_archive");
    // Idempotency clause must scope to non-null dedupe_key — NULLs stay
    // distinct so manual posts never collide with each other.
    expect(sql).toContain(
      "ON CONFLICT (topic, dedupe_key) WHERE dedupe_key IS NOT NULL",
    );
    expect(params).toEqual([
      "incidents",
      0, // messageId default
      "Railway deploy failed",
      "alert",
      "wf-15:1234",
      JSON.stringify({ severity: "P1" }),
      null, // sentAt → COALESCE($7, NOW())
    ]);
  });

  it("falls back to SELECT and returns alreadyArchived=true on conflict", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "7" }] });

    const result = await recordTopicMessage(pool as unknown as Pool, {
      topic: "incidents",
      text: "x",
      source: "alert",
      dedupeKey: "wf-15:1234",
    });
    expect(result).toEqual({ id: 7, alreadyArchived: true });
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [selectSql, selectParams] = pool.query.mock.calls[1]!;
    expect(selectSql).toContain("SELECT id FROM tg_topic_archive");
    expect(selectParams).toEqual(["incidents", "wf-15:1234"]);
  });

  it("treats null dedupeKey as 'always insert' (no SELECT fallback)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "5" }] });
    const result = await recordTopicMessage(pool as unknown as Pool, {
      topic: "digest",
      text: "Manual heads-up",
      source: "post_to_topic",
      dedupeKey: null,
    });
    expect(result).toEqual({ id: 5, alreadyArchived: false });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const params = pool.query.mock.calls[0]![1] as unknown[];
    expect(params[4]).toBeNull(); // dedupe_key
    expect(params[5]).toBe(JSON.stringify({})); // metadata default
  });

  it("propagates messageId + custom sentAt overrides", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    const sentAt = new Date("2026-05-04T12:00:00Z");
    await recordTopicMessage(pool as unknown as Pool, {
      topic: "digest",
      text: "x",
      source: "post_to_topic",
      messageId: 4242,
      sentAt,
    });
    const params = pool.query.mock.calls[0]![1] as unknown[];
    expect(params[1]).toBe(4242);
    expect(params[6]).toBe(sentAt);
  });
});

describe("listTopicMessages", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = makePool();
  });

  it("filters by topic with default limit=20, newest-first", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listTopicMessages(pool as unknown as Pool, { topic: "incidents" });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("FROM tg_topic_archive");
    expect(sql).toContain("ORDER BY sent_at DESC");
    expect(params).toEqual(["incidents", 20]);
  });

  it("composes since + limit clauses (LLM read with explicit window)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listTopicMessages(pool as unknown as Pool, {
      topic: "digest",
      sinceIso: "2026-05-01T00:00:00Z",
      limit: 5,
    });
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("sent_at >= $2");
    expect(params).toEqual(["digest", "2026-05-01T00:00:00Z", 5]);
  });

  it("clamps limit between 1 and 100", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listTopicMessages(pool as unknown as Pool, {
      topic: "x",
      limit: 999,
    });
    const params1 = pool.query.mock.calls[0]![1] as unknown[];
    expect(params1[params1.length - 1]).toBe(100);

    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await listTopicMessages(pool as unknown as Pool, { topic: "x", limit: 0 });
    const params2 = pool.query.mock.calls[1]![1] as unknown[];
    expect(params2[params2.length - 1]).toBe(1);
  });

  it("maps DB row → API record (ISO timestamps, BIGINT coercion)", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "42",
          sent_at: new Date("2026-05-03T10:00:00Z"),
          topic: "incidents",
          message_id: "1234",
          text: "boom",
          source: "alert",
          dedupe_key: "wf-15:1",
          metadata: { severity: "P0" },
        },
      ],
    });
    const list = await listTopicMessages(pool as unknown as Pool, {
      topic: "incidents",
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 42,
      sentAt: "2026-05-03T10:00:00.000Z",
      topic: "incidents",
      messageId: 1234,
      text: "boom",
      source: "alert",
      dedupeKey: "wf-15:1",
      metadata: { severity: "P0" },
    });
  });

  it("preserves null dedupe_key + empty metadata in output", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "9",
          sent_at: new Date("2026-05-03T10:00:00Z"),
          topic: "digest",
          message_id: 0,
          text: "manual",
          source: "post_to_topic",
          dedupe_key: null,
          metadata: null,
        },
      ],
    });
    const [row] = await listTopicMessages(pool as unknown as Pool, {
      topic: "digest",
    });
    expect(row?.dedupeKey).toBeNull();
    expect(row?.metadata).toEqual({});
  });
});
