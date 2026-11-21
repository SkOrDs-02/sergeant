/**
 * Last validated: 2026-11-21
 * Status: Active
 *
 * Примусовий повний прохід за версією (`REPLICA_REPULL_VERSION` у
 * `replicaBootstrap.ts`, рішення власника 2026-11-21) на РЕАЛЬНОМУ SQLite з
 * клієнтськими міграціями Рутини.
 *
 * Два пошкодження, які прохід мусить вилікувати:
 *   - `data-12`: курсор перестрибнув оп, якого pull не віддав ніколи;
 *   - `data-02`: «Повернути» до фіксу generic upsert лишило tombstone при
 *     `updated_at` рівному часу відновлення, і строгий LWW повтор скіпає.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { SyncV2PullOp } from "@sergeant/api-client";
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
import {
  REPLICA_BOOTSTRAP_ORIGIN,
  REPLICA_REPULL_VERSION,
} from "./replicaBootstrap.js";
import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import {
  readCursorValue,
  writeCursorValue,
  writePullSinceCursor,
} from "./syncOpCursor.js";

const USER_ID = "user-repull";
const OWN_DEVICE = "device-phone";
const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-01T10:00:01.000Z";
const T3 = "2026-10-01T10:00:02.000Z";

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

/** Рядок у формі writer-а Рутини: БЕЗ ключа `deleted_at` (data-02). */
function habitOp(
  id: number,
  habitId: string,
  op: "insert" | "delete",
  clientTs: string,
  origin: string | null = "device-laptop",
): SyncV2PullOp {
  return {
    id,
    table: "routine_habits",
    op,
    row: { id: habitId, user_id: USER_ID, name: `Habit ${habitId}` },
    client_ts: clientTs,
    server_ts: clientTs,
    origin_device_id: origin,
  } as SyncV2PullOp;
}

/** Сервер із фільтром `origin_device_id IS DISTINCT FROM $3` (`syncV2Pull.ts`). */
function makeServer(log: SyncV2PullOp[]) {
  return vi.fn(
    async (since: number, options: { originDeviceId?: string | null }) => {
      const origin = options.originDeviceId ?? null;
      const ops = log.filter(
        (op) =>
          op.id > since &&
          (origin === null
            ? op.origin_device_id !== null
            : op.origin_device_id !== origin),
      );
      return { ops, next_cursor: null };
    },
  );
}

describe("примусовий повний прохід за версією (sync-lost-ops-repull)", () => {
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

  function makeRuntime(
    pull: ReturnType<typeof vi.fn>,
    snapshot?: ReturnType<typeof vi.fn>,
  ) {
    return createSyncEngineReaderRuntime({
      pull: pull as never,
      ...(snapshot ? { snapshot: snapshot as never } : {}),
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

  /** Копія, що пройшла відновлення до версії проходу (стан до 2026-11-21). */
  async function seedLegacyDoneReplica(cursor: number): Promise<void> {
    await writeCursorValue(client, `replica_bootstrap:${USER_ID}`, 2);
    await writePullSinceCursor(client, USER_ID, cursor);
  }

  async function habit(
    id: string,
  ): Promise<{ deleted_at: string | null } | undefined> {
    const rows = await client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM routine_habits WHERE id = ?`,
      [id],
    );
    return rows[0];
  }

  it("data-12: перестрибнутий оп повертається один раз, далі звичайний pull", async () => {
    // h-seen застосовано, а h-lost (id 2) курсор 3 колись перестрибнув.
    const log = [
      habitOp(1, "h-seen", "insert", T1),
      habitOp(2, "h-lost", "insert", T1),
      habitOp(3, "h-next", "insert", T1),
    ];
    for (const op of [log[0]!, log[2]!])
      await applyPullOp(client, op, USER_ID, OWN_DEVICE);
    await seedLegacyDoneReplica(3);
    const pull = makeServer(log);

    await makeRuntime(pull).pullOnce();
    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
    expect(await habit("h-lost")).toEqual({ deleted_at: null });
    expect(await readCursorValue(client, `sync_repull:${USER_ID}`)).toBe(
      REPLICA_REPULL_VERSION,
    );

    // Позначка є: ні наступний тік, ні новий старт застосунку від нуля не тягнуть.
    pull.mockClear();
    await makeRuntime(pull).pullOnce();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(3, {
      limit: 100,
      originDeviceId: OWN_DEVICE,
    });
  });

  it("data-02: tombstone після «Повернути» з тим самим updated_at знімається", async () => {
    const log = [
      habitOp(1, "h-undo", "insert", T1),
      habitOp(2, "h-undo", "delete", T2),
      habitOp(3, "h-undo", "insert", T3),
    ];
    // Стан жертви: insert T3 застосовано, а tombstone T2 лишився.
    await applyPullOp(client, log[0]!, USER_ID, OWN_DEVICE);
    await applyPullOp(client, log[1]!, USER_ID, OWN_DEVICE);
    db.prepare(`UPDATE routine_habits SET updated_at = ? WHERE id = ?`).run(
      T3,
      "h-undo",
    );
    // Звичайний pull зі строгим LWW такий рядок не лікує.
    expect(await applyPullOp(client, log[2]!, USER_ID, OWN_DEVICE)).toBe(
      "skipped",
    );
    expect(await habit("h-undo")).toEqual({ deleted_at: T2 });

    await seedLegacyDoneReplica(3);
    await makeRuntime(makeServer(log)).pullOnce();

    expect(await habit("h-undo")).toEqual({ deleted_at: null });
  });

  it("штатне видалення повтор не воскрешає", async () => {
    const log = [
      habitOp(1, "h-gone", "insert", T1),
      habitOp(2, "h-gone", "delete", T2),
    ];
    for (const op of log) await applyPullOp(client, op, USER_ID, OWN_DEVICE);
    await seedLegacyDoneReplica(2);

    await makeRuntime(makeServer(log)).pullOnce();

    expect(await habit("h-gone")).toEqual({ deleted_at: T2 });
  });

  it("неспушена черга: прохід чекає, рядок черги лишається цілим", async () => {
    const log = [habitOp(1, "h-1", "insert", T1)];
    await seedLegacyDoneReplica(1);
    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key, status, user_id)
       VALUES ('routine_habits', 'insert', '{"id":"h-local"}', ?, 'k-1', 'pending', ?)`,
    ).run(T3, USER_ID);
    const pull = makeServer(log);

    await makeRuntime(pull).pullOnce();
    expect(pull).toHaveBeenLastCalledWith(1, {
      limit: 100,
      originDeviceId: OWN_DEVICE,
    });
    expect(
      db
        .prepare(
          `SELECT idempotency_key, status, row FROM sync_op_outbox WHERE user_id = ?`,
        )
        .all(USER_ID),
    ).toEqual([
      { idempotency_key: "k-1", status: "pending", row: '{"id":"h-local"}' },
    ]);

    // Writer доставив чергу: наступний тік робить прохід від нуля.
    db.exec(`DELETE FROM sync_op_outbox`);
    await makeRuntime(pull).pullOnce();
    expect(pull).toHaveBeenLastCalledWith(0, {
      limit: 100,
      originDeviceId: REPLICA_BOOTSTRAP_ORIGIN,
    });
  });

  it("обрізаний журнал: прохід іде через знімок і теж знімає tombstone", async () => {
    // Стан жертви data-02: живий на сервері рядок, локально tombstone T2 при updated_at T3.
    db.prepare(
      `INSERT INTO routine_habits (id, user_id, name, updated_at, deleted_at)
       VALUES ('h-undo', ?, 'Habit h-undo', ?, ?)`,
    ).run(USER_ID, T3, T2);
    await seedLegacyDoneReplica(50);
    const pull = vi.fn(async (since: number) => {
      if (since < 100)
        throw new ApiError({
          kind: "http",
          status: 410,
          message: "cursor expired",
          url: "/api/v2/sync/pull",
          body: { code: SYNC_CURSOR_EXPIRED_CODE },
        });
      return { ops: [], next_cursor: null };
    });
    const snapshot = vi.fn().mockResolvedValueOnce({
      ops: [habitOp(100, "h-undo", "insert", T3, null)],
      as_of_op_id: 100,
      next_cursor: null,
    });

    await makeRuntime(pull, snapshot).pullOnce();

    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(await habit("h-undo")).toEqual({ deleted_at: null });
    expect(await readCursorValue(client, `sync_repull:${USER_ID}`)).toBe(
      REPLICA_REPULL_VERSION,
    );
  });
});
