/**
 * rel-11: pulled-оп, що кидає виняток при apply, не має заклинювати курсор.
 *
 * Окремий файл від `syncEngineReader.test.ts` навмисно: там `applyPullOp`
 * замоканий, а тут потрібен РЕАЛЬНИЙ SQLite із клієнтськими міграціями —
 * отруйний оп має порушити справжній CHECK, а не вдавати його моком.
 * `refreshCachesAfterPull` мокаємо: він тягне модульні читачі й UI-кеші,
 * а перевіряємо ми лише apply/курсор.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { SyncV2PullOp } from "@sergeant/api-client";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  NUTRITION_CLIENT_MIGRATIONS,
  ROUTINE_CLIENT_MIGRATIONS,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: vi.fn().mockResolvedValue(undefined),
}));

import { __resetApplyPullOpCachesForTests } from "./applyPullOp.js";
import { __resetInitialPullStateForTests } from "./initialPullState.js";
import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import { readPullSinceCursor } from "./syncOpCursor.js";

const USER_ID = "user-poison";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

function habitOp(id: number, habitId: string): SyncV2PullOp {
  return {
    id,
    table: "routine_habits",
    op: "insert",
    row: { id: habitId, user_id: USER_ID, name: `Habit ${habitId}` },
    client_ts: "2026-10-01T08:00:00.000Z",
    server_ts: "2026-10-01T08:00:01.000Z",
    origin_device_id: "device-b",
  } as SyncV2PullOp;
}

/** `consume` без `delta_qty` порушує CHECK `nutrition_pantry_events_qty_shape`. */
function poisonOp(id: number): SyncV2PullOp {
  return {
    id,
    table: "nutrition_pantry_events",
    op: "insert",
    row: {
      id: "evt-poison",
      user_id: USER_ID,
      pantry_id: "pantry-1",
      item_key: "milk",
      kind: "consume",
    },
    client_ts: "2026-10-01T08:00:00.000Z",
    server_ts: "2026-10-01T08:00:01.000Z",
    origin_device_id: "device-b",
  } as SyncV2PullOp;
}

function streakIncrementOp(id: number, delta: number): SyncV2PullOp {
  return {
    id,
    table: "routine_streaks",
    op: "increment",
    row: { user_id: USER_ID, delta },
    client_ts: "2026-10-01T08:00:00.000Z",
    server_ts: "2026-10-01T08:00:01.000Z",
    origin_device_id: "device-b",
  } as SyncV2PullOp;
}

describe("syncEngineReader — отруйний оп (rel-11)", () => {
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
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: NUTRITION_CLIENT_MIGRATIONS,
      tableName: "__nutrition_migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  function makeRuntime(
    ops: SyncV2PullOp[],
    captureException: (error: unknown, ctx?: Record<string, unknown>) => void,
  ) {
    const pull = vi.fn(async (since: number) => ({
      ops: ops.filter((op) => op.id > since),
      next_cursor: null,
    }));
    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => USER_ID,
      originDeviceId: "device-a",
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
      eventTarget: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
      captureException,
    });
    return { runtime, pull };
  }

  async function habitIds(): Promise<string[]> {
    const rows = await client.all<{ id: string }>(
      `SELECT id FROM routine_habits ORDER BY id`,
    );
    return rows.map((r) => r.id);
  }

  it("сторінка [h1, отруйний, h2]: тік не кидає, h2 застосовано, курсор = id третього опа", async () => {
    const captureException = vi.fn();
    const { runtime } = makeRuntime(
      [habitOp(1, "h1"), poisonOp(2), habitOp(3, "h2")],
      captureException,
    );

    const result = await runtime.pullOnce();

    expect(await habitIds()).toEqual(["h1", "h2"]);
    expect(await readPullSinceCursor(client, USER_ID)).toBe(3);
    expect(result).toMatchObject({
      pulled: 3,
      applied: 2,
      rejected: 1,
      lastOpId: 3,
    });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("звіт у Sentry: table/op/текст помилки, без row (Hard Rule #21)", async () => {
    const captureException = vi.fn();
    const { runtime } = makeRuntime([poisonOp(2)], captureException);

    await runtime.pullOnce();

    const [error, context] = captureException.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(error.message).toContain("nutrition_pantry_events.insert");
    expect(error.message).toContain("nutrition_pantry_events_qty_shape");
    expect(context).toMatchObject({
      scope: "sync-v2-pull-apply",
      tags: {
        sync_direction: "pull",
        sync_table: "nutrition_pantry_events",
        sync_op: "insert",
      },
      opId: 2,
    });
    const serialized = JSON.stringify(context) + error.message;
    expect(serialized).not.toContain("milk");
    expect(serialized).not.toContain("pantry-1");
  });

  it("наступний тік не бере ту саму сторінку і не повторює звіт", async () => {
    const captureException = vi.fn();
    const { runtime, pull } = makeRuntime(
      [habitOp(1, "h1"), poisonOp(2), habitOp(3, "h2")],
      captureException,
    );

    await runtime.pullOnce();
    await runtime.pullOnce();

    expect(pull).toHaveBeenLastCalledWith(3, expect.anything());
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("increment: курсор пишеться одразу після apply, ДО наступних опів сторінки", async () => {
    // Закриття вкладки посеред сторінки після неідемпотентного increment
    // повторило б його при наступному тіку. Звужуємо вікно: курсор на
    // increment-і має лягти раніше, ніж почнеться apply наступного опа.
    const captureException = vi.fn();
    const { runtime } = makeRuntime(
      [streakIncrementOp(1, 1), habitOp(2, "h1")],
      captureException,
    );

    const trace: string[] = [];
    const realRun = client.run.bind(client);
    client.run = (sql, params) => {
      if (sql.includes("INSERT INTO routine_streaks")) trace.push("increment");
      else if (sql.includes("INSERT INTO sync_op_cursor"))
        trace.push(`cursor:${String((params as unknown[])[1])}`);
      else if (sql.includes("INSERT INTO routine_habits")) trace.push("habit");
      return realRun(sql, params);
    };

    await runtime.pullOnce();

    expect(trace).toEqual(["increment", "cursor:1", "habit", "cursor:2"]);
    expect(captureException).not.toHaveBeenCalled();
  });
});
