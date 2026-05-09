import { describe, expect, it } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { RoutineState } from "@sergeant/routine-domain";

import { probeRoutineParity } from "../parity.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";

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

async function seedEntries(
  client: SqliteMigrationClient,
  rows: { habitId: string; dateKey: string; deletedAt?: string | null }[],
): Promise<void> {
  for (const r of rows) {
    await client.run(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${r.habitId}:${r.dateKey}`,
        USER_ID,
        r.habitId,
        `${r.dateKey}T00:00:00.000Z`,
        `${r.dateKey}T00:00:00.000Z`,
        `${r.dateKey}T00:00:00.000Z`,
        r.deletedAt ?? null,
      ],
    );
  }
}

async function seedHabits(
  client: SqliteMigrationClient,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    await client.run(
      `INSERT INTO routine_habits
         (id, user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, USER_ID, id, "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"],
    );
  }
}

async function seedTags(
  client: SqliteMigrationClient,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    await client.run(
      `INSERT INTO routine_tags
         (id, user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, USER_ID, id, "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"],
    );
  }
}

async function seedCategories(
  client: SqliteMigrationClient,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    await client.run(
      `INSERT INTO routine_categories
         (id, user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, USER_ID, id, "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"],
    );
  }
}

// -----------------------------------------------------------------------
// Completions parity (legacy — routine_entries)
// -----------------------------------------------------------------------

describe("probeRoutineParity", () => {
  it("reports match when LS and SQLite agree on the active completion set", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
        { habitId: "h1", dateKey: "2026-05-02" },
        { habitId: "h2", dateKey: "2026-05-01" },
      ]);
      const next = makeState({
        completions: {
          h1: ["2026-05-01", "2026-05-02"],
          h2: ["2026-05-01"],
        },
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 3, sqlite: 3 });
    } finally {
      handle.close();
    }
  });

  it("reports match when both sides are empty", async () => {
    const handle = await createTestSqlite();
    try {
      const next = makeState();
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 0, sqlite: 0 });
    } finally {
      handle.close();
    }
  });

  it("ignores soft-deleted SQLite rows in the parity comparison", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
        {
          habitId: "h1",
          dateKey: "2026-05-02",
          deletedAt: "2026-05-02T10:00:00.000Z",
        },
      ]);
      const next = makeState({ completions: { h1: ["2026-05-01"] } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with lsOnly count when SQLite is missing rows", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
      ]);
      const next = makeState({
        completions: { h1: ["2026-05-01", "2026-05-02"] },
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details.completions).toEqual({
        ls: 2,
        sqlite: 1,
        lsOnly: 1,
        sqliteOnly: 0,
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with sqliteOnly count when SQLite has stale rows", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
        { habitId: "h1", dateKey: "2026-05-02" },
        { habitId: "h2", dateKey: "2026-05-03" },
      ]);
      const next = makeState({ completions: { h1: ["2026-05-01"] } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details.completions).toEqual({
        ls: 1,
        sqlite: 3,
        lsOnly: 0,
        sqliteOnly: 2,
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with both lsOnly and sqliteOnly when sets diverge symmetrically", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
      ]);
      const next = makeState({ completions: { h2: ["2026-05-02"] } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details.completions).toEqual({
        ls: 1,
        sqlite: 1,
        lsOnly: 1,
        sqliteOnly: 1,
      });
    } finally {
      handle.close();
    }
  });

  it("scopes the read to user_id so other users' rows don't leak in", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_entries
           (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, 'user-2', 'X', '2026-05-01T00:00:00.000Z',
                 '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL)`,
        ["other-h:2026-05-01"],
      );
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
      ]);
      const next = makeState({ completions: { h1: ["2026-05-01"] } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  it("rejects malformed SQLite ids without crashing the probe", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_entries
           (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'X', '2026-05-01T00:00:00.000Z',
                 '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL)`,
        ["no-sep-id", USER_ID],
      );
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
      ]);
      const next = makeState({ completions: { h1: ["2026-05-01"] } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  it("rejects malformed dateKey values in next.completions", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
      ]);
      const next = makeState({
        completions: {
          h1: ["2026-05-01", "not-a-date", ""],
        },
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.completions).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  // -----------------------------------------------------------------------
  // Stage 10: habits / tags / categories parity (id-set)
  // -----------------------------------------------------------------------

  it("reports match for habits when LS and SQLite id-sets agree", async () => {
    const handle = await createTestSqlite();
    try {
      await seedHabits(handle.client, ["h1", "h2"]);
      const next = makeState({
        habits: [
          { id: "h1", name: "Drink water" },
          { id: "h2", name: "Stretch" },
        ],
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.habits).toEqual({ ls: 2, sqlite: 2 });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch for habits when LS has ids not in SQLite", async () => {
    const handle = await createTestSqlite();
    try {
      await seedHabits(handle.client, ["h1"]);
      const next = makeState({
        habits: [
          { id: "h1", name: "Drink water" },
          { id: "h2", name: "Stretch" },
        ],
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details.habits).toEqual({
        ls: 2,
        sqlite: 1,
        lsOnly: 1,
        sqliteOnly: 0,
      });
    } finally {
      handle.close();
    }
  });

  it("reports match for tags", async () => {
    const handle = await createTestSqlite();
    try {
      await seedTags(handle.client, ["t1"]);
      const next = makeState({ tags: [{ id: "t1", name: "morning" }] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.tags).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  it("reports match for categories", async () => {
    const handle = await createTestSqlite();
    try {
      await seedCategories(handle.client, ["c1"]);
      const next = makeState({ categories: [{ id: "c1", name: "Health" }] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.categories).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  // -----------------------------------------------------------------------
  // Stage 10: prefs parity (JSON blob)
  // -----------------------------------------------------------------------

  it("reports match for prefs when JSON blobs are equal", async () => {
    const handle = await createTestSqlite();
    try {
      const prefs = { showFizrukInCalendar: true };
      await handle.client.run(
        `INSERT INTO routine_prefs (user_id, data_json, updated_at)
         VALUES (?, ?, ?)`,
        [USER_ID, JSON.stringify(prefs), "2026-05-01T00:00:00.000Z"],
      );
      const next = makeState({ prefs });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.prefs).toEqual({ equal: true });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch for prefs when JSON blobs differ", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_prefs (user_id, data_json, updated_at)
         VALUES (?, ?, ?)`,
        [USER_ID, "{}", "2026-05-01T00:00:00.000Z"],
      );
      const next = makeState({
        prefs: { showFizrukInCalendar: true },
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details.prefs).toMatchObject({ lsLen: expect.any(Number) });
    } finally {
      handle.close();
    }
  });

  // -----------------------------------------------------------------------
  // Stage 10: pushups parity (date-key + reps)
  // -----------------------------------------------------------------------

  it("reports match for pushups when date-key sets agree", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_pushups (user_id, date_key, reps, updated_at)
         VALUES (?, ?, ?, ?)`,
        [USER_ID, "2026-05-01", 30, "2026-05-01T00:00:00.000Z"],
      );
      const next = makeState({ pushupsByDate: { "2026-05-01": 30 } });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.pushups).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  // -----------------------------------------------------------------------
  // Stage 10: habit-order parity (JSON array)
  // -----------------------------------------------------------------------

  it("reports match for habit order when JSON arrays are equal", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_habit_order (user_id, order_json, updated_at)
         VALUES (?, ?, ?)`,
        [USER_ID, '["h1","h2"]', "2026-05-01T00:00:00.000Z"],
      );
      const next = makeState({ habitOrder: ["h1", "h2"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.order).toEqual({ equal: true });
    } finally {
      handle.close();
    }
  });

  // -----------------------------------------------------------------------
  // Stage 10: completion-notes parity (note-key set)
  // -----------------------------------------------------------------------

  it("reports match for completion notes when note-key sets agree", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO routine_completion_notes
           (user_id, note_key, note, updated_at)
         VALUES (?, ?, ?, ?)`,
        [USER_ID, "h1__2026-05-01", "did well", "2026-05-01T00:00:00.000Z"],
      );
      const next = makeState({
        completionNotes: { "h1__2026-05-01": "did well" },
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details.notes).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });
});
