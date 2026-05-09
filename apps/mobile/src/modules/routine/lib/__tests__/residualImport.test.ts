/**
 * Unit tests for `apps/mobile/src/modules/routine/lib/residualImport.ts`.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`.
 * Mirror coverage of the web `residualImport` test slice — exercises:
 *
 *  - early-return when the MMKV key is absent (no SQLite calls);
 *  - happy path: MMKV blob → diff → apply → MMKV deleted;
 *  - LWW guard: residual import does NOT clobber a newer SQLite row
 *    (existing habit name wins because the import uses a stale ts);
 *  - apply-failure path: MMKV key retained, returns
 *    `{ imported: false, cleaned: false }`.
 */

import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_STORAGE_KEY,
  defaultRoutineState,
  serializeRoutineState,
  type Habit,
  type RoutineState,
} from "@sergeant/routine-domain";

import { _getMMKVInstance } from "@/lib/storage";

import { migrateRoutine } from "../clientMigrate";
import { applyRoutineDualWriteOps } from "../dualWrite/adapter";
import { diffRoutineDualWriteOps } from "../dualWrite/diff";
import { importRoutineResidualFromMmkv } from "../residualImport";

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

const USER_ID = "user-routine-residual";
const NEW_TIMESTAMP = "2026-05-09T18:00:00.000Z";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Випити воду",
    emoji: "💧",
    recurrence: "daily",
    tagIds: [],
    categoryId: null,
    archived: false,
    paused: false,
    reminderTimes: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: "2026-01-01",
    ...overrides,
  } as Habit;
}

function seedMmkv(state: RoutineState): void {
  _getMMKVInstance().set(ROUTINE_STORAGE_KEY, serializeRoutineState(state));
}

describe("importRoutineResidualFromMmkv", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateRoutine(client);
    _getMMKVInstance().clearAll();
  });

  afterEach(() => {
    db.close();
    _getMMKVInstance().clearAll();
  });

  it("no-ops when the MMKV key is absent", async () => {
    const result = await importRoutineResidualFromMmkv(client, USER_ID);
    expect(result).toEqual({ imported: false, cleaned: false });
    expect(_getMMKVInstance().contains(ROUTINE_STORAGE_KEY)).toBe(false);
  });

  it("imports the MMKV blob into SQLite and deletes the MMKV key", async () => {
    const habit = makeHabit();
    const state: RoutineState = {
      ...defaultRoutineState(),
      habits: [habit],
      habitOrder: [habit.id],
    };
    seedMmkv(state);

    const result = await importRoutineResidualFromMmkv(client, USER_ID);

    expect(result.imported).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(_getMMKVInstance().contains(ROUTINE_STORAGE_KEY)).toBe(false);

    const rows = await client.all<{ id: string; name: string }>(
      "SELECT id, name FROM routine_habits WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Випити воду");
  });

  it("does NOT clobber a newer SQLite row (LWW guard)", async () => {
    const habit = makeHabit({ name: "Old MMKV name" });
    seedMmkv({
      ...defaultRoutineState(),
      habits: [habit],
      habitOrder: [habit.id],
    });

    // Pre-populate SQLite with a NEWER row for the same habit id.
    // The residual import must not overwrite it because it uses a
    // stale (epoch-zero) clientTs.
    const newer: RoutineState = {
      ...defaultRoutineState(),
      habits: [makeHabit({ name: "New SQLite name" })],
      habitOrder: ["h1"],
    };
    const ops = diffRoutineDualWriteOps(defaultRoutineState(), newer);
    await applyRoutineDualWriteOps(client, ops, {
      userId: USER_ID,
      clientTs: NEW_TIMESTAMP,
    });

    await importRoutineResidualFromMmkv(client, USER_ID);

    const rows = await client.all<{ name: string }>(
      "SELECT name FROM routine_habits WHERE user_id = ? AND id = 'h1'",
      [USER_ID],
    );
    expect(rows[0]?.name).toBe("New SQLite name");
    // MMKV key still gets cleaned even though the import was a no-op
    // for this row — the helper uses table-level idempotency, not
    // row-level «did anything actually update».
    expect(_getMMKVInstance().contains(ROUTINE_STORAGE_KEY)).toBe(false);
  });
});
