import { expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import { createSyncEngineReaderRuntime } from "./syncEngineReader";
import { __resetApplyPullOpCachesForTests } from "./applyPullOp";
import { readPullSinceCursor } from "./syncOpCursor";
import type { SyncV2PullOp } from "@sergeant/api-client";

vi.mock("./refreshCachesAfterPull", () => ({
  refreshCachesAfterPull: vi.fn(async () => {}),
}));

it("retries a valid row after real SQLITE_BUSY without advancing past it", async () => {
  __resetApplyPullOpCachesForTests();
  const dir = mkdtempSync(join(tmpdir(), "sergeant-pull-busy-"));
  const file = join(dir, "test.db");
  const db = new Database(file);
  db.pragma("busy_timeout = 10");
  let blocker: Database.Database | undefined;
  let busy = false;
  const releaseTransientLock = (error: unknown): never => {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "SQLITE_BUSY"
    ) {
      busy = true;
      blocker?.exec("ROLLBACK");
    }
    throw error;
  };
  const client: SqliteMigrationClient = {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params = []) {
      try {
        db.prepare(sql).run(...params);
      } catch (error) {
        releaseTransientLock(error);
      }
    },
    all<T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) {
      try {
        return db.prepare(sql).all(...params) as T[];
      } catch (error) {
        return releaseTransientLock(error);
      }
    },
  };
  try {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__routine_migrations",
    });
    blocker = new Database(file);
    blocker.exec("BEGIN IMMEDIATE");
    const op: SyncV2PullOp = {
      id: 9,
      table: "routine_habits",
      op: "insert",
      row: { id: "h1", user_id: "busy-owner", name: "Valid remote row" },
      client_ts: "2026-10-17T10:00:00.000Z",
      server_ts: "2026-10-17T10:00:00.000Z",
      origin_device_id: "peer",
    };
    const runtime = createSyncEngineReaderRuntime({
      pull: async (since) => ({
        ops: since < 9 ? [op] : [],
        next_cursor: null,
      }),
      resolveClient: async () => client,
      resolveUserId: async () => "busy-owner",
      originDeviceId: "this-device",
      intervalMs: 30_000,
      limit: 200,
      setInterval: () => 0,
      clearInterval: () => {},
      eventTarget: {
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      captureException: vi.fn(),
    });
    await expect(runtime.pullOnce()).rejects.toThrow("database is locked");
    expect(busy).toBe(true);
    expect(await readPullSinceCursor(client, "busy-owner")).toBe(0);
    await expect(runtime.pullOnce()).resolves.toMatchObject({
      applied: 1,
      rejected: 0,
    });
    expect(await readPullSinceCursor(client, "busy-owner")).toBe(9);
    expect(
      db.prepare("SELECT count(*) AS n FROM routine_habits").get(),
    ).toEqual({ n: 1 });
  } finally {
    if (blocker?.inTransaction) blocker.exec("ROLLBACK");
    blocker?.close();
    db.close();
    rmSync(dir, { recursive: true });
  }
});
