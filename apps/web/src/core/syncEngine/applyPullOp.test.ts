import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  NUTRITION_CLIENT_MIGRATIONS,
  ROUTINE_CLIENT_MIGRATIONS,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

import {
  applyPullOp,
  __resetApplyPullOpCachesForTests,
} from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

describe("syncOpCursor", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("defaults pull_since to 0 and persists updates", async () => {
    expect(await readPullSinceCursor(client)).toBe(0);
    await writePullSinceCursor(client, 42);
    expect(await readPullSinceCursor(client)).toBe(42);
  });
});

describe("applyPullOp", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("applies a newer routine_entries upsert and skips stale replay", async () => {
    const userId = "user-1";
    const deviceB = "device-b";

    const baseOp = {
      id: 10,
      table: "routine_entries",
      op: "insert" as const,
      row: {
        id: "habit1:2026-07-10",
        user_id: userId,
        name: "Run",
        completed_at: "2026-07-10T08:00:00.000Z",
        created_at: "2026-07-10T08:00:00.000Z",
        deleted_at: null,
      },
      client_ts: "2026-07-10T08:00:00.000Z",
      server_ts: "2026-07-10T08:00:01.000Z",
      origin_device_id: deviceB,
    };

    expect(await applyPullOp(client, baseOp, userId, "device-a")).toBe(
      "applied",
    );

    const stale = {
      ...baseOp,
      id: 11,
      client_ts: "2026-07-10T07:00:00.000Z",
      row: { ...baseOp.row, name: "Stale" },
    };
    expect(await applyPullOp(client, stale, userId, "device-a")).toBe(
      "skipped",
    );

    const rows = await client.all<{ name: string }>(
      `SELECT name FROM routine_entries WHERE id = ?`,
      ["habit1:2026-07-10"],
    );
    expect(rows[0]?.name).toBe("Run");
  });

  it("routine_completion_events — insert-only append-шлях (W1-ROUTINE-APPEND)", async () => {
    const userId = "user-1";
    const base = {
      id: 90,
      table: "routine_completion_events",
      op: "insert" as const,
      row: {
        id: "habit1|2026-07-10|2026-07-10T08:00:00.000Z|done|device-b",
        user_id: userId,
        habit_id: "habit1",
        date_key: "2026-07-10",
        state: "done",
        occurred_at: "2026-07-10T08:00:00.000Z",
        tz_offset_min: 180,
        day_anchor: "device-local",
        source: "ui",
        device_id: "device-b",
        created_at: "2026-07-10T08:00:00.000Z",
      },
      client_ts: "2026-07-10T08:00:00.000Z",
      server_ts: "2026-07-10T08:00:01.000Z",
      origin_device_id: "device-b",
    };

    expect(await applyPullOp(client, base, userId, "device-a")).toBe("applied");

    // Повторна доставка тієї самої події — `skipped`, не помилка:
    // `id` детермінований, тож дублікати нормальні.
    expect(
      await applyPullOp(client, { ...base, id: 91 }, userId, "device-a"),
    ).toBe("skipped");

    // update / delete не існують для журналу — сервер такі ops відхиляє
    // (`append_only_violation`), клієнт теж не застосовує.
    for (const op of ["update", "delete"] as const) {
      expect(
        await applyPullOp(client, { ...base, id: 92, op }, userId, "device-a"),
      ).toBe("rejected");
    }

    // Чужий user_id / бита форма — rejected.
    expect(
      await applyPullOp(client, { ...base, id: 93 }, "other-user", "device-a"),
    ).toBe("rejected");
    expect(
      await applyPullOp(
        client,
        { ...base, id: 94, row: { ...base.row, habit_id: 42 } },
        userId,
        "device-a",
      ),
    ).toBe("rejected");

    const rows = await client.all<{
      habit_id: string;
      date_key: string;
      state: string;
      day_anchor: string;
      device_id: string;
    }>(`SELECT * FROM routine_completion_events`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      habit_id: "habit1",
      date_key: "2026-07-10",
      state: "done",
      day_anchor: "device-local",
      device_id: "device-b",
    });
  });

  it("skips echo ops from the same origin device", async () => {
    const deviceA = "device-a";
    const outcome = await applyPullOp(
      client,
      {
        id: 1,
        table: "routine_entries",
        op: "insert",
        row: {
          id: "x",
          user_id: "u1",
          name: "Echo",
          completed_at: null,
          created_at: "2026-07-10T08:00:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: deviceA,
      },
      "u1",
      deviceA,
    );
    expect(outcome).toBe("skipped");
  });

  it("rejects unsupported tables and applies when origin_device_id is null", async () => {
    expect(
      await applyPullOp(
        client,
        {
          id: 1,
          table: "sync_op_outbox",
          op: "insert",
          row: { user_id: "u1" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: null,
        },
        "u1",
        "device-a",
      ),
    ).toBe("rejected");

    expect(
      await applyPullOp(
        client,
        {
          id: 2,
          table: "routine_entries",
          op: "insert",
          row: {
            id: "null-origin",
            user_id: "u1",
            name: "From server",
            completed_at: null,
            created_at: "2026-07-10T08:00:00.000Z",
            deleted_at: null,
          },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: null,
        },
        "u1",
        "device-a",
      ),
    ).toBe("applied");
  });

  it("rejects routine_entries when id or user_id is invalid", async () => {
    expect(
      await applyPullOp(
        client,
        {
          id: 3,
          table: "routine_entries",
          op: "insert",
          row: {
            id: 42,
            user_id: "u1",
            name: "Bad id type",
          },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        "u1",
        "device-a",
      ),
    ).toBe("rejected");

    expect(
      await applyPullOp(
        client,
        {
          id: 4,
          table: "routine_entries",
          op: "insert",
          row: {
            id: "habit1",
            user_id: "other-user",
            name: "Wrong user",
          },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        "u1",
        "device-a",
      ),
    ).toBe("rejected");
  });

  it("soft-deletes routine_entries and skips delete when row is missing", async () => {
    const userId = "u-del";
    const rowId = "habit-del:2026-07-10";
    const ts = "2026-07-10T10:00:00.000Z";

    await applyPullOp(
      client,
      {
        id: 5,
        table: "routine_entries",
        op: "insert",
        row: {
          id: rowId,
          user_id: userId,
          name: "To delete",
          completed_at: null,
          created_at: ts,
          deleted_at: null,
        },
        client_ts: ts,
        server_ts: ts,
        origin_device_id: "device-b",
      },
      userId,
      "device-a",
    );

    expect(
      await applyPullOp(
        client,
        {
          id: 6,
          table: "routine_entries",
          op: "delete",
          row: { id: rowId, user_id: userId },
          client_ts: "2026-07-10T11:00:00.000Z",
          server_ts: "2026-07-10T11:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    const deleted = await client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM routine_entries WHERE id = ?`,
      [rowId],
    );
    expect(deleted[0]?.deleted_at).toBe("2026-07-10T11:00:00.000Z");

    expect(
      await applyPullOp(
        client,
        {
          id: 7,
          table: "routine_entries",
          op: "delete",
          row: { id: "missing-row", user_id: userId },
          client_ts: "2026-07-10T12:00:00.000Z",
          server_ts: "2026-07-10T12:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("skipped");
  });

  // audit E-1: PK `routine_entries` детермінований (`habitId:dateKey`), тож
  // локальний tombstone НЕ має блокувати повторний чекін того самого дня.
  it("resurrects locally soft-deleted routine_entries on a newer op", async () => {
    const userId = "u-tomb";
    const rowId = "habit-tomb:2026-07-10";
    const deletedTs = "2026-07-10T09:00:00.000Z";

    await client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [rowId, userId, "Gone", deletedTs, deletedTs, deletedTs],
    );

    expect(
      await applyPullOp(
        client,
        {
          id: 8,
          table: "routine_entries",
          op: "update",
          row: {
            id: rowId,
            user_id: userId,
            name: "Revive attempt",
            completed_at: "2026-07-10T10:00:00.000Z",
            created_at: deletedTs,
            deleted_at: null,
          },
          client_ts: "2026-07-10T10:00:00.000Z",
          server_ts: "2026-07-10T10:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    const revived = await client.all<{
      name: string;
      completed_at: string | null;
      deleted_at: string | null;
    }>(
      `SELECT name, completed_at, deleted_at FROM routine_entries WHERE id = ?`,
      [rowId],
    );
    expect(revived[0]).toMatchObject({
      name: "Revive attempt",
      completed_at: "2026-07-10T10:00:00.000Z",
      deleted_at: null,
    });
  });

  // Контр-кейс: stale pull проти tombstone-у і далі скіпається (isStaleLocal).
  it("skips stale ops against locally soft-deleted routine_entries", async () => {
    const userId = "u-tomb-stale";
    const rowId = "habit-tomb-stale:2026-07-10";
    const deletedTs = "2026-07-10T09:00:00.000Z";

    await client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [rowId, userId, "Gone", deletedTs, deletedTs, deletedTs],
    );

    expect(
      await applyPullOp(
        client,
        {
          id: 81,
          table: "routine_entries",
          op: "update",
          row: {
            id: rowId,
            user_id: userId,
            name: "Stale revive",
            completed_at: null,
            created_at: deletedTs,
            deleted_at: null,
          },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("skipped");

    const stillDeleted = await client.all<{
      name: string;
      deleted_at: string | null;
    }>(`SELECT name, deleted_at FROM routine_entries WHERE id = ?`, [rowId]);
    expect(stillDeleted[0]).toMatchObject({
      name: "Gone",
      deleted_at: deletedTs,
    });
  });

  it("covers routine_streaks increment, delete, and upsert branches", async () => {
    const userId = "u-streak";

    expect(
      await applyPullOp(
        client,
        {
          id: 9,
          table: "routine_streaks",
          op: "increment",
          row: { user_id: userId, delta: 2.5 },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("rejected");

    expect(
      await applyPullOp(
        client,
        {
          id: 10,
          table: "routine_streaks",
          op: "increment",
          row: { user_id: userId, delta: 3 },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    let streak = await client.all<{
      current_streak: number;
      longest_streak: number;
    }>(
      `SELECT current_streak, longest_streak FROM routine_streaks WHERE user_id = ?`,
      [userId],
    );
    expect(streak[0]).toEqual({ current_streak: 3, longest_streak: 3 });

    expect(
      await applyPullOp(
        client,
        {
          id: 11,
          table: "routine_streaks",
          op: "increment",
          row: { user_id: userId, delta: 2 },
          client_ts: "2026-07-10T09:00:00.000Z",
          server_ts: "2026-07-10T09:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    streak = await client.all<{
      current_streak: number;
      longest_streak: number;
    }>(
      `SELECT current_streak, longest_streak FROM routine_streaks WHERE user_id = ?`,
      [userId],
    );
    expect(streak[0]).toEqual({ current_streak: 5, longest_streak: 5 });

    expect(
      await applyPullOp(
        client,
        {
          id: 12,
          table: "routine_streaks",
          op: "insert",
          row: {
            user_id: "other",
            current_streak: 1,
            longest_streak: 1,
          },
          client_ts: "2026-07-10T10:00:00.000Z",
          server_ts: "2026-07-10T10:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("rejected");

    expect(
      await applyPullOp(
        client,
        {
          id: 13,
          table: "routine_streaks",
          op: "delete",
          row: { user_id: userId },
          client_ts: "2026-07-10T11:00:00.000Z",
          server_ts: "2026-07-10T11:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    streak = await client.all(
      `SELECT user_id FROM routine_streaks WHERE user_id = ?`,
      [userId],
    );
    expect(streak).toHaveLength(0);
  });

  it("applies generic registry rows via routine_habits and routine_tags", async () => {
    const userId = "u-generic";
    const habitId = "habit-generic-1";

    expect(
      await applyPullOp(
        client,
        {
          id: 14,
          table: "routine_habits",
          op: "insert",
          row: {
            id: habitId,
            user_id: userId,
            name: "Meditate",
            archived: true,
            tag_ids_json: ["t1"],
          },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    const habit = await client.all<{ name: string; archived: number }>(
      `SELECT name, archived FROM routine_habits WHERE id = ?`,
      [habitId],
    );
    expect(habit[0]?.name).toBe("Meditate");
    expect(habit[0]?.archived).toBe(1);

    expect(
      await applyPullOp(
        client,
        {
          id: 15,
          table: "routine_habits",
          op: "update",
          row: {
            id: habitId,
            user_id: userId,
            name: "Stale habit",
          },
          client_ts: "2026-07-10T07:00:00.000Z",
          server_ts: "2026-07-10T07:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("skipped");

    expect(
      await applyPullOp(
        client,
        {
          id: 16,
          table: "routine_habits",
          op: "delete",
          row: { id: habitId, user_id: userId },
          client_ts: "2026-07-10T09:00:00.000Z",
          server_ts: "2026-07-10T09:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    const tagId = "tag-1";
    expect(
      await applyPullOp(
        client,
        {
          id: 17,
          table: "routine_tags",
          op: "insert",
          row: {
            id: tagId,
            user_id: userId,
            name: "Health",
            scope: "habit",
          },
          client_ts: "2026-07-10T08:30:00.000Z",
          server_ts: "2026-07-10T08:30:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");

    expect(
      await applyPullOp(
        client,
        {
          id: 18,
          table: "routine_tags",
          op: "insert",
          row: {
            id: tagId,
            user_id: "wrong-user",
            name: "Rejected",
          },
          client_ts: "2026-07-10T08:40:00.000Z",
          server_ts: "2026-07-10T08:40:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("rejected");

    expect(
      await applyPullOp(
        client,
        {
          id: 19,
          table: "routine_tags",
          op: "insert",
          row: {
            user_id: userId,
            name: "Missing id pk",
          },
          client_ts: "2026-07-10T08:50:00.000Z",
          server_ts: "2026-07-10T08:50:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("rejected");
  });

  it("scopes the LWW lookup by user_id so another partition's row cannot block or be tombstoned", async () => {
    // Regression: `routine_habits` (like most module tables) keys on `id`
    // alone, and on the kvvfs fallback every partition shares one physical
    // store. The unscoped lookup made the anonymous→profile handoff read
    // its OWN source row as the LWW comparand, return "skipped", and then
    // delete that row during cleanup — the data survived only on the
    // server (browser QA 2026-08-06).
    const sharedId = "habit-shared-pk";
    const ts = "2026-07-10T08:00:00.000Z";

    await applyPullOp(
      client,
      {
        id: 30,
        table: "routine_habits",
        op: "insert",
        row: { id: sharedId, user_id: "u-owner", name: "Owner habit" },
        client_ts: ts,
        server_ts: ts,
        origin_device_id: "device-b",
      },
      "u-owner",
      "device-a",
    );

    // Same primary key, same timestamp, different user — must still apply.
    expect(
      await applyPullOp(
        client,
        {
          id: 31,
          table: "routine_habits",
          op: "insert",
          row: { id: sharedId, user_id: "u-other", name: "Other habit" },
          client_ts: ts,
          server_ts: ts,
          origin_device_id: "device-b",
        },
        "u-other",
        "device-a",
      ),
    ).toBe("applied");

    // A delete from one partition must not tombstone the other's row.
    await applyPullOp(
      client,
      {
        id: 32,
        table: "routine_habits",
        op: "delete",
        row: { id: sharedId, user_id: "u-other" },
        client_ts: "2026-07-10T09:00:00.000Z",
        server_ts: "2026-07-10T09:00:00.000Z",
        origin_device_id: "device-b",
      },
      "u-other",
      "device-a",
    );

    const owner = await client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM routine_habits WHERE id = ? AND user_id = ?`,
      [sharedId, "u-owner"],
    );
    expect(owner[0]?.deleted_at ?? null).toBeNull();
  });

  it("rejects generic delete on tables without deleted_at and reuses pragma caches", async () => {
    const userId = "u-prefs";

    expect(
      await applyPullOp(
        client,
        {
          id: 20,
          table: "routine_prefs",
          op: "delete",
          row: { user_id: userId },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("rejected");

    await applyPullOp(
      client,
      {
        id: 21,
        table: "routine_prefs",
        op: "insert",
        row: { user_id: userId, data_json: '{"theme":"dark"}' },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: "device-b",
      },
      userId,
      "device-a",
    );

    expect(
      await applyPullOp(
        client,
        {
          id: 22,
          table: "routine_prefs",
          op: "update",
          row: { user_id: userId, data_json: '{"theme":"light"}' },
          client_ts: "2026-07-10T09:00:00.000Z",
          server_ts: "2026-07-10T09:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");
  });

  it("treats non-finite local updated_at as not stale", async () => {
    const userId = "u-bad-ts";
    const rowId = "habit-bad-ts";

    await client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL)`,
      [rowId, userId, "Old", "2026-07-10T08:00:00.000Z", "not-a-date"],
    );

    expect(
      await applyPullOp(
        client,
        {
          id: 23,
          table: "routine_entries",
          op: "update",
          row: {
            id: rowId,
            user_id: userId,
            name: "Fresh name",
            completed_at: null,
            created_at: "2026-07-10T08:00:00.000Z",
            deleted_at: null,
          },
          client_ts: "2026-07-10T09:00:00.000Z",
          server_ts: "2026-07-10T09:00:00.000Z",
          origin_device_id: "device-b",
        },
        userId,
        "device-a",
      ),
    ).toBe("applied");
  });
});

/**
 * Append-only pull-шлях журналу цілей КБЖВ (W1-KBJU-APPEND, стадія 1).
 *
 * Головне, що доводить цей блок: генеричний шлях (`ON CONFLICT DO UPDATE`)
 * НЕ застосовується до журналу. Для LWW-таблиці перезапис — норма; для
 * журналу намірів це стирання історії: сходинка, яка вже описала минулий
 * тиждень, заднім числом стала б іншою.
 */
describe("applyPullOp — nutrition_goal_periods (W1-KBJU-APPEND стадія 1)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  const userId = "user-1";
  const PERIOD_ID = "gp::2026-07-25::1800:140:55:180:2500::device-b";

  function pullOp(over: Record<string, unknown> = {}) {
    return {
      id: 200,
      table: "nutrition_goal_periods",
      op: "insert" as const,
      row: {
        id: PERIOD_ID,
        user_id: userId,
        effective_from: "2026-07-25",
        kcal: 1800,
        protein_g: 140,
        fat_g: 55,
        carbs_g: 180,
        water_ml: 2500,
        origin: "manual",
        created_at: "2026-07-25T07:00:00.000Z",
        deleted_at: null,
      },
      client_ts: "2026-07-25T08:00:00.000Z",
      server_ts: "2026-07-25T08:00:01.000Z",
      origin_device_id: "device-b",
      ...over,
    };
  }

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: NUTRITION_CLIENT_MIGRATIONS,
      tableName: "__nutrition_migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("вставляє сходинку з чужого пристрою", async () => {
    expect(await applyPullOp(client, pullOp(), userId, "device-a")).toBe(
      "applied",
    );
    const rows = await client.all<{ effective_from: string; kcal: number }>(
      `SELECT effective_from, kcal FROM nutrition_goal_periods WHERE id = ?`,
      [PERIOD_ID],
    );
    expect(rows[0]).toMatchObject({ effective_from: "2026-07-25", kcal: 1800 });
  });

  it("повторна доставка — skipped, тіло НЕ переписується", async () => {
    // Ось де генеричний шлях зробив би `DO UPDATE` і поміняв би 1800 на
    // 240 у вже записаній сходинці.
    await applyPullOp(client, pullOp(), userId, "device-a");
    expect(
      await applyPullOp(
        client,
        pullOp({ id: 201, row: { ...pullOp().row, kcal: 240 } }),
        userId,
        "device-a",
      ),
    ).toBe("skipped");
    const rows = await client.all<{ kcal: number }>(
      `SELECT kcal FROM nutrition_goal_periods WHERE id = ?`,
      [PERIOD_ID],
    );
    expect(rows[0]!.kcal).toBe(1800);
  });

  it("op='update' відхиляється — історія не редагується", async () => {
    expect(
      await applyPullOp(client, pullOp({ op: "update" }), userId, "device-a"),
    ).toBe("rejected");
  });

  it("op='delete' ставить лише tombstone", async () => {
    await applyPullOp(client, pullOp(), userId, "device-a");
    expect(
      await applyPullOp(
        client,
        pullOp({ id: 202, op: "delete" }),
        userId,
        "device-a",
      ),
    ).toBe("applied");
    const rows = await client.all<{ kcal: number; deleted_at: string | null }>(
      `SELECT kcal, deleted_at FROM nutrition_goal_periods WHERE id = ?`,
      [PERIOD_ID],
    );
    // Рядок на місці, тіло ціле — прибрано лише з поля зору резолвера.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kcal).toBe(1800);
    expect(rows[0]!.deleted_at).not.toBeNull();
  });

  it("відхиляє чужий user_id і ISO-instant замість day key", async () => {
    expect(await applyPullOp(client, pullOp(), "other-user", "device-a")).toBe(
      "rejected",
    );
    expect(
      await applyPullOp(
        client,
        pullOp({
          id: 203,
          row: { ...pullOp().row, effective_from: "2026-07-25T08:00:00.000Z" },
        }),
        userId,
        "device-a",
      ),
    ).toBe("rejected");
  });

  it("null-цілі приїжджають як null, а не як 0", async () => {
    await applyPullOp(
      client,
      pullOp({ row: { ...pullOp().row, kcal: null, protein_g: null } }),
      userId,
      "device-a",
    );
    const rows = await client.all<{ kcal: number | null }>(
      `SELECT kcal, protein_g FROM nutrition_goal_periods WHERE id = ?`,
      [PERIOD_ID],
    );
    expect(rows[0]!.kcal).toBeNull();
  });
});
