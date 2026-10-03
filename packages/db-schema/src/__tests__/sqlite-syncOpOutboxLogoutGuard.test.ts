import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import { enqueueOutboxIncrement } from "../sqlite/syncOpOutboxEnqueue.js";
import {
  markOutboxRejected,
  markOutboxRetry,
} from "../sqlite/syncOpOutboxLifecycle.js";
import { countOutboxByStatus } from "../sqlite/syncOpOutboxStatus.js";
import {
  countUnsyncedOutboxForUser,
  resetOutboxBackoffForUser,
} from "../sqlite/syncOpOutboxLogoutGuard.js";

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
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

describe("syncOpOutboxLogoutGuard", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  async function enqueue(key: string, userId = "u-me"): Promise<number> {
    const r = await enqueueOutboxIncrement(client, {
      userId,
      table: "routine_streaks",
      row: { delta: 1 },
      clientTs: "2026-05-05T10:00:00.000+00:00",
      idempotencyKey: key,
    });
    return r.id;
  }

  describe("countUnsyncedOutboxForUser", () => {
    it("is 0 for an empty queue", async () => {
      await expect(
        countUnsyncedOutboxForUser(client, { userId: "u-me" }),
      ).resolves.toBe(0);
    });

    it("counts pending (incl. backed-off), dead_letter and non-benign rejected", async () => {
      await enqueue("k-pending");
      const backedOff = await enqueue("k-backoff");
      await markOutboxRetry(client, backedOff, {
        attempts: 2,
        status: "pending",
        nextRetryAt: "2999-01-01T00:00:00.000Z",
        lastError: "http_503",
      });
      const dead = await enqueue("k-dead");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'dead_letter' WHERE id = ?`,
      ).run(dead);
      const rejected = await enqueue("k-rejected");
      await markOutboxRejected(client, rejected, "user_id_mismatch");

      await expect(
        countUnsyncedOutboxForUser(client, {
          userId: "u-me",
          excludeRejectReasons: ["lww_conflict"],
        }),
      ).resolves.toBe(4);
    });

    it("does not count benign rejected (lww_conflict) or quarantined rows", async () => {
      const lww = await enqueue("k-lww");
      await markOutboxRejected(client, lww, "lww_conflict");
      const quarantined = await enqueue("k-quarantine");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'quarantined' WHERE id = ?`,
      ).run(quarantined);

      await expect(
        countUnsyncedOutboxForUser(client, {
          userId: "u-me",
          excludeRejectReasons: ["lww_conflict"],
        }),
      ).resolves.toBe(0);
    });

    it("counts a rejected row with NULL reason even when exclusions are set", async () => {
      const id = await enqueue("k-null");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'rejected', reject_reason = NULL WHERE id = ?`,
      ).run(id);
      await expect(
        countUnsyncedOutboxForUser(client, {
          userId: "u-me",
          excludeRejectReasons: ["lww_conflict"],
        }),
      ).resolves.toBe(1);
    });

    it("is scoped to the given user (shared kvvfs store holds other accounts)", async () => {
      await enqueue("k-mine");
      await enqueue("k-theirs", "u-other");

      await expect(
        countUnsyncedOutboxForUser(client, { userId: "u-me" }),
      ).resolves.toBe(1);
      await expect(
        countUnsyncedOutboxForUser(client, { userId: "u-other" }),
      ).resolves.toBe(1);
    });

    it("rejects an empty userId instead of counting everyone's rows", async () => {
      await expect(
        countUnsyncedOutboxForUser(client, { userId: "" }),
      ).rejects.toThrow(/userId/);
    });

    it("differs from countOutboxByStatus, which counts every user and every rejected reason", async () => {
      await enqueue("k-mine");
      await enqueue("k-theirs", "u-other");
      const lww = await enqueue("k-lww");
      await markOutboxRejected(client, lww, "lww_conflict");

      const byStatus = await countOutboxByStatus(client);
      // Наївний підсумок зі статусів: чужий рядок і штатний lww_conflict
      // потрапляють у «незасинхронізоване».
      expect(byStatus.pending + byStatus.dead_letter + byStatus.rejected).toBe(
        3,
      );
      await expect(
        countUnsyncedOutboxForUser(client, {
          userId: "u-me",
          excludeRejectReasons: ["lww_conflict"],
        }),
      ).resolves.toBe(1);
    });
  });

  describe("resetOutboxBackoffForUser", () => {
    it("clears next_retry_at of the user's pending rows only", async () => {
      const mine = await enqueue("k-mine");
      const theirs = await enqueue("k-theirs", "u-other");
      for (const id of [mine, theirs]) {
        await markOutboxRetry(client, id, {
          attempts: 3,
          status: "pending",
          nextRetryAt: "2999-01-01T00:00:00.000Z",
          lastError: "http_503",
        });
      }

      await resetOutboxBackoffForUser(client, "u-me");

      const row = (id: number) =>
        db
          .prepare(
            `SELECT next_retry_at AS n, attempts AS a, status AS s FROM sync_op_outbox WHERE id = ?`,
          )
          .get(id) as { n: string | null; a: number; s: string };
      expect(row(mine)).toEqual({ n: null, a: 3, s: "pending" });
      expect(row(theirs).n).toBe("2999-01-01T00:00:00.000Z");
    });

    it("rejects an empty userId", async () => {
      await expect(resetOutboxBackoffForUser(client, "")).rejects.toThrow(
        /userId/,
      );
    });

    it("does not touch terminal rows", async () => {
      const dead = await enqueue("k-dead");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'dead_letter', next_retry_at = 'x' WHERE id = ?`,
      ).run(dead);

      await resetOutboxBackoffForUser(client, "u-me");

      const r = db
        .prepare(`SELECT next_retry_at AS n FROM sync_op_outbox WHERE id = ?`)
        .get(dead) as { n: string | null };
      expect(r.n).toBe("x");
    });
  });
});
