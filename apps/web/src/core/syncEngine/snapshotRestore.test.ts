/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Відновлення копії зі знімка сервера (`snapshotRestore.ts`, спека
 * `docs/work/specs/sync-snapshot-client-bootstrap.md`) на РЕАЛЬНОМУ SQLite з
 * клієнтськими міграціями Рутини, плюс шлях через читач синку на
 * `410 sync_cursor_expired`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  SyncV2PullOp,
  SyncV2SnapshotOptions,
  SyncV2SnapshotResponse,
} from "@sergeant/api-client";
import { ApiError, SYNC_CURSOR_EXPIRED_CODE } from "@sergeant/api-client";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: vi.fn().mockResolvedValue(undefined),
}));

import {
  __resetApplyPullOpCachesForTests,
  applyPullOp,
} from "./applyPullOp.js";
import { __resetInitialPullStateForTests } from "./initialPullState.js";
import { markReplicaBootstrapDone } from "./replicaBootstrap.js";
import { restoreFromSnapshot } from "./snapshotRestore.js";
import { isSnapshotRestoring } from "./snapshotRestoreState.js";
import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import {
  readCursorValue,
  readPullSinceCursor,
  writePullSinceCursor,
} from "./syncOpCursor.js";

const USER_ID = "user-snapshot";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

function habitOp(
  id: number,
  habitId: string,
  origin: string | null = "device-laptop",
): SyncV2PullOp {
  return {
    id,
    table: "routine_habits",
    op: "insert",
    row: { id: habitId, user_id: USER_ID, name: `Habit ${habitId}` },
    client_ts: "2026-10-01T08:00:00.000Z",
    server_ts: "2026-10-01T08:00:01.000Z",
    origin_device_id: origin,
  } as SyncV2PullOp;
}

/** Сторінка знімка: оп-и `insert` з `origin = null`, `id = as_of_op_id`. */
function snapshotPage(
  habitIds: string[],
  asOf: number,
  nextCursor: string | null,
): SyncV2SnapshotResponse {
  return {
    ops: habitIds.map((h) => ({ ...habitOp(asOf, h, null) })),
    as_of_op_id: asOf,
    next_cursor: nextCursor,
  };
}

function cursorExpired(): ApiError {
  return new ApiError({
    kind: "http",
    status: 410,
    message: "cursor expired",
    url: "/api/v2/sync/pull",
    body: {
      error: "Gone",
      message: "cursor expired",
      code: SYNC_CURSOR_EXPIRED_CODE,
      details: [{ floor_id: 100 }],
    },
  });
}

const isConstraintFailure = () => false;

describe("snapshotRestore — копія приводиться до стану сервера", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    __resetInitialPullStateForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__routine_migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  async function habitIds(): Promise<string[]> {
    const rows = await client.all<{ id: string }>(
      `SELECT id FROM routine_habits ORDER BY id`,
    );
    return rows.map((r) => r.id);
  }

  async function seedLocal(...ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) {
      await applyPullOp(client, habitOp(i + 1, id), USER_ID, "device-phone");
    }
  }

  function queue(habitId: string, status: string): void {
    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key, status, user_id)
       VALUES ('routine_habits', 'update', ?, ?, ?, ?, ?)`,
    ).run(
      JSON.stringify({ id: habitId, user_id: USER_ID, name: "local" }),
      "2026-11-19T10:00:00.000Z",
      `k-${habitId}`,
      status,
      USER_ID,
    );
  }

  it("дві сторінки: рядки сервера є, зайвий локальний прибрано, захищений чергою лишився", async () => {
    await seedLocal("h-stale", "h-queued");
    queue("h-queued", "rejected");
    const fetchSnapshot = vi
      .fn<(opts: SyncV2SnapshotOptions) => Promise<SyncV2SnapshotResponse>>()
      .mockResolvedValueOnce(snapshotPage(["h1"], 40, "c1"))
      .mockResolvedValueOnce(snapshotPage(["h2"], 40, null));

    const result = await restoreFromSnapshot({
      client,
      userId: USER_ID,
      fetchSnapshot,
      isConstraintFailure,
    });

    expect(result).toMatchObject({ status: "restored", asOfOpId: 40 });
    expect(await habitIds()).toEqual(["h-queued", "h1", "h2"]);
    expect(fetchSnapshot).toHaveBeenNthCalledWith(1, { limit: 500 });
    expect(fetchSnapshot).toHaveBeenNthCalledWith(2, {
      cursor: "c1",
      asOfOpId: 40,
      limit: 500,
    });
    expect(await readPullSinceCursor(client, USER_ID)).toBe(40);
    expect(await readCursorValue(client, `replica_bootstrap:${USER_ID}`)).toBe(
      2,
    );
    expect(isSnapshotRestoring()).toBe(false);
  });

  it("з неспушеним у черзі відкладається і нічого не змінює", async () => {
    await seedLocal("h-stale");
    queue("h-new", "pending");
    const fetchSnapshot = vi.fn();

    const result = await restoreFromSnapshot({
      client,
      userId: USER_ID,
      fetchSnapshot,
      isConstraintFailure,
    });

    expect(result).toEqual({ status: "postponed" });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(await habitIds()).toEqual(["h-stale"]);
  });

  it("обрив посеред: зведення не відбувається, курсор не рухається", async () => {
    await seedLocal("h-stale");
    await writePullSinceCursor(client, USER_ID, 7);
    const fetchSnapshot = vi
      .fn<(opts: SyncV2SnapshotOptions) => Promise<SyncV2SnapshotResponse>>()
      .mockResolvedValueOnce(snapshotPage(["h1"], 40, "c1"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      restoreFromSnapshot({
        client,
        userId: USER_ID,
        fetchSnapshot,
        isConstraintFailure,
      }),
    ).rejects.toThrow("Failed to fetch");

    expect(await habitIds()).toEqual(["h-stale", "h1"]);
    expect(await readPullSinceCursor(client, USER_ID)).toBe(7);
    expect(isSnapshotRestoring()).toBe(false);
  });

  describe("через читач синку", () => {
    function makeRuntime(
      pull: ReturnType<typeof vi.fn>,
      snapshot: ReturnType<typeof vi.fn>,
    ) {
      return createSyncEngineReaderRuntime({
        pull: pull as never,
        snapshot: snapshot as never,
        resolveClient: async () => client,
        resolveUserId: async () => USER_ID,
        originDeviceId: "device-phone",
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        eventTarget: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        intervalMs: 60_000,
        limit: 100,
      });
    }

    it("410 на pull → знімок → pull продовжується з as_of_op_id", async () => {
      await markReplicaBootstrapDone(client, USER_ID);
      await writePullSinceCursor(client, USER_ID, 5);
      const pull = vi.fn(async (since: number) => {
        if (since < 100) throw cursorExpired();
        return { ops: [habitOp(101, "h-after")], next_cursor: null };
      });
      const snapshot = vi
        .fn()
        .mockResolvedValueOnce(snapshotPage(["h1"], 100, null));

      await makeRuntime(pull, snapshot).pullOnce();

      expect(snapshot).toHaveBeenCalledTimes(1);
      expect(pull).toHaveBeenLastCalledWith(100, {
        limit: 100,
        originDeviceId: "device-phone",
      });
      expect(await habitIds()).toEqual(["h-after", "h1"]);
      expect(await readPullSinceCursor(client, USER_ID)).toBe(101);
    });

    it("разове відновлення копії від нуля на обрізаному журналі теж іде в знімок", async () => {
      const pull = vi.fn(async (since: number) => {
        if (since < 100) throw cursorExpired();
        return { ops: [], next_cursor: null };
      });
      const snapshot = vi
        .fn()
        .mockResolvedValueOnce(snapshotPage(["h-own"], 100, null));

      await makeRuntime(pull, snapshot).pullOnce();

      expect(await habitIds()).toEqual(["h-own"]);
      expect(
        await readCursorValue(client, `replica_bootstrap:${USER_ID}`),
      ).toBe(2);
    });

    it("без 410 знімок не викликається", async () => {
      await markReplicaBootstrapDone(client, USER_ID);
      const pull = vi.fn(async () => ({
        ops: [habitOp(1, "h1")],
        next_cursor: null,
      }));
      const snapshot = vi.fn();

      await makeRuntime(pull, snapshot).pullOnce();

      expect(snapshot).not.toHaveBeenCalled();
      expect(await habitIds()).toEqual(["h1"]);
    });
  });
});
