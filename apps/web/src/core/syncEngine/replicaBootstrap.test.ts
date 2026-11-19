/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Разове відновлення локальної копії (`replicaBootstrap.ts`) на РЕАЛЬНОМУ
 * SQLite з клієнтськими міграціями Рутини. Сервер змодельовано рівно тим
 * фільтром, що й `syncV2Pull.ts`: `origin_device_id IS DISTINCT FROM $3`.
 *
 * Сценарій власника 2026-11-19: копія акаунта на пристрої скинулась, а id
 * пристрою лишився тим самим. Pull з нуля приносив лише чуже, і все, що
 * пристрій записав сам, «зникало».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { SyncV2PullOp } from "@sergeant/api-client";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: vi.fn().mockResolvedValue(undefined),
}));

import { __resetApplyPullOpCachesForTests } from "./applyPullOp.js";
import { __resetInitialPullStateForTests } from "./initialPullState.js";
import { REPLICA_BOOTSTRAP_ORIGIN } from "./replicaBootstrap.js";
import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";

const USER_ID = "user-replica";
const OWN_DEVICE = "device-phone";

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
  origin: string | null,
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

function streakIncrementOp(
  id: number,
  delta: number,
  origin: string,
): SyncV2PullOp {
  return {
    id,
    table: "routine_streaks",
    op: "increment",
    row: { user_id: USER_ID, delta },
    client_ts: "2026-10-01T08:00:00.000Z",
    server_ts: "2026-10-01T08:00:01.000Z",
    origin_device_id: origin,
  } as SyncV2PullOp;
}

/**
 * Сервер із тим самим фільтром, що в `syncV2Pull.ts`. `pageSize` ріже
 * журнал на сторінки, `failOnCall` імітує обрив мережі на N-му запиті.
 */
function makeServer(
  log: SyncV2PullOp[],
  opts: { pageSize?: number; failOnCall?: number } = {},
) {
  let calls = 0;
  return vi.fn(
    async (since: number, options: { originDeviceId?: string | null }) => {
      calls += 1;
      if (opts.failOnCall === calls) throw new TypeError("Failed to fetch");
      const origin = options.originDeviceId ?? null;
      const visible = log.filter(
        (op) =>
          op.id > since &&
          // `IS DISTINCT FROM`: NULL проти NULL — не «різні».
          (origin === null
            ? op.origin_device_id !== null
            : op.origin_device_id !== origin),
      );
      const size = opts.pageSize ?? visible.length;
      const ops = visible.slice(0, size);
      const last = ops.at(-1);
      const more = visible.length > size && last !== undefined;
      return { ops, next_cursor: more ? last.id : null };
    },
  );
}

describe("replicaBootstrap — свіжа копія отримує і власні записи", () => {
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

  function makeRuntime(pull: ReturnType<typeof makeServer>) {
    return createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => USER_ID,
      originDeviceId: OWN_DEVICE,
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

  async function habitIds(): Promise<string[]> {
    const rows = await client.all<{ id: string }>(
      `SELECT id FROM routine_habits ORDER BY id`,
    );
    return rows.map((r) => r.id);
  }

  const LOG = [
    habitOp(1, "h-legacy", null),
    habitOp(2, "h-own-1", OWN_DEVICE),
    habitOp(3, "h-other", "device-laptop"),
    habitOp(4, "h-own-2", OWN_DEVICE),
  ];

  it("скинута копія з тим самим id повертає ВСЕ: власне, чуже й NULL-origin", async () => {
    const pull = makeServer(LOG);
    await makeRuntime(pull).pullOnce();

    expect(await habitIds()).toEqual([
      "h-legacy",
      "h-other",
      "h-own-1",
      "h-own-2",
    ]);
    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
  });

  it("після відновлення pull знову відсіює власне ехо", async () => {
    const pull = makeServer(LOG);
    const runtime = makeRuntime(pull);
    await runtime.pullOnce();
    pull.mockClear();

    await runtime.pullOnce();
    expect(pull).toHaveBeenCalledWith(4, {
      limit: 100,
      originDeviceId: OWN_DEVICE,
    });
  });

  it("перерване відновлення продовжується з курсора в тому ж режимі", async () => {
    // Друга сторінка обривається: курсор уже на 2, позначка «триває».
    const pull = makeServer(LOG, { pageSize: 2, failOnCall: 2 });
    const runtime = makeRuntime(pull);
    await expect(runtime.pullOnce()).rejects.toThrow("Failed to fetch");
    expect(await readPullSinceCursor(client, USER_ID)).toBe(2);

    await runtime.pullOnce();
    expect(pull).toHaveBeenLastCalledWith(2, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
    expect(await habitIds()).toEqual([
      "h-legacy",
      "h-other",
      "h-own-1",
      "h-own-2",
    ]);
  });

  it("копія, яка вже колись втратила свої записи, повертає їх один раз від нуля", async () => {
    // Стара копія: курсор далеко, але власних рядків немає (відсіяні раніше).
    await writePullSinceCursor(client, USER_ID, 4);
    const pull = makeServer(LOG);
    await makeRuntime(pull).pullOnce();

    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
    expect(await habitIds()).toContain("h-own-1");
    expect(await readPullSinceCursor(client, USER_ID)).toBe(4);
  });

  it("не стартує, поки в черзі є неспушене, і стартує, щойно черга порожня", async () => {
    // Неспушений запис цього користувача в черзі синку.
    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key, status, user_id)
       VALUES ('routine_habits', 'delete', '{}', ?, 'k-1', 'pending', ?)`,
    ).run("2026-11-19T10:00:00.000Z", USER_ID);
    const pull = makeServer(LOG);
    const runtime = makeRuntime(pull);

    await runtime.pullOnce();
    expect(pull).toHaveBeenLastCalledWith(0, {
      limit: 100,
      originDeviceId: OWN_DEVICE,
    });
    expect(await habitIds()).not.toContain("h-own-1");

    db.exec(`DELETE FROM sync_op_outbox`);
    await runtime.pullOnce();
    expect(pull).toHaveBeenLastCalledWith(0, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
    expect(await habitIds()).toContain("h-own-1");
  });

  it("власний increment не повторюється (лічильник не подвоюється), чужий застосовується", async () => {
    const pull = makeServer([
      streakIncrementOp(1, 1, OWN_DEVICE),
      streakIncrementOp(2, 1, "device-laptop"),
    ]);
    await makeRuntime(pull).pullOnce();

    const rows = await client.all<{ current_streak: number }>(
      `SELECT current_streak FROM routine_streaks WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows[0]?.current_streak).toBe(1);
  });
});
