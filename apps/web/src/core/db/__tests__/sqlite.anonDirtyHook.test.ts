// @vitest-environment jsdom
/**
 * @status Active
 *
 * Хук DIRTY на шарі виконання SQL анонімної партиції: спека
 * `docs/work/specs/anonymous-migration-fast-path.md`, інваріант 3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  switchSqliteUser,
} from "../sqlite";
import { __resetDbOwnershipForTests } from "../dbOwnership";
import { sqlite3InitModuleMock } from "./sqlite-wasm-fake";

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));
vi.mock("../sqliteWorkerClient.js", () => ({
  openSqliteInWorker: vi.fn(),
  openSqliteMemoryInWorker: vi.fn(),
}));
vi.mock("../kvvfsHandoff.js", () => ({
  isHandoffDone: vi.fn(() => true),
  hasKvvfsData: vi.fn(() => false),
  markHandoffDone: vi.fn(),
  readKvvfsSnapshot: vi.fn(() => null),
  pruneForeignPartitionRows: vi.fn(async () => 0),
  takeKvvfsCensus: vi.fn(async () => ({
    userIds: [],
    outboxRows: 0,
    kvStoreRows: 0,
  })),
  canRemoveKvvfsStore: vi.fn(() => false),
  removeKvvfsStore: vi.fn(() => 0),
  isAnotherAccountHandoffDone: vi.fn(() => false),
}));

import { openSqliteInWorker } from "../sqliteWorkerClient.js";
import {
  __resetAnonPartitionStateForTests,
  readAnonPartitionState,
} from "../../durability/anonPartitionState";

function fakeWorkerConnection(dbName = "sergeant-anon.db") {
  return {
    dbName,
    grewBy: 0,
    imported: false,
    exec: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    all: vi.fn(async () => [] as unknown[]),
    diagnostics: vi.fn(async () => ({ capacity: 24, fileCount: 2 })),
    close: vi.fn(async () => {}),
    wipe: vi.fn(async () => {}),
    prune: vi.fn(async () => ({ removed: [], kept: [] })),
  };
}

beforeEach(() => {
  __resetSqliteDbForTests();
  __resetDbOwnershipForTests();
  __resetAnonPartitionStateForTests();
  localStorage.clear();
  vi.mocked(openSqliteInWorker).mockReset();
  vi.mocked(openSqliteInWorker).mockImplementation(async () =>
    fakeWorkerConnection(),
  );
});

afterEach(() => {
  __resetSqliteDbForTests();
  expect(sqlite3InitModuleMock).not.toHaveBeenCalled();
});

describe("DIRTY-хук анонімної партиції (anonymous-migration-fast-path, PR2)", () => {
  it("запис у модульну таблицю на анонімній партиції ставить DIRTY до самого запису", async () => {
    const conn = fakeWorkerConnection();
    conn.run.mockImplementation(async () => {
      expect(readAnonPartitionState()).toBe("dirty");
    });
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);
    const handle = await getSqliteDb();

    await handle
      .migrationClient()
      .run("INSERT INTO routine_habits (id) VALUES (?)", ["h1"]);

    expect(conn.run).toHaveBeenCalledTimes(1);
    expect(readAnonPartitionState()).toBe("dirty");
  });

  it("drizzle-запис (insert ... returning через all) теж ставить DIRTY", async () => {
    const conn = fakeWorkerConnection();
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);
    const handle = await getSqliteDb();

    await handle
      .migrationClient()
      .all('insert into "fizruk_workouts" ("id") values (?) returning "id"', [
        "w1",
      ]);

    expect(readAnonPartitionState()).toBe("dirty");
  });

  it("KV, читання і видалення анонімну партицію не бруднять", async () => {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();

    await client.run(
      'insert into "kv_store" ("k", "v") values (?, ?) on conflict ("k") do update set "v" = excluded."v"',
      ["a", "b"],
    );
    await client.all("SELECT * FROM routine_habits WHERE user_id = ?", ["x"]);
    await client.run("DELETE FROM routine_habits WHERE id = ?", ["h1"]);

    expect(readAnonPartitionState()).toBe("unknown");
  });

  it("запис у партицію акаунта прапорець не чіпає", async () => {
    await switchSqliteUser("user-1");
    const handle = await getSqliteDb();

    await handle
      .migrationClient()
      .run("INSERT INTO routine_habits (id) VALUES (?)", ["h1"]);

    expect(readAnonPartitionState()).toBe("unknown");
  });
});
