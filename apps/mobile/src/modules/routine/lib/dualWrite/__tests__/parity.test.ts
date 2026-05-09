/**
 * Parity probe tests — mirror of
 * `apps/web/src/modules/routine/lib/dualWrite/__tests__/parity.test.ts`.
 *
 * Stage 10 mobile mirror: validates that `probeRoutineParity` returns
 * `match` when MMKV-derived state and SQLite agree across all 7
 * Stage 10 entity classes, and `mismatch` (with class-level details)
 * when they disagree.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { RoutineState } from "@sergeant/routine-domain";

import { migrateRoutine } from "../../clientMigrate";
import { applyRoutineDualWriteOps } from "../adapter";
import { probeRoutineParity } from "../parity";

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

function makeState(overrides: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    pushupsByDate: {},
    habitOrder: [],
    completionNotes: {},
    ...overrides,
  };
}

const USER_ID = "user-1";
const T1 = "2026-05-01T10:00:00.000+00:00";

describe("probeRoutineParity", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateRoutine(client);
  });

  afterEach(() => {
    db.close();
  });

  it("reports match when both LS and SQLite are empty", async () => {
    const state = makeState();
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("match");
  });

  it("reports match after a full dual-write apply", async () => {
    const state = makeState({
      habits: [{ id: "h1", name: "Drink water", createdAt: T1 }],
      tags: [{ id: "t1", name: "morning" }],
      categories: [{ id: "c1", name: "Health" }],
      completions: { h1: ["2026-05-01"] },
      pushupsByDate: { "2026-05-01": 30 },
      habitOrder: ["h1"],
      completionNotes: { "h1__2026-05-01": "did well" },
      prefs: { showFizrukInCalendar: true },
    });
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "habit-upsert",
          habit: { id: "h1", name: "Drink water", createdAt: T1 },
        },
        { kind: "tag-upsert", tag: { id: "t1", name: "morning" } },
        { kind: "category-upsert", category: { id: "c1", name: "Health" } },
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
          dateKey: "2026-05-01",
        },
        { kind: "pushup-upsert", dateKey: "2026-05-01", reps: 30 },
        { kind: "habit-order-set", orderedIds: ["h1"] },
        {
          kind: "completion-note-upsert",
          noteKey: "h1__2026-05-01",
          note: "did well",
        },
        { kind: "prefs-set", prefs: { showFizrukInCalendar: true } },
      ],
      { userId: USER_ID, clientTs: T1 },
    );
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("match");
  });

  it("reports mismatch when SQLite is missing a habit present in LS", async () => {
    const state = makeState({
      habits: [{ id: "h1", name: "Drink water", createdAt: T1 }],
    });
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("mismatch");
    expect(outcome.details).toMatchObject({
      habits: { ls: 1, sqlite: 0 },
    });
  });

  it("reports mismatch when SQLite has a stale prefs blob", async () => {
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "prefs-set", prefs: { showFizrukInCalendar: true } }],
      { userId: USER_ID, clientTs: T1 },
    );
    const state = makeState({ prefs: { showFizrukInCalendar: false } });
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("mismatch");
  });

  it("reports mismatch when habit order differs", async () => {
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "habit-order-set", orderedIds: ["h1", "h2"] }],
      { userId: USER_ID, clientTs: T1 },
    );
    const state = makeState({ habitOrder: ["h2", "h1"] });
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("mismatch");
  });

  it("excludes empty notes from LS-side cardinality", async () => {
    // SQLite has no notes; LS has only an empty-string note. The
    // probe must treat the empty-string entry as absent (parity match).
    const state = makeState({
      completionNotes: { "h1__2026-05-01": "" },
    });
    const outcome = await probeRoutineParity(client, USER_ID, state);
    expect(outcome.result).toBe("match");
  });
});
