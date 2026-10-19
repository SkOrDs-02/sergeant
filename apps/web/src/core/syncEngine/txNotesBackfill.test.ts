/**
 * Одноразовий догін `finyk_tx_notes` для пристрою зі старого бандла
 * (data-27, ревʼю PR #1530): курсор уже за опами нотаток, які старий
 * `applyPullOp` відхилив.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import type { SyncV2PullOp } from "@sergeant/api-client";

import { __resetApplyPullOpCachesForTests } from "./applyPullOp";
import { BACKFILL_PAGES_PER_TICK } from "./txNotesBackfill";
import { createSyncEngineReaderRuntime } from "./syncEngineReader";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor";

vi.mock("./refreshCachesAfterPull", () => ({
  refreshCachesAfterPull: vi.fn(async () => {}),
}));

const USER = "u-backfill";

let db: Database.Database;
let client: SqliteMigrationClient;

const noteOp = (
  id: number,
  op: "insert" | "delete",
  tx: string,
  note: string,
  ts: string,
): SyncV2PullOp =>
  ({
    id,
    table: "finyk_tx_notes",
    op,
    row:
      op === "delete"
        ? { user_id: USER, transaction_id: tx }
        : { user_id: USER, transaction_id: tx, note },
    client_ts: ts,
    server_ts: ts,
    origin_device_id: "peer",
  }) as SyncV2PullOp;

function makeRuntime(log: SyncV2PullOp[], pageSize = Infinity) {
  const pull = vi.fn(async (since: number) => {
    const rest = log.filter((op) => op.id > since);
    const ops = rest.slice(0, pageSize);
    const last = ops.at(-1);
    return {
      ops,
      next_cursor: rest.length > ops.length && last ? last.id : null,
    };
  });
  const runtime = createSyncEngineReaderRuntime({
    pull,
    resolveClient: async () => client,
    resolveUserId: async () => USER,
    originDeviceId: "this-device",
    intervalMs: 30_000,
    limit: 200,
    setInterval: () => 0,
    clearInterval: () => {},
    eventTarget: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  return { pull, runtime };
}

const notes = () =>
  client.all<{
    transaction_id: string;
    note: string;
    deleted_at: string | null;
  }>(
    `SELECT transaction_id, note, deleted_at FROM finyk_tx_notes ORDER BY transaction_id`,
  );

beforeEach(async () => {
  __resetApplyPullOpCachesForTests();
  db = new Database(":memory:");
  client = {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) => db.prepare(sql).all(...params) as T[],
  };
  for (const [files, tableName] of [
    [ROUTINE_CLIENT_MIGRATIONS, ROUTINE_MIGRATIONS_TABLE],
    [FINYK_CLIENT_MIGRATIONS, FINYK_MIGRATIONS_TABLE],
  ] as const) {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files,
      tableName,
    });
  }
});

afterEach(() => db.close());

describe("backfill finyk_tx_notes", () => {
  it("тягне нотатки, пропущені старим бандлом, без перемотки глобального курсора", async () => {
    // Курсор уже за опами нотаток (старий бандл їх відхилив і поїхав далі).
    await writePullSinceCursor(client, USER, 50);
    const log = [
      noteOp(
        10,
        "insert",
        "tx-1",
        "з іншого пристрою",
        "2026-10-10T10:00:00.000Z",
      ),
      noteOp(11, "insert", "tx-2", "стара", "2026-10-10T10:00:00.000Z"),
      noteOp(12, "delete", "tx-2", "", "2026-10-11T10:00:00.000Z"),
    ];
    const { pull, runtime } = makeRuntime(log);

    await runtime.pullOnce();

    expect(await notes()).toEqual([
      { transaction_id: "tx-1", note: "з іншого пристрою", deleted_at: null },
      {
        transaction_id: "tx-2",
        note: "",
        deleted_at: "2026-10-11T10:00:00.000Z",
      },
    ]);
    // Основний курсор не перемотано (increment-оп-и не ідемпотентні).
    expect(await readPullSinceCursor(client, USER)).toBe(50);
    expect(pull.mock.calls.map((c) => c[0])).toEqual([0, 50]);

    // Другий тік: прапор стоїть, повторного проходу від 0 нема.
    pull.mockClear();
    await runtime.pullOnce();
    expect(pull.mock.calls.map((c) => c[0])).toEqual([50]);
  });

  it("LWW: новіша локальна правка не затирається догоном", async () => {
    await writePullSinceCursor(client, USER, 50);
    await client.run(
      `INSERT INTO finyk_tx_notes
         (user_id, transaction_id, note, created_at, updated_at, deleted_at)
       VALUES (?, 'tx-1', 'локальна новіша', ?, ?, NULL)`,
      [USER, "2026-10-12T10:00:00.000Z", "2026-10-12T10:00:00.000Z"],
    );
    const { runtime } = makeRuntime([
      noteOp(
        10,
        "insert",
        "tx-1",
        "серверна старіша",
        "2026-10-10T10:00:00.000Z",
      ),
    ]);

    await runtime.pullOnce();

    expect((await notes())[0]!.note).toBe("локальна новіша");
  });

  it("свіжа інсталяція: окремого проходу немає, прапор ставиться після основного pull", async () => {
    const { pull, runtime } = makeRuntime([
      noteOp(10, "insert", "tx-1", "нотатка", "2026-10-10T10:00:00.000Z"),
    ]);

    await runtime.pullOnce();
    expect(pull.mock.calls.map((c) => c[0])).toEqual([0]);

    pull.mockClear();
    await runtime.pullOnce();
    // Курсор уже 10, прапор «зроблено» стоїть: від 0 не йдемо.
    expect(pull.mock.calls.map((c) => c[0])).toEqual([10]);
  });

  it("довга історія: догін бере обмежену кількість сторінок за тік і продовжує з прогресу", async () => {
    await writePullSinceCursor(client, USER, 1000);
    const total = BACKFILL_PAGES_PER_TICK + 2;
    const log = Array.from({ length: total }, (_, i) =>
      noteOp(
        i + 1,
        "insert",
        `tx-${i + 1}`,
        `n${i + 1}`,
        "2026-10-10T10:00:00.000Z",
      ),
    );
    const { pull, runtime } = makeRuntime(log, 1);

    await runtime.pullOnce();
    // Перший тік: рівно BACKFILL_PAGES_PER_TICK сторінок догону, далі основний pull.
    const first = pull.mock.calls.map((c) => c[0]);
    expect(first).toEqual([
      ...Array.from({ length: BACKFILL_PAGES_PER_TICK }, (_, i) => i),
      1000,
    ]);
    expect(await notes()).toHaveLength(BACKFILL_PAGES_PER_TICK);

    pull.mockClear();
    await runtime.pullOnce();
    // Другий тік продовжує з прогресу і добиває журнал.
    expect(pull.mock.calls[0]![0]).toBe(BACKFILL_PAGES_PER_TICK);
    expect(await notes()).toHaveLength(total);
    expect(await readPullSinceCursor(client, USER)).toBe(1000);

    pull.mockClear();
    await runtime.pullOnce();
    expect(pull.mock.calls.map((c) => c[0])).toEqual([1000]);
  });
});
