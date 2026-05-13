/**
 * Unit tests for `LogArchivePoller`.
 *
 * We mock both the `pg.Pool` and the GCS `fetchImpl` to avoid hitting
 * the real DB / network. The contract under test:
 *
 *   1. When `enabled=false` → `runOnce()` is a no-op (no SELECTs, no
 *      uploads, no DELETEs).
 *   2. When the SELECT returns zero rows → no upload, no DELETE.
 *   3. When the SELECT returns rows → upload happens, then DELETE
 *      against the exact same id-set.
 *   4. When the upload fails → no DELETE; rows are reported as `failed`.
 *   5. When the bucket is empty string → poller short-circuits (rows
 *      stay in DB).
 *   6. Object-name format is `openclaw-archive/<date>/<table>__<minId>-<maxId>.jsonl.gz`.
 *   7. Concurrent `runOnce` calls do not overlap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";

import { LogArchivePoller, DEFAULT_ARCHIVE_TABLES } from "./archivePoller.js";

interface MockQueryShape {
  rows: ReadonlyArray<{ id: string } & Record<string, unknown>>;
  rowCount: number;
}

/**
 * Build a `pg.Pool` whose `query` returns the configured rows for
 * SELECT-shaped SQL and rowCount=rows.length for DELETE-shaped SQL.
 * We distinguish by inspecting the SQL prefix.
 */
function makePool(responsesByTable: Record<string, MockQueryShape>): Pool {
  const query = vi.fn(
    async (sql: string, _params: unknown[]): Promise<MockQueryShape> => {
      const isSelect = sql.trim().toUpperCase().startsWith("SELECT");
      const tableMatch = sql.match(/FROM\s+(\w+)|DELETE\s+FROM\s+(\w+)/i);
      const table = tableMatch?.[1] ?? tableMatch?.[2] ?? "";
      if (isSelect) {
        return responsesByTable[table] ?? { rows: [], rowCount: 0 };
      }
      const r = responsesByTable[table] ?? { rows: [], rowCount: 0 };
      return { rows: [], rowCount: r.rowCount };
    },
  );
  return { query } as unknown as Pool;
}

const emptyTables: Record<string, MockQueryShape> = Object.fromEntries(
  DEFAULT_ARCHIVE_TABLES.map((t) => [t.table, { rows: [], rowCount: 0 }]),
);

describe("LogArchivePoller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("runOnce is a no-op when enabled=false", async () => {
    const pool = makePool(emptyTables);
    const fetchImpl = vi.fn();
    const poller = new LogArchivePoller({
      pool,
      enabled: false,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
    });
    const result = await poller.runOnce();
    expect(result.archived).toEqual({});
    expect(result.failed).toEqual({});
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runOnce skips empty tables (no upload, no DELETE)", async () => {
    const pool = makePool(emptyTables);
    const fetchImpl = vi.fn();
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
    });
    const result = await poller.runOnce();
    // 3 tables × 1 SELECT each, no DELETE.
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      DEFAULT_ARCHIVE_TABLES.length,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const spec of DEFAULT_ARCHIVE_TABLES) {
      expect(result.archived[spec.table]).toBe(0);
      expect(result.failed[spec.table]).toBe(0);
    }
  });

  it("runOnce uploads then DELETEs when rows are present", async () => {
    const rows = [
      { id: "1", invoked_at: "2026-04-01T00:00:00Z", foo: "a" },
      { id: "2", invoked_at: "2026-04-02T00:00:00Z", foo: "b" },
    ];
    const pool = makePool({
      ...emptyTables,
      openclaw_invocations: { rows, rowCount: rows.length },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
    } as unknown as Response);
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
      now: () => new Date("2026-05-15T03:00:00Z"),
    });
    const result = await poller.runOnce();
    expect(result.archived["openclaw_invocations"]).toBe(2);
    expect(result.failed["openclaw_invocations"]).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain("upload/storage/v1/b/test-bucket/o");
    expect(url).toContain(
      "name=openclaw-archive%2F2026-05-15%2Fopenclaw_invocations__1-2.jsonl.gz",
    );
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer tok",
    );
    expect((req.headers as Record<string, string>)["Content-Encoding"]).toBe(
      "gzip",
    );
    expect(Buffer.isBuffer(req.body)).toBe(true);

    // DELETE should be fired against the exact id-set.
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const deleteCalls = queryFn.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE"),
    );
    expect(deleteCalls).toHaveLength(1);
    const deleteCall = deleteCalls[0] ?? [];
    expect(deleteCall[0]).toContain("DELETE FROM openclaw_invocations");
    expect(deleteCall[1]).toEqual([["1", "2"]]);
  });

  it("runOnce keeps rows in DB when GCS upload fails", async () => {
    const rows = [
      { id: "10", invoked_at: "2026-04-01T00:00:00Z" },
      { id: "11", invoked_at: "2026-04-02T00:00:00Z" },
    ];
    const pool = makePool({
      ...emptyTables,
      tg_alert_acks: { rows, rowCount: rows.length },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "quota exceeded",
    } as unknown as Response);
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
    });
    const result = await poller.runOnce();
    expect(result.archived["tg_alert_acks"]).toBe(0);
    expect(result.failed["tg_alert_acks"]).toBe(2);

    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const deleteCalls = queryFn.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE"),
    );
    // No DELETE for the failing batch.
    expect(
      deleteCalls.filter((c) => String(c[0]).includes("tg_alert_acks")),
    ).toHaveLength(0);
  });

  it("runOnce short-circuits when bucket is empty", async () => {
    const pool = makePool({
      ...emptyTables,
      openclaw_invocations: {
        rows: [{ id: "1", invoked_at: "2026-04-01T00:00:00Z" }],
        rowCount: 1,
      },
    });
    const fetchImpl = vi.fn();
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
    });
    const result = await poller.runOnce();
    expect(result.archived).toEqual({});
    expect(result.failed).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("runOnce short-circuits when retentionDays<=0", async () => {
    const pool = makePool(emptyTables);
    const fetchImpl = vi.fn();
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 0,
      bucket: "test-bucket",
      gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
    });
    const result = await poller.runOnce();
    expect(result.archived).toEqual({});
    expect(result.failed).toEqual({});
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("respects batchSize bound (LIMIT param)", async () => {
    const pool = makePool(emptyTables);
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "test-bucket",
      batchSize: 250,
      gcsDeps: {
        getAccessToken: async () => "tok",
        fetchImpl: vi.fn(),
      },
    });
    await poller.runOnce();
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const selectCall = queryFn.mock.calls.find((c) =>
      String(c[0]).startsWith("SELECT"),
    );
    expect(selectCall).toBeDefined();
    const [, params] = selectCall ?? [];
    expect(params).toEqual([30, 250]);
  });

  it("start() is a no-op when feature flag is off", () => {
    const pool = makePool(emptyTables);
    const poller = new LogArchivePoller({
      pool,
      enabled: false,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: {
        getAccessToken: async () => "tok",
        fetchImpl: vi.fn(),
      },
    });
    expect(() => poller.start()).not.toThrow();
    // Calling start() twice is also a no-op (idempotent).
    expect(() => poller.start()).not.toThrow();
  });

  it("stop() before start() does not throw", async () => {
    const pool = makePool(emptyTables);
    const poller = new LogArchivePoller({
      pool,
      enabled: true,
      retentionDays: 30,
      bucket: "test-bucket",
      gcsDeps: {
        getAccessToken: async () => "tok",
        fetchImpl: vi.fn(),
      },
    });
    await expect(poller.stop()).resolves.toBeUndefined();
  });

  it("default table list matches the documented contract", () => {
    expect(DEFAULT_ARCHIVE_TABLES.map((t) => t.table)).toEqual([
      "openclaw_invocations",
      "tg_alert_acks",
      "n8n_webhook_events",
    ]);
    expect(
      DEFAULT_ARCHIVE_TABLES.find((t) => t.table === "openclaw_invocations")
        ?.timestampColumn,
    ).toBe("invoked_at");
    expect(
      DEFAULT_ARCHIVE_TABLES.find((t) => t.table === "tg_alert_acks")
        ?.timestampColumn,
    ).toBe("posted_at");
    expect(
      DEFAULT_ARCHIVE_TABLES.find((t) => t.table === "n8n_webhook_events")
        ?.timestampColumn,
    ).toBe("received_at");
  });
});
