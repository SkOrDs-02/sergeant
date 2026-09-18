/**
 * Tests for the mobile sync v2 outbox enqueue helper and its integration
 * with the dual-write adapters (routine + finyk).
 *
 * Two levels:
 *  1. Unit — enqueueOutboxUpsert helper: inserts, idempotency, userId guard.
 *  2. Integration — adapter-level: calling applyRoutineDualWriteOps /
 *     applyFinykDualWriteOps writes both to the module table and appends
 *     a row to sync_op_outbox (fire-and-forget enqueue is confirmed by
 *     asserting the row count after await).
 *
 * Uses better-sqlite3 for an in-memory DB so tests are fast and hermetic.
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

import {
  enqueueOutboxUpsert,
  type OutboxUpsertInput,
} from "./enqueueOutboxUpsert";

// Routine adapter
import { applyRoutineDualWriteOps } from "../../modules/routine/lib/sqliteWriter/adapter";
// Finyk adapter
import { applyFinykDualWriteOps } from "../../modules/finyk/lib/sqliteWriter/adapter";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      return (params
        ? stmt.all(...(params as unknown[]))
        : stmt.all()) as unknown as R[];
    },
  };
}

interface OutboxRow extends Record<string, unknown> {
  id: number;
  user_id: string;
  table_name: string;
  op: string;
  row: string;
  idempotency_key: string;
}

function listOutboxRows(client: SqliteMigrationClient): OutboxRow[] {
  return client.all<OutboxRow>(
    `SELECT id, user_id, table_name, op, row, idempotency_key
       FROM sync_op_outbox
      ORDER BY id ASC`,
    [],
  ) as unknown as OutboxRow[];
}

// ---------------------------------------------------------------------------
// 1. Unit: enqueueOutboxUpsert helper
// ---------------------------------------------------------------------------

describe("enqueueOutboxUpsert helper (mobile)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  const baseInput: OutboxUpsertInput = {
    userId: "user-1",
    table: "routine_entries",
    op: "insert",
    row: { id: "h1:2026-07-10", user_id: "user-1" },
    clientTs: "2026-07-10T08:00:00.000Z",
    idempotencyKey: "test-key-001",
  };

  it("inserts a row and returns { inserted: true }", async () => {
    const result = await enqueueOutboxUpsert(client, baseInput);
    expect(result.inserted).toBe(true);
    expect(typeof result.id).toBe("number");

    const rows = listOutboxRows(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe("user-1");
    expect(rows[0]?.table_name).toBe("routine_entries");
    expect(rows[0]?.op).toBe("insert");
  });

  it("is idempotent — calling with the same idempotency key returns { inserted: false }", async () => {
    const first = await enqueueOutboxUpsert(client, baseInput);
    const second = await enqueueOutboxUpsert(client, baseInput);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.id).toBe(first.id);
    expect(listOutboxRows(client)).toHaveLength(1);
  });

  it("throws when userId is empty", async () => {
    await expect(
      enqueueOutboxUpsert(client, { ...baseInput, userId: "" }),
    ).rejects.toThrow("userId is required");
  });

  it("serialises row as JSON string", async () => {
    await enqueueOutboxUpsert(client, {
      ...baseInput,
      idempotencyKey: "key-json",
      row: { id: "x", nested: { a: 1 } },
    });
    const rows = listOutboxRows(client);
    const parsed: unknown = JSON.parse(rows[0]?.row as string);
    expect(parsed).toEqual({ id: "x", nested: { a: 1 } });
  });
});

// ---------------------------------------------------------------------------
// 2. Integration: routine adapter completion-add enqueues into outbox
// ---------------------------------------------------------------------------

describe("routine adapter enqueue integration (mobile)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  const USER_ID = "user-1";
  const CLIENT_TS = "2026-07-10T09:00:00.000Z";

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("completion-add writes routine_entries row AND enqueues to outbox", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "habit-1",
          dateKey: "2026-07-10",
          habitName: "Run",
        },
      ],
      { userId: USER_ID, clientTs: CLIENT_TS },
    );

    // Module table
    const entries = await client.all<{ id: string; name: string }>(
      `SELECT id, name FROM routine_entries WHERE user_id = ?`,
      [USER_ID],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("habit-1:2026-07-10");

    // Outbox — must have at least one routine_entries row (plus possible streaks increment)
    const outbox = listOutboxRows(client);
    const entriesOutbox = outbox.filter(
      (r) => r.table_name === "routine_entries",
    );
    expect(entriesOutbox.length).toBeGreaterThanOrEqual(1);
    expect(entriesOutbox[0]?.op).toBe("insert");
    expect(entriesOutbox[0]?.user_id).toBe(USER_ID);
  });

  it("completion-remove writes a delete outbox entry", async () => {
    // Add first
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "habit-1",
          dateKey: "2026-07-10",
          habitName: "Run",
        },
      ],
      { userId: USER_ID, clientTs: CLIENT_TS },
    );

    const tsLater = "2026-07-10T10:00:00.000Z";

    // Now remove
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-remove",
          habitId: "habit-1",
          dateKey: "2026-07-10",
        },
      ],
      { userId: USER_ID, clientTs: tsLater },
    );

    const outbox = listOutboxRows(client);
    const deleteOps = outbox.filter(
      (r) => r.table_name === "routine_entries" && r.op === "delete",
    );
    expect(deleteOps.length).toBeGreaterThanOrEqual(1);
    expect(deleteOps[0]?.user_id).toBe(USER_ID);
  });
});

// ---------------------------------------------------------------------------
// 3. Integration: finyk adapter id-upsert enqueues into outbox
// ---------------------------------------------------------------------------

describe("finyk adapter enqueue integration (mobile)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  const USER_ID = "user-1";
  const CLIENT_TS = "2026-07-10T09:00:00.000Z";

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    // Run routine migrations first (contains sync_op_outbox + sync_op_cursor)
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
    // Then finyk table migrations
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FINYK_CLIENT_MIGRATIONS,
      tableName: FINYK_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("id-upsert for finyk_hidden_accounts writes to the table AND enqueues outbox", async () => {
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts" as const,
          entry: { id: "acc-001" },
        },
      ],
      { userId: USER_ID, clientTs: CLIENT_TS },
    );

    // Module table
    const rows = await client.all<{ user_id: string }>(
      `SELECT user_id FROM finyk_hidden_accounts WHERE account_id = ?`,
      ["acc-001"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(USER_ID);

    // Outbox
    const outbox = listOutboxRows(client);
    const idOutbox = outbox.filter(
      (r) => r.table_name === "finyk_hidden_accounts",
    );
    expect(idOutbox.length).toBeGreaterThanOrEqual(1);
    expect(idOutbox[0]?.op).toBe("insert");
  });

  it("networth-upsert enqueues into finyk_networth_history outbox", async () => {
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "networth-upsert",
          entry: { month: "2026-07", networth: 500_000 },
        },
      ],
      { userId: USER_ID, clientTs: CLIENT_TS },
    );

    const outbox = listOutboxRows(client);
    const nwOutbox = outbox.filter(
      (r) => r.table_name === "finyk_networth_history",
    );
    expect(nwOutbox.length).toBeGreaterThanOrEqual(1);
    expect(nwOutbox[0]?.op).toBe("insert");
    const parsed = JSON.parse(nwOutbox[0]?.row as string) as {
      month: string;
      networth: number;
    };
    expect(parsed.month).toBe("2026-07");
    expect(parsed.networth).toBe(500_000);
  });

  it("mono-debt-link ops do NOT enqueue (local-only table)", async () => {
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "mono-debt-link-upsert",
          entry: { transactionId: "tx-1", debtIdsJson: '["d1"]' },
        },
      ],
      { userId: USER_ID, clientTs: CLIENT_TS },
    );

    const outbox = listOutboxRows(client);
    const monoOutbox = outbox.filter(
      (r) => r.table_name === "finyk_mono_debt_links",
    );
    expect(monoOutbox).toHaveLength(0);
  });
});
