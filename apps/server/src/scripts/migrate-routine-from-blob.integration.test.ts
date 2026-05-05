// Integration test for the Routine backfill script.
//
// Stage 2 / PR #020 із `docs/planning/storage-roadmap.md`. Запускає
// `runRoutineBackfill` проти реального Postgres у Testcontainers — там
// застосована продакшн-міграція 026, тож тестуємо саме її shape, а не
// Drizzle-схему. На dev-машинах без Docker тест soft-skip-ається
// (mirroring waitlistService.test.ts).

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type pg from "pg";
import {
  startPgContainer,
  stopPgContainer,
  truncateAll,
} from "../test/pg-container.js";
import { runRoutineBackfill } from "./migrate-routine-from-blob.js";

const HOOK_TIMEOUT_MS = 180_000;

interface RoutineEntryRow {
  user_id: string;
  name: string;
  completed_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface RoutineStreakRow {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_completed_at: Date | null;
}

async function seedUser(
  pool: pg.Pool,
  userId: string,
  email: string,
): Promise<void> {
  await pool.query(`INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`, [
    userId,
    userId,
    email,
  ]);
}

async function seedModuleData(
  pool: pg.Pool,
  userId: string,
  data: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO module_data (user_id, module, data) VALUES ($1, 'routine', $2::jsonb)`,
    [userId, JSON.stringify(data)],
  );
}

describe("runRoutineBackfill (Stage 2 / PR #020)", () => {
  let pool: pg.Pool | undefined;
  let dockerAvailable = false;

  beforeAll(async () => {
    try {
      pool = await startPgContainer();
      dockerAvailable = true;
    } catch (err) {
      console.warn(
        "[migrate-routine-from-blob.integration.test] Docker unavailable — skipping:",
        err instanceof Error ? err.message : err,
      );
    }
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (dockerAvailable) {
      await stopPgContainer();
    }
  }, HOOK_TIMEOUT_MS);

  it("inserts entries + streaks for valid blobs and skips malformed user", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    // Three valid users with progressively richer data.
    await seedUser(pool, "u-alice", "alice@example.com");
    await seedModuleData(pool, "u-alice", {
      routine: {
        habits: [
          { id: "h-water", name: "Drink water", createdAt: "2026-04-29" },
          { id: "h-stretch", name: "Stretch", createdAt: "2026-04-29" },
        ],
        completions: {
          "h-water": ["2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02"],
          "h-stretch": ["2026-04-30", "2026-05-01"],
        },
      },
    });

    await seedUser(pool, "u-bob", "bob@example.com");
    // Top-level shape (no nested `routine` key) — backfill must accept both.
    await seedModuleData(pool, "u-bob", {
      habits: [{ id: "h-read", name: "Read", createdAt: "2026-04-29" }],
      completions: { "h-read": ["2026-05-01", "2026-05-02"] },
    });

    await seedUser(pool, "u-carol", "carol@example.com");
    // Habit with zero completions — must produce a single placeholder row.
    await seedModuleData(pool, "u-carol", {
      routine: {
        habits: [{ id: "h-meditate", name: "Meditate" }],
        completions: {},
      },
    });

    // Malformed user: row exists in module_data but data is not a routine
    // blob (it's an array — top-level shape is wrong).
    await seedUser(pool, "u-mal", "mal@example.com");
    await seedModuleData(pool, "u-mal", ["not", "a", "routine", "blob"]);

    const summary = await runRoutineBackfill(pool, {
      log: () => {
        /* silence */
      },
    });

    expect(summary.usersProcessed).toBe(3);
    expect(summary.usersSkippedMalformed).toBe(1);
    // alice: 4 + 2 = 6, bob: 2, carol: 1 (placeholder) = 9.
    expect(summary.entriesInserted).toBe(9);
    expect(summary.entriesSkippedExisting).toBe(0);
    expect(summary.streaksUpserted).toBe(3);

    const entries = await pool.query<RoutineEntryRow>(
      `SELECT user_id, name, completed_at, created_at, deleted_at
       FROM routine_entries
       ORDER BY user_id, created_at`,
    );
    expect(entries.rowCount).toBe(9);

    const aliceEntries = entries.rows.filter((r) => r.user_id === "u-alice");
    expect(aliceEntries).toHaveLength(6);
    // All alice entries must have completed_at set (no placeholder).
    for (const row of aliceEntries) {
      expect(row.completed_at).not.toBeNull();
      expect(row.deleted_at).toBeNull();
    }

    const carolEntries = entries.rows.filter((r) => r.user_id === "u-carol");
    expect(carolEntries).toHaveLength(1);
    expect(carolEntries[0]!.completed_at).toBeNull();
    expect(carolEntries[0]!.name).toBe("Meditate");

    const streaks = await pool.query<RoutineStreakRow>(
      `SELECT user_id, current_streak, longest_streak, last_completed_at
       FROM routine_streaks ORDER BY user_id`,
    );
    expect(streaks.rowCount).toBe(3);

    const aliceStreak = streaks.rows.find((r) => r.user_id === "u-alice");
    expect(aliceStreak).toBeDefined();
    // Alice union of dates: 2026-04-29, 04-30, 05-01, 05-02 — longest 4.
    expect(aliceStreak!.longest_streak).toBe(4);
    expect(aliceStreak!.last_completed_at).toBeInstanceOf(Date);

    const carolStreak = streaks.rows.find((r) => r.user_id === "u-carol");
    expect(carolStreak).toBeDefined();
    expect(carolStreak!.current_streak).toBe(0);
    expect(carolStreak!.longest_streak).toBe(0);
    expect(carolStreak!.last_completed_at).toBeNull();

    // Malformed user gets neither entries nor a streak row.
    const malEntries = await pool.query(
      `SELECT 1 FROM routine_entries WHERE user_id = 'u-mal'`,
    );
    expect(malEntries.rowCount).toBe(0);
    const malStreaks = await pool.query(
      `SELECT 1 FROM routine_streaks WHERE user_id = 'u-mal'`,
    );
    expect(malStreaks.rowCount).toBe(0);
  });

  it("is idempotent — second run inserts no new rows", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    await seedUser(pool, "u-idem", "idem@example.com");
    await seedModuleData(pool, "u-idem", {
      routine: {
        habits: [{ id: "h-walk", name: "Walk", createdAt: "2026-04-30" }],
        completions: { "h-walk": ["2026-05-01", "2026-05-02"] },
      },
    });

    const first = await runRoutineBackfill(pool, { log: () => undefined });
    expect(first.entriesInserted).toBe(2);
    expect(first.entriesSkippedExisting).toBe(0);

    const second = await runRoutineBackfill(pool, { log: () => undefined });
    expect(second.entriesInserted).toBe(0);
    expect(second.entriesSkippedExisting).toBe(2);
    // Streak upsert always counts (PK upsert by user_id), but should not
    // duplicate the row.
    expect(second.streaksUpserted).toBe(1);

    const totalEntries = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM routine_entries WHERE user_id = 'u-idem'`,
    );
    expect(Number(totalEntries.rows[0]!.count)).toBe(2);

    const totalStreaks = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM routine_streaks WHERE user_id = 'u-idem'`,
    );
    expect(Number(totalStreaks.rows[0]!.count)).toBe(1);
  });

  it("does not write anything when --dry-run is set", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    await seedUser(pool, "u-dry", "dry@example.com");
    await seedModuleData(pool, "u-dry", {
      routine: {
        habits: [
          { id: "h-dry", name: "Dry-run habit", createdAt: "2026-04-29" },
        ],
        completions: { "h-dry": ["2026-05-01"] },
      },
    });

    const summary = await runRoutineBackfill(pool, {
      dryRun: true,
      log: () => undefined,
    });
    expect(summary.usersProcessed).toBe(1);
    expect(summary.entriesInserted).toBe(1);

    const entries = await pool.query(
      `SELECT 1 FROM routine_entries WHERE user_id = 'u-dry'`,
    );
    expect(entries.rowCount).toBe(0);

    const streaks = await pool.query(
      `SELECT 1 FROM routine_streaks WHERE user_id = 'u-dry'`,
    );
    expect(streaks.rowCount).toBe(0);
  });

  it("does NOT modify module_data.data->'routine' (Stage 4 dual-write still relies on it)", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    await seedUser(pool, "u-keep", "keep@example.com");
    const blob = {
      routine: {
        habits: [{ id: "h-x", name: "X", createdAt: "2026-04-29" }],
        completions: { "h-x": ["2026-05-01"] },
      },
    };
    await seedModuleData(pool, "u-keep", blob);

    await runRoutineBackfill(pool, { log: () => undefined });

    const after = await pool.query<{ data: unknown }>(
      `SELECT data FROM module_data WHERE user_id = 'u-keep'`,
    );
    expect(after.rowCount).toBe(1);
    expect(after.rows[0]!.data).toEqual(blob);
  });
});
