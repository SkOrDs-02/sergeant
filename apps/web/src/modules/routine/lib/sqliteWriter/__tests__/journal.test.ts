// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("@sergeant/db-schema/sqlite", () => ({
  enqueueOutboxIncrement: vi
    .fn()
    .mockResolvedValue({ ok: true, id: 1, inserted: true }),
}));

import {
  __clearRoutineDualWriteContextForTests,
  registerRoutineDualWriteContext,
  routineDualWriteBufferedRuns,
  triggerRoutineDualWrite,
  type RoutineDualWriteContext,
} from "../index.js";
import { pendingDualWrites } from "../../../../../core/durability/dualWriteJournal.js";
import { installMemoryLocalStorage } from "../../../../../core/durability/__tests__/memoryLocalStorage.js";
import { createTestSqlite } from "./testSqlite.js";
import {
  clearSqliteRoutineStateCache,
  getCachedSqliteRoutineState,
  refreshSqliteRoutineState,
} from "../../sqliteReader.js";
import { ROUTINE_EVENT } from "@sergeant/routine-domain";
import { __resetRoutineLocalWriteWindowForTests } from "../../localWriteWindow.js";

const USER_ID = "user-1";

function state(habits: { id: string; name: string }[]) {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits,
    completions: {},
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

describe("Routine dual-write journal (аудит 2026-09-28, D1)", () => {
  let handle: Awaited<ReturnType<typeof createTestSqlite>>;

  beforeEach(async () => {
    installMemoryLocalStorage();
    handle = await createTestSqlite();
    __clearRoutineDualWriteContextForTests();
  });

  afterEach(() => {
    __clearRoutineDualWriteContextForTests();
    handle.close();
  });

  function ctx(
    overrides: Partial<RoutineDualWriteContext> = {},
  ): RoutineDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => new Date().toISOString(),
      ...overrides,
    };
  }

  const habitRows = () =>
    handle.client.all<{ id: string }>(
      "SELECT id FROM routine_habits WHERE id = ? AND deleted_at IS NULL",
      ["h-journal"],
    );

  it("applies a habit created before the context registered (prod 2026-11-20, DATA-2)", async () => {
    const before = routineDualWriteBufferedRuns();
    triggerRoutineDualWrite(
      state([]) as never,
      state([{ id: "h-journal", name: "Рання звичка" }]) as never,
    );
    expect(routineDualWriteBufferedRuns()).toBe(before + 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(await habitRows()).toEqual([]);

    registerRoutineDualWriteContext(ctx());

    await vi.waitFor(async () => expect(await habitRows()).toHaveLength(1), {
      timeout: 2000,
    });
  });

  it("replays a habit whose page died before the write reached SQLite", async () => {
    registerRoutineDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerRoutineDualWrite(
      state([]),
      state([{ id: "h-journal", name: "Вода" }]),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(await habitRows()).toEqual([]);

    __clearRoutineDualWriteContextForTests();
    registerRoutineDualWriteContext(ctx());

    await vi.waitFor(async () => expect(await habitRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("routine", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("keeps the journal entry when the SQL write throws, and applies it on the next boot (data-05)", async () => {
    registerRoutineDualWriteContext(
      ctx({
        getMigrationClient: async () => ({
          ...handle.client,
          run: () => {
            throw new Error("SQLITE_BUSY: database is locked");
          },
        }),
      }),
    );
    triggerRoutineDualWrite(
      state([]),
      state([{ id: "h-journal", name: "Вода" }]),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(await habitRows()).toEqual([]);
    const pending = pendingDualWrites("routine", USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);

    __clearRoutineDualWriteContextForTests();
    registerRoutineDualWriteContext(ctx());
    await vi.waitFor(async () => expect(await habitRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("routine", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("refreshes the read cache and notifies the UI after a boot replay (full-2026-11-19)", async () => {
    // Сторінка померла до коміту: запис лишився лише в журналі.
    registerRoutineDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerRoutineDualWrite(
      state([]),
      state([{ id: "h-journal", name: "Вода" }]),
    );
    await new Promise((r) => setTimeout(r, 10));

    // Новий бут: read-boot уже прочитав порожню базу і прогрів кеш нулем —
    // саме так анонім бачив «Звичок ще немає» до наступного перезавантаження.
    // Вікно запису живе в модулі сторінки; та сторінка померла разом зі своїм
    // «вічним» записом, тож новий бут стартує з нульовим лічильником.
    __clearRoutineDualWriteContextForTests();
    __resetRoutineLocalWriteWindowForTests();
    clearSqliteRoutineStateCache();
    await refreshSqliteRoutineState(handle.client, USER_ID);
    expect(getCachedSqliteRoutineState().habits).toEqual([]);

    const events = vi.fn();
    window.addEventListener(ROUTINE_EVENT, events);
    try {
      registerRoutineDualWriteContext(ctx());
      await vi.waitFor(
        () =>
          expect(getCachedSqliteRoutineState().habits.map((h) => h.id)).toEqual(
            ["h-journal"],
          ),
        { timeout: 10_000 },
      );
      expect(events).toHaveBeenCalled();
    } finally {
      window.removeEventListener(ROUTINE_EVENT, events);
    }
  });
});
