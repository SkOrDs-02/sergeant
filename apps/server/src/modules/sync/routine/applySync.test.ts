import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyRoutineEntries, applyRoutineStreaks } from "./applySync.js";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly queuedRows: unknown[][] = [];

  queueRows(rows: unknown[]): void {
    this.queuedRows.push(rows);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      return { rows: (this.queuedRows.shift() ?? []) as T[] };
    }
    return { rows: [] };
  }
}

function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

function op(row: Record<string, unknown>, kind: SyncV2Op["op"]): SyncV2Op {
  return {
    op: kind,
    table: "routine_entries",
    row,
    client_ts: "2026-07-21T08:00:00.000Z",
    idempotency_key: "test-op",
  };
}

function lastQuery(fake: FakeClient): RecordedQuery {
  const query = fake.queries[fake.queries.length - 1];
  if (!query) throw new Error("expected a recorded query");
  return query;
}

describe("applyRoutineEntries", () => {
  it("rejects missing user_id before touching the database", async () => {
    const fake = new FakeClient();

    await expect(
      applyRoutineEntries(
        asClient(fake),
        op({ id: "entry-1", name: "water" }, "insert"),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("inserts a new entry with server-side user id and parsed dates", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyRoutineEntries(
        asClient(fake),
        op(
          {
            id: "entry-1",
            user_id: "user-1",
            name: "water",
            completed_at: "2026-07-21T07:30:00.000Z",
            created_at: "2026-07-21T07:00:00.000Z",
          },
          "insert",
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO routine_entries");
    expect(insert.params).toEqual([
      "entry-1",
      "user-1",
      "water",
      new Date("2026-07-21T07:30:00.000Z"),
      new Date("2026-07-21T07:00:00.000Z"),
      clientTs,
      null,
    ]);
  });

  it("rejects stale writes against a tombstoned entry", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: new Date("2026-07-21T07:05:00.000Z"),
      },
    ]);

    await expect(
      applyRoutineEntries(
        asClient(fake),
        op({ id: "entry-1", user_id: "user-1", name: "water" }, "update"),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });
    expect(fake.queries).toHaveLength(1);
  });
});

describe("applyRoutineStreaks", () => {
  it("applies bounded increments without the LWW guard query", async () => {
    const fake = new FakeClient();

    await expect(
      applyRoutineStreaks(
        asClient(fake),
        {
          op: "increment",
          table: "routine_streaks",
          row: { user_id: "user-1", delta: -3 },
          client_ts: "2026-07-21T08:00:00.000Z",
          idempotency_key: "streak-inc-1",
        },
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "applied" });

    expect(fake.queries).toHaveLength(1);
    expect(lastQuery(fake).sql).toContain("GREATEST(0, $2::int)");
    expect(lastQuery(fake).params).toEqual(["user-1", -3]);
  });

  it("rejects non-integer increments", async () => {
    const fake = new FakeClient();

    await expect(
      applyRoutineStreaks(
        asClient(fake),
        {
          op: "increment",
          table: "routine_streaks",
          row: { user_id: "user-1", delta: 1.5 },
          client_ts: "2026-07-21T08:00:00.000Z",
          idempotency_key: "streak-inc-2",
        },
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_delta" });
    expect(fake.queries).toHaveLength(0);
  });
});
