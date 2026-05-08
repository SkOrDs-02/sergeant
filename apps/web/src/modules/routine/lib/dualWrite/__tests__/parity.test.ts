import { describe, expect, it } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { probeRoutineParity } from "../parity.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";

function makeStateWithCompletions(completions: Record<string, string[]>) {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: Object.keys(completions).map((id) => ({ id, name: id })),
    completions,
    pushupsByDate: {},
    habitOrder: Object.keys(completions),
    completionNotes: {},
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

describe("probeRoutineParity", () => {
  it("reports match when LS and SQLite agree on the active completion set", async () => {
    const handle = await createTestSqlite();
    try {
      await seedEntries(handle.client, [
        { habitId: "h1", dateKey: "2026-05-01" },
        { habitId: "h1", dateKey: "2026-05-02" },
        { habitId: "h2", dateKey: "2026-05-01" },
      ]);
      const next = makeStateWithCompletions({
        h1: ["2026-05-01", "2026-05-02"],
        h2: ["2026-05-01"],
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 3, sqlite: 3 });
    } finally {
      handle.close();
    }
  });

  it("reports match when both sides are empty", async () => {
    const handle = await createTestSqlite();
    try {
      const next = makeStateWithCompletions({});
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 0, sqlite: 0 });
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
      const next = makeStateWithCompletions({ h1: ["2026-05-01"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 1, sqlite: 1 });
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
      const next = makeStateWithCompletions({
        h1: ["2026-05-01", "2026-05-02"],
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
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
      const next = makeStateWithCompletions({ h1: ["2026-05-01"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
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
      const next = makeStateWithCompletions({ h2: ["2026-05-02"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
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
      // Other user has 5 rows; current user has 1.
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
      const next = makeStateWithCompletions({ h1: ["2026-05-01"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });

  it("rejects malformed SQLite ids without crashing the probe", async () => {
    const handle = await createTestSqlite();
    try {
      // Insert a row whose id has no separator — should be ignored.
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
      const next = makeStateWithCompletions({ h1: ["2026-05-01"] });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 1, sqlite: 1 });
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
      const next = makeStateWithCompletions({
        h1: ["2026-05-01", "not-a-date", ""],
      });
      const out = await probeRoutineParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({ ls: 1, sqlite: 1 });
    } finally {
      handle.close();
    }
  });
});
