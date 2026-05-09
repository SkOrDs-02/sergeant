import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyRoutineDualWriteOps, type DualWriteLogger } from "../adapter.js";
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

const USER_ID = "user-1";
const T1 = "2026-05-01T10:00:00.000+00:00";
const T2 = "2026-05-01T11:00:00.000+00:00";
const T0 = "2026-04-30T09:00:00.000+00:00";

describe("applyRoutineDualWriteOps", () => {
  let handle: Awaited<ReturnType<typeof createTestSqlite>>;
  let client: SqliteMigrationClient;
  let logger: ReturnType<typeof vi.fn<DualWriteLogger>>;

  beforeEach(async () => {
    handle = await createTestSqlite();
    client = handle.client;
    logger = vi.fn();
  });

  afterEach(() => {
    handle.close();
  });

  it("returns zero counters and writes nothing for an empty op list", async () => {
    const result = await applyRoutineDualWriteOps(client, [], {
      userId: USER_ID,
      clientTs: T1,
      logger,
    });
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
    expect(await listEntries(client)).toEqual([]);
    expect(logger).not.toHaveBeenCalled();
  });

  it("upserts a routine_entries row for completion-add", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "h1:2026-05-01",
      user_id: USER_ID,
      name: "Drink water",
      completed_at: T1,
      created_at: T1,
      updated_at: T1,
      deleted_at: null,
    });
  });

  it("is idempotent — replaying the same completion-add yields the same row", async () => {
    const op = [
      {
        kind: "completion-add" as const,
        habitId: "h1",
        habitName: "Drink water",
        dateKey: "2026-05-01",
      },
    ];
    await applyRoutineDualWriteOps(client, op, {
      userId: USER_ID,
      clientTs: T1,
      logger,
    });
    await applyRoutineDualWriteOps(client, op, {
      userId: USER_ID,
      clientTs: T1,
      logger,
    });
    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "h1:2026-05-01", updated_at: T1 });
  });

  it("does NOT regress updated_at on completion-add when local row is newer (LWW)", async () => {
    // First add at T2, then replay at older T1 — local row stays at T2.
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
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
    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Drink water",
      updated_at: T2,
      completed_at: T2,
      deleted_at: null,
    });
  });

  it("soft-deletes a row for completion-remove (deleted_at + updated_at bumped)", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
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

    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "h1:2026-05-01",
      deleted_at: T2,
      updated_at: T2,
    });
  });

  it("LWW-guards completion-remove: stale tombstone does not overwrite fresh row", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T2, logger },
    );
    // Stale remove with clientTs = T0 (older than the local row).
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" }],
      { userId: USER_ID, clientTs: T0, logger },
    );

    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deleted_at: null,
      updated_at: T2,
    });
  });

  it("completion-remove on a non-existent id is a no-op (no error)", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-remove",
          habitId: "missing",
          dateKey: "2026-05-01",
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });
    expect(await listEntries(client)).toEqual([]);
    expect(logger).not.toHaveBeenCalled();
  });

  it("habit-rename updates the name on every active row for that habit", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
          dateKey: "2026-05-01",
        },
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
          dateKey: "2026-05-02",
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
          prevName: "Drink water",
          nextName: "Drink 2L of water",
        },
      ],
      { userId: USER_ID, clientTs: T2, logger },
    );

    const rows = await listEntries(client);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("h1:2026-05-01")).toMatchObject({
      name: "Drink 2L of water",
      updated_at: T2,
    });
    expect(byId.get("h1:2026-05-02")).toMatchObject({
      name: "Drink 2L of water",
      updated_at: T2,
    });
    // h2 untouched.
    expect(byId.get("h2:2026-05-01")).toMatchObject({
      name: "Stretch",
      updated_at: T1,
    });
  });

  it("habit-rename does NOT touch tombstoned rows", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
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
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "habit-rename",
          habitId: "h1",
          prevName: "Drink water",
          nextName: "Drink 2L of water",
        },
      ],
      { userId: USER_ID, clientTs: "2026-05-02T00:00:00.000+00:00", logger },
    );

    const rows = await listEntries(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Drink water", // unchanged — row is tombstoned
      deleted_at: T2,
    });
  });

  it("logs and counts errors but keeps processing remaining ops on failure", async () => {
    const failingClient: SqliteMigrationClient = {
      exec: vi.fn(async () => undefined),
      run: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT")) throw new Error("boom");
        await client.run(sql, []);
      }),
      all: client.all.bind(client) as SqliteMigrationClient["all"],
    };
    const result = await applyRoutineDualWriteOps(
      failingClient,
      [
        {
          kind: "completion-add",
          habitId: "h1",
          habitName: "Drink water",
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
    expect(result).toEqual({ applied: 0, errored: 2, skipped: 0 });
    expect(logger).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ error: "boom" }),
    );
  });

  // -----------------------------------------------------------------------
  // Stage 10: habit-upsert / habit-delete
  // -----------------------------------------------------------------------

  it("upserts a routine_habits row for habit-upsert", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "habit-upsert",
          habit: {
            id: "h1",
            name: "Drink water",
            emoji: "💧",
            tagIds: ["t1"],
            categoryId: "c1",
            archived: false,
            paused: false,
            recurrence: "daily",
          },
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT id, user_id, name, emoji, tag_ids_json, category_id,
              archived, paused, recurrence, deleted_at
         FROM routine_habits WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "h1",
      name: "Drink water",
      emoji: "💧",
      tag_ids_json: '["t1"]',
      category_id: "c1",
      archived: 0,
      paused: 0,
      recurrence: "daily",
      deleted_at: null,
    });
  });

  it("soft-deletes a routine_habits row for habit-delete", async () => {
    await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "habit-upsert",
          habit: { id: "h1", name: "Drink water" },
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    const result = await applyRoutineDualWriteOps(
      client,
      [{ kind: "habit-delete", habitId: "h1" }],
      { userId: USER_ID, clientTs: T2, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT deleted_at FROM routine_habits WHERE id = ?`,
      ["h1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBe(T2);
  });

  // -----------------------------------------------------------------------
  // Stage 10: tag-upsert / tag-delete
  // -----------------------------------------------------------------------

  it("upserts a routine_tags row for tag-upsert", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [{ kind: "tag-upsert", tag: { id: "t1", name: "morning" } }],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT id, name, scope, deleted_at FROM routine_tags WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "t1",
      name: "morning",
      scope: "",
      deleted_at: null,
    });
  });

  it("soft-deletes a routine_tags row for tag-delete", async () => {
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "tag-upsert", tag: { id: "t1", name: "morning" } }],
      { userId: USER_ID, clientTs: T1, logger },
    );
    await applyRoutineDualWriteOps(
      client,
      [{ kind: "tag-delete", tagId: "t1" }],
      { userId: USER_ID, clientTs: T2, logger },
    );

    const rows = await client.all<Record<string, unknown>>(
      `SELECT deleted_at FROM routine_tags WHERE id = ?`,
      ["t1"],
    );
    expect(rows[0]!.deleted_at).toBe(T2);
  });

  // -----------------------------------------------------------------------
  // Stage 10: category-upsert / category-delete
  // -----------------------------------------------------------------------

  it("upserts a routine_categories row for category-upsert", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "category-upsert",
          category: { id: "c1", name: "Health", emoji: "🏥" },
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT id, name, emoji, deleted_at FROM routine_categories WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "c1",
      name: "Health",
      emoji: "🏥",
      deleted_at: null,
    });
  });

  // -----------------------------------------------------------------------
  // Stage 10: prefs-set
  // -----------------------------------------------------------------------

  it("upserts routine_prefs for prefs-set", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [
        {
          kind: "prefs-set",
          prefs: { showFizrukInCalendar: true },
        },
      ],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT data_json FROM routine_prefs WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.data_json as string)).toEqual({
      showFizrukInCalendar: true,
    });
  });

  // -----------------------------------------------------------------------
  // Stage 10: pushup-upsert
  // -----------------------------------------------------------------------

  it("upserts routine_pushups for pushup-upsert", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [{ kind: "pushup-upsert", dateKey: "2026-05-01", reps: 30 }],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT date_key, reps FROM routine_pushups WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date_key: "2026-05-01", reps: 30 });
  });

  // -----------------------------------------------------------------------
  // Stage 10: habit-order-set
  // -----------------------------------------------------------------------

  it("upserts routine_habit_order for habit-order-set", async () => {
    const result = await applyRoutineDualWriteOps(
      client,
      [{ kind: "habit-order-set", orderedIds: ["h2", "h1"] }],
      { userId: USER_ID, clientTs: T1, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT order_json FROM routine_habit_order WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.order_json as string)).toEqual(["h2", "h1"]);
  });

  // -----------------------------------------------------------------------
  // Stage 10: completion-note-upsert / completion-note-delete
  // -----------------------------------------------------------------------

  it("upserts routine_completion_notes for completion-note-upsert", async () => {
    const result = await applyRoutineDualWriteOps(
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
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT note_key, note, deleted_at FROM routine_completion_notes WHERE user_id = ?`,
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      note_key: "h1__2026-05-01",
      note: "did well",
      deleted_at: null,
    });
  });

  it("soft-deletes a routine_completion_notes row for completion-note-delete", async () => {
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
    const result = await applyRoutineDualWriteOps(
      client,
      [{ kind: "completion-note-delete", noteKey: "h1__2026-05-01" }],
      { userId: USER_ID, clientTs: T2, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 0 });

    const rows = await client.all<Record<string, unknown>>(
      `SELECT deleted_at FROM routine_completion_notes
       WHERE user_id = ? AND note_key = ?`,
      [USER_ID, "h1__2026-05-01"],
    );
    expect(rows[0]!.deleted_at).toBe(T2);
  });
});
