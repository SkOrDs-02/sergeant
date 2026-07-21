import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import {
  purgeStaleTerminalOutbox,
  SYNC_OP_OUTBOX_STALE_TTL_DAYS,
  SYNC_OP_OUTBOX_TERMINAL_STATUSES,
} from "../sqlite/syncOpOutboxPurgeStale.js";
import {
  SYNC_OP_OUTBOX_STATUSES,
  type SyncOpOutboxStatus,
} from "../sqlite/routine.js";

/**
 * Integration tests for the TTL maintenance purge
 * ({@link purgeStaleTerminalOutbox}). Runs the full SPIKE + PR #040 +
 * PR #042d-prep migration stack against a fresh `:memory:` engine and
 * pins the safety contract: terminal-only, age-gated, fail-safe on
 * unparsable timestamps, optional user scope.
 */

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
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
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

const OLD_UTC = "2020-01-01 00:00:00"; // datetime('now') format, far past
const OLD_WITH_OFFSET = "2020-01-01T03:00:00.000+03:00"; // ISO-8601 + offset

let seq = 0;

function insertRow(
  db: BetterSqliteDatabase,
  opts: {
    status: SyncOpOutboxStatus;
    createdAt: string;
    userId?: string;
  },
): number {
  seq += 1;
  const info = db
    .prepare(
      `INSERT INTO sync_op_outbox
         (user_id, table_name, op, row, client_ts, idempotency_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.userId ?? "u-test",
      "routine_entries",
      "insert",
      JSON.stringify({ day_key: "2020-01-01" }),
      "2020-01-01T00:00:00.000+00:00",
      `idem-${seq}`,
      opts.status,
      opts.createdAt,
    );
  return Number(info.lastInsertRowid);
}

function recentIso(): string {
  return new Date().toISOString();
}

function countByStatus(
  db: BetterSqliteDatabase,
): Record<SyncOpOutboxStatus, number> {
  const out = Object.fromEntries(
    SYNC_OP_OUTBOX_STATUSES.map((s) => [s, 0]),
  ) as Record<SyncOpOutboxStatus, number>;
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS c FROM sync_op_outbox GROUP BY status`)
    .all() as { status: SyncOpOutboxStatus; c: number }[];
  for (const r of rows) out[r.status] = Number(r.c);
  return out;
}

function totalRows(db: BetterSqliteDatabase): number {
  return Number(
    (
      db.prepare(`SELECT COUNT(*) AS c FROM sync_op_outbox`).get() as {
        c: number;
      }
    ).c,
  );
}

describe("purgeStaleTerminalOutbox", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  // ───────────────────────────────────────────────────────────────
  // option validation
  // ───────────────────────────────────────────────────────────────

  describe("option validation", () => {
    it("throws when olderThanDays is 0", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, { olderThanDays: 0 }),
      ).rejects.toThrow(/finite number > 0/);
    });

    it("throws when olderThanDays is negative", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, { olderThanDays: -5 }),
      ).rejects.toThrow(/finite number > 0/);
    });

    it("throws when olderThanDays is not finite", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, { olderThanDays: Number.NaN }),
      ).rejects.toThrow(/finite number > 0/);
      await expect(
        purgeStaleTerminalOutbox(client, {
          olderThanDays: Number.POSITIVE_INFINITY,
        }),
      ).rejects.toThrow(/finite number > 0/);
    });

    it("throws on an empty statuses array", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, { olderThanDays: 30, statuses: [] }),
      ).rejects.toThrow(/non-empty array/);
    });

    it("refuses to purge 'pending' rows", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, {
          olderThanDays: 30,
          statuses: ["pending"],
        }),
      ).rejects.toThrow(/refusing to purge 'pending'/);
    });

    it("throws on an unknown status", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, {
          olderThanDays: 30,
          statuses: ["zombie" as SyncOpOutboxStatus],
        }),
      ).rejects.toThrow(/unknown status/);
    });

    it("throws when userId is an empty string", async () => {
      await expect(
        purgeStaleTerminalOutbox(client, { olderThanDays: 30, userId: "" }),
      ).rejects.toThrow(/must be non-empty/);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // age gating
  // ───────────────────────────────────────────────────────────────

  it("purges terminal rows older than the window, keeps recent ones", async () => {
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC });
    insertRow(db, { status: "rejected", createdAt: OLD_UTC });
    insertRow(db, { status: "dead_letter", createdAt: recentIso() });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: SYNC_OP_OUTBOX_STALE_TTL_DAYS,
    });

    expect(purged).toBe(2);
    expect(totalRows(db)).toBe(1);
    expect(countByStatus(db).dead_letter).toBe(1);
    expect(countByStatus(db).rejected).toBe(0);
  });

  it("never deletes 'pending' rows, even very old ones", async () => {
    insertRow(db, { status: "pending", createdAt: OLD_UTC });
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
    });

    expect(purged).toBe(1);
    expect(countByStatus(db).pending).toBe(1);
    expect(countByStatus(db).dead_letter).toBe(0);
  });

  it("default statuses cover every terminal bucket", async () => {
    insertRow(db, { status: "rejected", createdAt: OLD_UTC });
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC });
    insertRow(db, { status: "quarantined", createdAt: OLD_UTC });

    expect(SYNC_OP_OUTBOX_TERMINAL_STATUSES).not.toContain("pending");

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
    });

    expect(purged).toBe(3);
    expect(totalRows(db)).toBe(0);
  });

  it("ages ISO-8601-with-offset timestamps correctly (julianday robustness)", async () => {
    insertRow(db, { status: "dead_letter", createdAt: OLD_WITH_OFFSET });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
    });

    expect(purged).toBe(1);
    expect(totalRows(db)).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────
  // scoping + no-op
  // ───────────────────────────────────────────────────────────────

  it("restricts the purge to a single user when userId is given", async () => {
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC, userId: "u-a" });
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC, userId: "u-b" });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
      userId: "u-a",
    });

    expect(purged).toBe(1);
    expect(totalRows(db)).toBe(1);
  });

  it("honours an explicit single-status filter", async () => {
    insertRow(db, { status: "dead_letter", createdAt: OLD_UTC });
    insertRow(db, { status: "rejected", createdAt: OLD_UTC });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
      statuses: ["dead_letter"],
    });

    expect(purged).toBe(1);
    expect(countByStatus(db).rejected).toBe(1);
    expect(countByStatus(db).dead_letter).toBe(0);
  });

  it("is a no-op (purged=0) when nothing matches", async () => {
    insertRow(db, { status: "dead_letter", createdAt: recentIso() });

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: 30,
    });

    expect(purged).toBe(0);
    expect(totalRows(db)).toBe(1);
  });

  it("throws when COUNT(*) coerces to a non-integer", async () => {
    const brokenClient: SqliteMigrationClient = {
      ...client,
      all<R extends Record<string, unknown>>(): R[] {
        return [{ count: Number.NaN }] as unknown as R[];
      },
    };

    await expect(
      purgeStaleTerminalOutbox(brokenClient, { olderThanDays: 30 }),
    ).rejects.toThrow(/COUNT\(\*\) coerced to a non-integer/);
  });
});
