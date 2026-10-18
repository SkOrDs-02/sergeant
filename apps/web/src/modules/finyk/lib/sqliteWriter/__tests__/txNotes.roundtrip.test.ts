// Нотатки до операцій у бекапі (аудит 2026-10-01, data-27): імпорт файлу
// пише їх у SQLite (+ outbox), а не в LS. Справжній SQLite, реальний
// `persistFinykNormalizedToSqlite`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  persistFinykNormalizedToSqlite,
  readFinykBackupFromStorage,
} from "../../finykBackup";
import {
  clearFinykSqliteCache,
  refreshFinykSqliteState,
} from "../../sqliteReader.js";
import { __resetFinykSqliteReadGateForTests } from "../../sqliteReadGate.js";
import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOps,
  registerFinykDualWriteContext,
} from "../index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const USER_ID = "u-1";
const T1 = "2026-10-10T10:00:00.000Z";
let tick = 0;

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  vi.mocked(enqueueOutboxUpsert).mockClear();
  tick = 0;
  registerFinykDualWriteContext({
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    getNow: () =>
      new Date(Date.UTC(2026, 9, 10, 12, 0, 0) + 1000 * ++tick).toISOString(),
  });
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
});

async function seed(notes: Record<string, string>): Promise<void> {
  await applyFinykDualWriteOps(
    handle.client,
    Object.entries(notes).map(([transactionId, note]) => ({
      kind: "tx-note-upsert" as const,
      entry: { transactionId, note },
    })),
    { userId: USER_ID, clientTs: T1 },
  );
  await refreshFinykSqliteState(handle.client, USER_ID);
}

const notes = async () =>
  (await refreshFinykSqliteState(handle.client, USER_ID)).txNotes;

describe("txNotes у відновленні з бекапу", () => {
  it("експорт читає нотатки з теплого SQLite-кешу", async () => {
    await seed({ "tx-1": "оренда" });
    expect(readFinykBackupFromStorage().txNotes).toEqual({ "tx-1": "оренда" });
  });

  it("merge додає відсутні нотатки й не затирає наявні на пристрої", async () => {
    await seed({ "tx-1": "моя" });

    const out = await persistFinykNormalizedToSqlite(
      { txNotes: { "tx-1": "з файлу", "tx-9": "нова" } },
      "merge",
    );

    expect(out.status).toBe("applied");
    expect(await notes()).toEqual({ "tx-1": "моя", "tx-9": "нова" });
  });

  it("replace підміняє набір: нотатки поза файлом гасяться tombstone-ом", async () => {
    await seed({ "tx-1": "стара", "tx-2": "зайва" });

    await persistFinykNormalizedToSqlite(
      { txNotes: { "tx-1": "з файлу" } },
      "replace",
    );

    expect(await notes()).toEqual({ "tx-1": "з файлу" });
    const gone = await handle.client.all<{
      deleted_at: string | null;
      note: string;
    }>(
      `SELECT deleted_at, note FROM finyk_tx_notes WHERE transaction_id = 'tx-2'`,
    );
    expect(gone[0]!.deleted_at).not.toBeNull();
    // Приватність: tombstone не тримає текст нотатки.
    expect(gone[0]!.note).toBe("");
  });

  it("старий бекап без txNotes нотаток не чіпає (і в replace, і в merge)", async () => {
    await seed({ "tx-1": "лишається" });

    await persistFinykNormalizedToSqlite({ budgets: [] }, "replace");
    expect(await notes()).toEqual({ "tx-1": "лишається" });
    await persistFinykNormalizedToSqlite({ budgets: [] }, "merge");
    expect(await notes()).toEqual({ "tx-1": "лишається" });
  });

  it("імпортовані нотатки їдуть у чергу синку", async () => {
    await seed({});
    vi.mocked(enqueueOutboxUpsert).mockClear();

    await persistFinykNormalizedToSqlite(
      { txNotes: { "tx-5": "з файлу" } },
      "merge",
    );

    const queued = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.filter(([, input]) => input.table === "finyk_tx_notes");
    expect(queued).toHaveLength(1);
    expect(queued[0]![1]).toMatchObject({
      op: "insert",
      row: { user_id: USER_ID, transaction_id: "tx-5", note: "з файлу" },
    });
  });
});
