import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

import {
  __clearFizrukDualWriteContextForTests,
  registerFizrukDualWriteContext,
  triggerFizrukDualWrite,
  type FizrukDualWriteContext,
  type FizrukDualWriteState,
} from "../index.js";
import { pendingDualWrites } from "../../../../../core/durability/dualWriteJournal.js";
import { installMemoryLocalStorage } from "../../../../../core/durability/__tests__/memoryLocalStorage.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const UID = "user-1";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  injuries: [],
};

const withLog: FizrukDualWriteState = {
  ...EMPTY,
  dailyLog: [
    {
      id: "dl-journal",
      at: "2026-09-28T10:00:00.000Z",
      weightKg: 81.2,
      sleepHours: null,
      energyLevel: null,
      mood: null,
      note: "журнал",
    },
  ],
};

let handle: TestSqliteHandle;

beforeEach(async () => {
  installMemoryLocalStorage();
  handle = await createTestSqlite();
  __clearFizrukDualWriteContextForTests();
});

afterEach(() => {
  __clearFizrukDualWriteContextForTests();
  handle.close();
});

function ctx(
  overrides: Partial<FizrukDualWriteContext> = {},
): FizrukDualWriteContext {
  return {
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    getNow: () => new Date().toISOString(),
    ...overrides,
  };
}

const logRows = () =>
  handle.client.all<{ id: string }>(
    "SELECT id FROM fizruk_daily_log WHERE id = ? AND deleted_at IS NULL",
    ["dl-journal"],
  );

describe("Fizruk dual-write journal (аудит 2026-09-28, D1)", () => {
  it("replays a body log entry whose page died before the write reached SQLite", async () => {
    registerFizrukDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerFizrukDualWrite(EMPTY, withLog);
    await new Promise((r) => setTimeout(r, 10));
    expect(await logRows()).toEqual([]);

    __clearFizrukDualWriteContextForTests();
    registerFizrukDualWriteContext(ctx());

    await vi.waitFor(async () => expect(await logRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("fizruk", UID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("keeps the journal entry when the SQL write throws, and applies it on the next boot (data-05)", async () => {
    registerFizrukDualWriteContext(
      ctx({
        getMigrationClient: async () => ({
          ...handle.client,
          run: () => {
            throw new Error("SQLITE_BUSY: database is locked");
          },
        }),
      }),
    );
    triggerFizrukDualWrite(EMPTY, withLog);
    await new Promise((r) => setTimeout(r, 100));
    expect(await logRows()).toEqual([]);
    const pending = pendingDualWrites("fizruk", UID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);

    __clearFizrukDualWriteContextForTests();
    registerFizrukDualWriteContext(ctx());
    await vi.waitFor(async () => expect(await logRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("fizruk", UID)).toEqual([]),
      { timeout: 10_000 },
    );
  });
});
