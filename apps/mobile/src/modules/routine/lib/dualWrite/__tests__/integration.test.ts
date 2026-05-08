/**
 * Mobile-side test for the routine dual-write orchestrator.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Mirrors
 * the web copy at
 * `apps/web/src/modules/routine/lib/dualWrite/__tests__/integration.test.ts`.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateRoutine } from "../../clientMigrate";
import {
  __clearRoutineDualWriteContextForTests,
  dualWriteRoutineState,
  registerRoutineDualWriteContext,
  type RoutineDualWriteContext,
} from "../index";

interface RoutineEntryRowRaw extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function syncClient(db: ReturnType<typeof Database>): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
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
    pushupsByDate: {},
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

describe("dualWriteRoutineState orchestrator (mobile)", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;
  let logger: jest.Mock;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateRoutine(client);
    logger = jest.fn();
  });

  afterEach(() => {
    __clearRoutineDualWriteContextForTests();
    db.close();
  });

  function makeContext(
    overrides: Partial<RoutineDualWriteContext> = {},
  ): RoutineDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => client,
      getNow: () => T1,
      logger,
      ...overrides,
    };
  }

  function listEntries(): RoutineEntryRowRaw[] {
    return client.all<RoutineEntryRowRaw>(
      `SELECT id, user_id, name, completed_at, created_at, updated_at, deleted_at
         FROM routine_entries
        ORDER BY id ASC`,
      [],
    ) as unknown as RoutineEntryRowRaw[];
  }

  it("returns context-unset when nothing is registered", async () => {
    const prev = makeState([], {});
    const next = makeState([{ id: "h1", name: "X" }], { h1: ["2026-05-01"] });
    expect(await dualWriteRoutineState(prev, next)).toEqual({
      status: "skipped",
      reason: "context-unset",
    });
    expect(listEntries()).toEqual([]);
  });

  it("returns user-id-missing when getUserId() returns null", async () => {
    registerRoutineDualWriteContext(makeContext({ getUserId: () => null }));
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    expect(await dualWriteRoutineState(prev, next)).toEqual({
      status: "skipped",
      reason: "user-id-missing",
    });
    expect(listEntries()).toEqual([]);
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write skipped: user id unavailable",
      expect.objectContaining({ ops: 1 }),
    );
  });

  it("returns sqlite-unavailable on rejected getMigrationClient", async () => {
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
    expect(await dualWriteRoutineState(prev, next)).toEqual({
      status: "skipped",
      reason: "sqlite-unavailable",
    });
  });

  it("applies completion-add when fully wired", async () => {
    registerRoutineDualWriteContext(makeContext());
    const prev = makeState([{ id: "h1", name: "Drink" }], {});
    const next = makeState([{ id: "h1", name: "Drink" }], {
      h1: ["2026-05-01"],
    });
    const result = await dualWriteRoutineState(prev, next);
    expect(result).toEqual({
      status: "applied",
      result: { applied: 1, errored: 0, skipped: 0 },
    });
    const rows = listEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "h1:2026-05-01", deleted_at: null });
  });

  it("never throws even when adapter calls all fail", async () => {
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
    const result = await dualWriteRoutineState(prev, next);
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.result.errored).toBe(1);
      expect(result.result.applied).toBe(0);
    }
  });

  it("teardown function clears the registered context", async () => {
    const teardown = registerRoutineDualWriteContext(makeContext());
    teardown();
    const prev = makeState([], {});
    const next = makeState([{ id: "h1", name: "X" }], { h1: ["2026-05-01"] });
    expect(await dualWriteRoutineState(prev, next)).toEqual({
      status: "skipped",
      reason: "context-unset",
    });
  });
});
