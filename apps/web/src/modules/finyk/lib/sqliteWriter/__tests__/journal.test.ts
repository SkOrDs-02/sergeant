import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

import {
  __clearFinykDualWriteContextForTests,
  registerFinykDualWriteContext,
  triggerFinykDualWrite,
  type FinykDualWriteContext,
  type FinykDualWriteState,
} from "../index.js";
import { EMPTY_FINYK_STATE } from "../diff.js";
import { pendingDualWrites } from "../../../../../core/durability/dualWriteJournal.js";
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { trackOutboxWrite } from "../../../../../core/syncEngine/outboxCheckpoint.js";
import { installMemoryLocalStorage } from "../../../../../core/durability/__tests__/memoryLocalStorage.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const USER_ID = "u-1";

const withExpense: FinykDualWriteState = {
  ...EMPTY_FINYK_STATE,
  manualExpenses: [
    { id: "m-journal-1", dataJson: '{"id":"m-journal-1","amount":42}' },
  ],
};

let handle: TestSqliteHandle;

beforeEach(async () => {
  installMemoryLocalStorage();
  handle = await createTestSqlite();
  __clearFinykDualWriteContextForTests();
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
});

function ctx(
  overrides: Partial<FinykDualWriteContext> = {},
): FinykDualWriteContext {
  return {
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    getNow: () => new Date().toISOString(),
    ...overrides,
  };
}

const expenseRows = () =>
  handle.client.all<{ id: string }>(
    "SELECT id FROM finyk_manual_expenses WHERE id = ? AND deleted_at IS NULL",
    ["m-journal-1"],
  );

describe("Finyk dual-write journal (аудит 2026-09-28, D1)", () => {
  it("replays a write whose page died before the queue reached SQLite", async () => {
    // Сторінка «вмирає»: SQLite так і не відповідає.
    registerFinykDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerFinykDualWrite(EMPTY_FINYK_STATE, withExpense);
    await new Promise((r) => setTimeout(r, 10));
    expect(await expenseRows()).toEqual([]);

    // Наступний бут: модульний стан скинуто, localStorage лишився.
    __clearFinykDualWriteContextForTests();
    registerFinykDualWriteContext(ctx());

    await vi.waitFor(async () => expect(await expenseRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("finyk", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("clears the journal once the write is applied", async () => {
    registerFinykDualWriteContext(ctx());
    triggerFinykDualWrite(EMPTY_FINYK_STATE, withExpense);
    await vi.waitFor(async () => expect(await expenseRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("finyk", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("keeps the journal entry when the outbox row for the server fails", async () => {
    // Справжній enqueueOutboxUpsert реєструє свій запис у чекпоінті; мок
    // повторює саме це, інакше тест не бачив би збою outbox.
    vi.mocked(enqueueOutboxUpsert).mockImplementationOnce(() => {
      const failed = Promise.reject(new Error("disk I/O error"));
      trackOutboxWrite(failed);
      return failed;
    });
    registerFinykDualWriteContext(ctx());
    triggerFinykDualWrite(EMPTY_FINYK_STATE, withExpense);
    await vi.waitFor(async () => expect(await expenseRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(pendingDualWrites("finyk", USER_ID)).toHaveLength(1);
  });

  it("keeps the journal entry when the SQL write throws, and applies it on the next boot (data-05)", async () => {
    // SQLITE_BUSY посеред сесії: адаптер ловить виняток опа, рахує errored і
    // все одно повертає "applied", тож раніше журнал знімався.
    registerFinykDualWriteContext(
      ctx({
        getMigrationClient: async () => ({
          ...handle.client,
          run: () => {
            throw new Error("SQLITE_BUSY: database is locked");
          },
        }),
      }),
    );
    triggerFinykDualWrite(EMPTY_FINYK_STATE, withExpense);
    await new Promise((r) => setTimeout(r, 100));
    expect(await expenseRows()).toEqual([]);
    const pending = pendingDualWrites("finyk", USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);

    // Наступний бут зі здоровою базою: той самий запис доїжджає і знімається.
    __clearFinykDualWriteContextForTests();
    registerFinykDualWriteContext(ctx());
    await vi.waitFor(async () => expect(await expenseRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("finyk", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("does not replay another user's pending writes", async () => {
    registerFinykDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerFinykDualWrite(EMPTY_FINYK_STATE, withExpense);
    __clearFinykDualWriteContextForTests();

    registerFinykDualWriteContext(ctx({ getUserId: () => "someone-else" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await expenseRows()).toEqual([]);
    expect(pendingDualWrites("finyk", USER_ID)).toHaveLength(1);
  });
});
