import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

// Patch enqueueOutboxUpsert and enqueueOutboxIncrement so integration tests
// can assert the outbox enqueue shape without a real sync_op_outbox table.
// Both mocks are hoisted via vi.mock so they intercept the adapter imports.
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("@sergeant/db-schema/sqlite", () => ({
  enqueueOutboxIncrement: vi
    .fn()
    .mockResolvedValue({ ok: true, id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { enqueueOutboxIncrement } from "@sergeant/db-schema/sqlite";
import { ROUTINE_DAY_ANCHOR } from "../../dayAnchor.js";

import {
  __clearRoutineDualWriteContextForTests,
  dualWriteRoutineState,
  registerRoutineDualWriteContext,
  type DualWriteLogger,
  type RoutineDualWriteContext,
} from "../index.js";
import { createTestSqlite } from "./testSqlite.js";

interface RoutineEntryRowRaw extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const T1 = "2026-05-01T10:00:00.000+00:00";
const USER_ID = "user-1";

function makeState(
  habits: { id: string; name: string }[],
  completions: Record<string, string[]>,
) {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits,
    completions,
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

async function listEntries(
  client: SqliteMigrationClient,
): Promise<RoutineEntryRowRaw[]> {
  return client.all<RoutineEntryRowRaw>(
    `SELECT id, user_id, name, completed_at, created_at, updated_at, deleted_at
       FROM routine_entries
      ORDER BY id ASC`,
    [],
  );
}

describe("dualWriteRoutineState orchestrator", () => {
  let handle: Awaited<ReturnType<typeof createTestSqlite>>;
  // Vitest 4 widened the default `Mock` to `Mock<Procedure | Constructable>`,
  // which is no longer assignable to `DualWriteLogger`. Pin the spy to the
  // logger signature so it can be passed directly into `RoutineDualWriteContext`.
  let logger: Mock<DualWriteLogger>;

  beforeEach(async () => {
    handle = await createTestSqlite();
    logger = vi.fn<DualWriteLogger>();
  });

  afterEach(() => {
    __clearRoutineDualWriteContextForTests();
    handle.close();
  });

  function makeContext(
    overrides: Partial<RoutineDualWriteContext> = {},
  ): RoutineDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => T1,
      logger,
      ...overrides,
    };
  }

  it("returns context-unset when no context is registered", async () => {
    const prev = makeState([], {});
    const next = makeState([{ id: "h1", name: "X" }], { h1: ["2026-05-01"] });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({ status: "skipped", reason: "context-unset" });
    expect(await listEntries(handle.client)).toEqual([]);
  });

  it("returns no-ops when prev === next", async () => {
    registerRoutineDualWriteContext(makeContext());
    const state = makeState([{ id: "h1", name: "X" }], {});
    const result = await dualWriteRoutineState(state, state);
    expect(result).toEqual({ status: "skipped", reason: "no-ops" });
    expect(await listEntries(handle.client)).toEqual([]);
  });

  it("returns user-id-missing when getUserId returns null and logs the skip", async () => {
    registerRoutineDualWriteContext(makeContext({ getUserId: () => null }));
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({ status: "skipped", reason: "user-id-missing" });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write skipped: user id unavailable",
      expect.objectContaining({ ops: 2 }),
    );
    expect(await listEntries(handle.client)).toEqual([]);
  });

  it("returns sqlite-unavailable when getMigrationClient throws (not propagated)", async () => {
    registerRoutineDualWriteContext(
      makeContext({
        getMigrationClient: async () => {
          throw new Error("opfs unavailable");
        },
      }),
    );
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({ status: "skipped", reason: "sqlite-unavailable" });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write skipped: sqlite unavailable",
      expect.objectContaining({ error: "opfs unavailable" }),
    );
  });

  it("returns sqlite-unavailable when getMigrationClient resolves to null", async () => {
    registerRoutineDualWriteContext(
      makeContext({ getMigrationClient: async () => null }),
    );
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({ status: "skipped", reason: "sqlite-unavailable" });
  });

  it("applies completion-add to SQLite when context is healthy", async () => {
    registerRoutineDualWriteContext(makeContext());
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const result = await dualWriteRoutineState(prev, next);
    // 2 ops: старий `completion-add` у `routine_entries` + append-only
    // подія журналу (W1-ROUTINE-APPEND стадія 1). Обидва шляхи живуть
    // паралельно; старий рядок нижче має лишитись байт-у-байт тим самим.
    expect(result).toEqual({
      status: "applied",
      result: { applied: 2, errored: 0, skipped: 0 },
    });
    const events = await handle.client.all<{
      id: string;
      habit_id: string;
      date_key: string;
      state: string;
      day_anchor: string;
      source: string;
    }>(`SELECT * FROM routine_completion_events`);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      habit_id: "h1",
      date_key: "2026-05-01",
      state: "done",
      // Не літерал: анкер приходить із того самого модуля, що продукує
      // «сьогодні» для UI (`lib/dayAnchor.ts`). Раніше тут стояв
      // захардкоджений `device-local` поруч із київським `date_key` —
      // саме та розбіжність, через яку колонка брехала.
      day_anchor: ROUTINE_DAY_ANCHOR,
      source: "ui",
    });
    const rows = await listEntries(handle.client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "h1:2026-05-01",
      user_id: USER_ID,
      name: "Drink",
      deleted_at: null,
    });
  });

  it("does NOT throw even when the underlying client throws on every call", async () => {
    registerRoutineDualWriteContext(
      makeContext({
        getMigrationClient: async () => ({
          exec: async () => {
            throw new Error("boom");
          },
          run: async () => {
            throw new Error("boom");
          },
          all: async () => {
            throw new Error("boom");
          },
        }),
      }),
    );
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    // The promise resolves (does not reject) and reports errored.
    const result = await dualWriteRoutineState(prev, next);
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      // Обидва ops (старий + журнальний) падають на битому клієнті —
      // і жоден не кидає назовні.
      expect(result.result.errored).toBe(2);
      expect(result.result.applied).toBe(0);
    }
  });

  it("teardown function clears the registered context", async () => {
    const teardown = registerRoutineDualWriteContext(makeContext());
    teardown();
    const prev = makeState([], {});
    const next = makeState([{ id: "h1", name: "X" }], { h1: ["2026-05-01"] });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({ status: "skipped", reason: "context-unset" });
  });
});

describe("dualWriteRoutineState — outbox enqueue wiring", () => {
  const enqueueMock = enqueueOutboxUpsert as ReturnType<typeof vi.fn>;
  const incrementMock = enqueueOutboxIncrement as ReturnType<typeof vi.fn>;

  let handle: Awaited<ReturnType<typeof createTestSqlite>>;

  beforeEach(async () => {
    handle = await createTestSqlite();
    enqueueMock.mockClear();
    enqueueMock.mockResolvedValue({ id: 1, inserted: true });
    incrementMock.mockClear();
    incrementMock.mockResolvedValue({ ok: true, id: 1, inserted: true });
  });

  afterEach(() => {
    __clearRoutineDualWriteContextForTests();
    handle.close();
  });

  function makeCtx(): import("../index.js").RoutineDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => T1,
    };
  }

  it("enqueues a routine_entries insert op after completion-add", async () => {
    registerRoutineDualWriteContext(makeCtx());
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });

    await dualWriteRoutineState(prev, next);

    // Allow the fire-and-forget microtask to run.
    await Promise.resolve();
    await Promise.resolve();

    // Стадія 1 W1-ROUTINE-APPEND: у чергу тепер їде ДВА op-и — старий
    // `routine_entries` insert і append-only подія журналу. Фільтруємо
    // за таблицею, щоб тест перевіряв саме старий контракт.
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    const entryCalls = enqueueMock.mock.calls.filter(
      ([, i]) => i.table === "routine_entries",
    );
    expect(entryCalls).toHaveLength(1);
    const [, input] = entryCalls[0]!;
    expect(input.table).toBe("routine_entries");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      id: "h1:2026-05-01",
      user_id: USER_ID,
      name: "Drink",
    });
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("enqueues a routine_entries delete op after completion-remove", async () => {
    registerRoutineDualWriteContext(makeCtx());

    // Seed an existing completion so the dualWrite has something to remove.
    await handle.client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      ["h1:2026-05-01", USER_ID, "Drink", T1, T1, T1],
    );

    const prev = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const next = makeState([{ id: "h1", name: "Drink" }], {});

    await dualWriteRoutineState(prev, next);

    await Promise.resolve();
    await Promise.resolve();

    expect(enqueueMock).toHaveBeenCalledTimes(2);
    const entryCalls = enqueueMock.mock.calls.filter(
      ([, i]) => i.table === "routine_entries",
    );
    expect(entryCalls).toHaveLength(1);
    const [, input] = entryCalls[0]!;
    expect(input.table).toBe("routine_entries");
    expect(input.op).toBe("delete");
    expect(input.row).toMatchObject({ id: "h1:2026-05-01", user_id: USER_ID });

    // Журнальна подія їде окремим op-ом і фіксує саме ЗНЯТТЯ відмітки.
    const eventCalls = enqueueMock.mock.calls.filter(
      ([, i]) => i.table === "routine_completion_events",
    );
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0]![1].op).toBe("insert");
    expect(eventCalls[0]![1].row).toMatchObject({
      habit_id: "h1",
      date_key: "2026-05-01",
      state: "undone",
    });
  });

  it("does NOT reject dualWrite when enqueueOutboxUpsert throws", async () => {
    enqueueMock.mockRejectedValue(new Error("disk full"));
    registerRoutineDualWriteContext(makeCtx());

    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });

    // Must resolve successfully — local write is unaffected.
    const result = await dualWriteRoutineState(prev, next);
    expect(result.status).toBe("applied");

    // The SQLite entry was still written.
    const rows = await listEntries(handle.client);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("h1:2026-05-01");
  });

  it("enqueues a routine_streaks increment(+1) op after completion-add", async () => {
    registerRoutineDualWriteContext(makeCtx());
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });

    await dualWriteRoutineState(prev, next);

    // Allow the fire-and-forget microtask chain to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(incrementMock).toHaveBeenCalledOnce();
    const [, input] = incrementMock.mock.calls[0]!;
    expect(input.table).toBe("routine_streaks");
    expect(input.row).toMatchObject({ user_id: USER_ID, delta: 1 });
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("enqueues a routine_streaks increment(-1) op after completion-remove", async () => {
    registerRoutineDualWriteContext(makeCtx());

    // Seed an existing completion so the diff produces a completion-remove.
    await handle.client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      ["h1:2026-05-01", USER_ID, "Drink", T1, T1, T1],
    );

    const prev = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const next = makeState([{ id: "h1", name: "Drink" }], {});

    await dualWriteRoutineState(prev, next);

    await Promise.resolve();
    await Promise.resolve();

    expect(incrementMock).toHaveBeenCalledOnce();
    const [, input] = incrementMock.mock.calls[0]!;
    expect(input.table).toBe("routine_streaks");
    expect(input.row).toMatchObject({ user_id: USER_ID, delta: -1 });
  });

  it("does NOT reject dualWrite when enqueueOutboxIncrement throws (fire-and-forget)", async () => {
    incrementMock.mockRejectedValue(new Error("outbox full"));
    registerRoutineDualWriteContext(makeCtx());

    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });

    const result = await dualWriteRoutineState(prev, next);
    expect(result.status).toBe("applied");

    // Local write succeeded regardless of outbox failure.
    const rows = await listEntries(handle.client);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("h1:2026-05-01");
  });
});
