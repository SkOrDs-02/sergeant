/**
 * Mobile-side test for the routine dual-write adapter against a real
 * `better-sqlite3` engine, mirroring
 * `apps/web/src/modules/routine/lib/dualWrite/__tests__/adapter.test.ts`.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. The adapter
 * is platform-agnostic: it talks to a `SqliteMigrationClient`, which
 * the runtime resolves to `migrationClient()` on web (sqlite-wasm)
 * or `getSqliteMigrationClient()` on mobile (expo-sqlite). Tests use
 * `better-sqlite3` so they run without a native bridge.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateRoutine } from "../../clientMigrate";
import { applyRoutineDualWriteOps, type DualWriteLogger } from "../adapter";

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

const USER_ID = "user-1";
const T0 = "2026-04-30T09:00:00.000+00:00";
const T1 = "2026-05-01T10:00:00.000+00:00";
const T2 = "2026-05-01T11:00:00.000+00:00";

describe("applyRoutineDualWriteOps (mobile, better-sqlite3)", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;
  let logger: jest.MockedFunction<DualWriteLogger>;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateRoutine(client);
    logger = jest.fn() as jest.MockedFunction<DualWriteLogger>;
  });

  afterEach(() => {
    db.close();
  });

  function listEntries(): RoutineEntryRowRaw[] {
    return client.all<RoutineEntryRowRaw>(
      `SELECT id, user_id, name, completed_at, created_at, updated_at, deleted_at
         FROM routine_entries
        ORDER BY id ASC`,
      [],
    ) as unknown as RoutineEntryRowRaw[];
  }

  it("zero ops -> zero counters, zero rows", async () => {
    const result = await applyRoutineDualWriteOps(client, [], {
      userId: USER_ID,
      clientTs: T1,
      logger,
    });
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
    expect(listEntries()).toEqual([]);
    expect(logger).not.toHaveBeenCalled();
  });

  it("upserts a row for completion-add", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = listEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "h1:2026-05-01",
      user_id: USER_ID,
      name: "Drink",
      completed_at: T1,
      deleted_at: null,
    });
  });

  it("LWW-guards completion-add when local row is newer", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T2, logger },
    );
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Stale name",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    const rows = listEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Drink",
      updated_at: T2,
      deleted_at: null,
    });
  });

  it("soft-deletes on completion-remove", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" }],
      { userId: USER_ID, clientTs: T2, logger },
    );
    const rows = listEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deleted_at: T2, updated_at: T2 });
  });

  it("LWW-guards completion-remove with stale clientTs", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T2, logger },
    );
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" }],
      { userId: USER_ID, clientTs: T0, logger },
    );
    const rows = listEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deleted_at: null, updated_at: T2 });
  });

  it("habit-rename touches active rows for that habit only", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
        {
          kind: "completion-add",
          habitId: "h2",
          habitName: "Stretch",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "habit-rename",
          habitId: "h1",
          prevName: "Drink",
          nextName: "Drink 2L",
        },
      ],
      { userId: USER_ID, clientTs: T2, logger },
    );
    const rows = listEntries();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("h1:2026-05-01")).toMatchObject({
      name: "Drink 2L",
      updated_at: T2,
    });
    expect(byId.get("h2:2026-05-01")).toMatchObject({
      name: "Stretch",
      updated_at: T1,
    });
  });

  it("counts errors via logger on adapter-internal failure", async () => {
    const failingClient: SqliteMigrationClient = {
      exec: jest.fn(),
      run: jest.fn(async () => {
        throw new Error("boom");
      }),
      all: jest.fn(),
    };
    const result = await applyRoutineDualWriteOps(
      failingClient,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 0, errored: 1, skipped: 0 });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ error: "boom" }),
    );
  });

  // -----------------------------------------------------------------------
  // Stage 10: full-state entity ops
  // -----------------------------------------------------------------------

  describe("Stage 10 ops", () => {
    function listAll<R extends Record<string, unknown>>(table: string): R[] {
      // The sync better-sqlite3 client returns `R[]` directly even though
      // the `SqliteMigrationClient` interface widens to `R[] | Promise<R[]>`
      // for the async expo-sqlite path.
      return client.all<R>(
        `SELECT * FROM ${table} ORDER BY rowid ASC`,
        [],
      ) as R[];
    }

    it("habit-upsert inserts a row in routine_habits", async () => {
      const result = await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "habit-upsert",
            habit: {
              id: "h1",
              name: "Drink water",
              emoji: "💧",
              archived: false,
              paused: false,
              tagIds: ["t1"],
              weekdays: [1, 2, 3, 4, 5],
              createdAt: T0,
            },
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });
      const rows = listAll<{
        id: string;
        name: string;
        emoji: string;
        tag_ids_json: string;
        archived: number;
        weekdays_json: string;
        deleted_at: string | null;
      }>("routine_habits");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "h1",
        name: "Drink water",
        emoji: "💧",
        archived: 0,
        deleted_at: null,
      });
      expect(JSON.parse(rows[0]!.tag_ids_json)).toEqual(["t1"]);
      expect(JSON.parse(rows[0]!.weekdays_json)).toEqual([1, 2, 3, 4, 5]);
    });

    it("habit-upsert is LWW-guarded by updated_at", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "habit-upsert",
            habit: { id: "h1", name: "New name", createdAt: T0 },
          },
        ],
        { userId: USER_ID, clientTs: T2, logger },
      );
      // Stale write — must not overwrite the newer row.
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "habit-upsert",
            habit: { id: "h1", name: "Stale", createdAt: T0 },
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      const rows = listAll<{ name: string; updated_at: string }>(
        "routine_habits",
      );
      expect(rows[0]).toMatchObject({ name: "New name", updated_at: T2 });
    });

    it("habit-delete soft-deletes the row", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "habit-upsert",
            habit: { id: "h1", name: "X", createdAt: T0 },
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      await applyRoutineDualWriteOps(
        client,
        [{ kind: "habit-delete", habitId: "h1" }],
        { userId: USER_ID, clientTs: T2, logger },
      );
      const rows = listAll<{ deleted_at: string | null }>("routine_habits");
      expect(rows[0]).toMatchObject({ deleted_at: T2 });
    });

    it("tag-upsert + tag-delete round-trip", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "tag-upsert",
            tag: { id: "t1", name: "morning", scope: "user" },
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      let rows = listAll<{
        name: string;
        scope: string;
        deleted_at: string | null;
      }>("routine_tags");
      expect(rows[0]).toMatchObject({ name: "morning", scope: "user" });

      await applyRoutineDualWriteOps(
        client,
        [{ kind: "tag-delete", tagId: "t1" }],
        { userId: USER_ID, clientTs: T2, logger },
      );
      rows = listAll<{
        name: string;
        scope: string;
        deleted_at: string | null;
      }>("routine_tags");
      expect(rows[0]?.deleted_at).toBe(T2);
    });

    it("category-upsert writes to routine_categories", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "category-upsert",
            category: { id: "c1", name: "Health", emoji: "🏥" },
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      const rows = listAll<{ name: string; emoji: string }>(
        "routine_categories",
      );
      expect(rows[0]).toMatchObject({ name: "Health", emoji: "🏥" });
    });

    it("prefs-set upserts a single row keyed by user_id", async () => {
      await applyRoutineDualWriteOps(
        client,
        [{ kind: "prefs-set", prefs: { showFizrukInCalendar: true } }],
        { userId: USER_ID, clientTs: T1, logger },
      );
      await applyRoutineDualWriteOps(
        client,
        [{ kind: "prefs-set", prefs: { showFizrukInCalendar: false } }],
        { userId: USER_ID, clientTs: T2, logger },
      );
      const rows = listAll<{ data_json: string }>("routine_prefs");
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.data_json)).toEqual({
        showFizrukInCalendar: false,
      });
    });

    it("pushup-upsert writes per (user, date_key)", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          { kind: "pushup-upsert", dateKey: "2026-05-01", reps: 30 },
          { kind: "pushup-upsert", dateKey: "2026-05-02", reps: 40 },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      const rows = listAll<{ date_key: string; reps: number }>(
        "routine_pushups",
      );
      expect(rows).toHaveLength(2);
      const map = new Map(rows.map((r) => [r.date_key, r.reps]));
      expect(map.get("2026-05-01")).toBe(30);
      expect(map.get("2026-05-02")).toBe(40);
    });

    it("habit-order-set persists JSON array", async () => {
      await applyRoutineDualWriteOps(
        client,
        [{ kind: "habit-order-set", orderedIds: ["h2", "h1", "h3"] }],
        { userId: USER_ID, clientTs: T1, logger },
      );
      const rows = listAll<{ order_json: string }>("routine_habit_order");
      expect(JSON.parse(rows[0]!.order_json)).toEqual(["h2", "h1", "h3"]);
    });

    it("completion-note upsert + delete cycle", async () => {
      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "completion-note-upsert",
            noteKey: "h1__2026-05-01",
            note: "did well",
          },
        ],
        { userId: USER_ID, clientTs: T1, logger },
      );
      let rows = listAll<{ note: string; deleted_at: string | null }>(
        "routine_completion_notes",
      );
      expect(rows[0]).toMatchObject({ note: "did well", deleted_at: null });

      await applyRoutineDualWriteOps(
        client,
        [
          {
            kind: "completion-note-delete",
            noteKey: "h1__2026-05-01",
          },
        ],
        { userId: USER_ID, clientTs: T2, logger },
      );
      rows = listAll<{ note: string; deleted_at: string | null }>(
        "routine_completion_notes",
      );
      expect(rows[0]?.deleted_at).toBe(T2);
    });
  });
});
