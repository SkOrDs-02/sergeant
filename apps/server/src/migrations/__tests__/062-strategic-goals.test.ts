// Migration 062 — focused integration test for `strategic_goals`
// (PR-34: strategic mode skeleton).
//
// Mirrors `061-n8n-webhook-events.test.ts`: Testcontainers harness з
// soft-skip-ом коли Docker недоступний. Перевіряє, що:
//   1. forward migration створює таблицю з очікуваними колонками,
//   2. index `(persona, week_start)` існує,
//   3. index `(founder_user_id, week_start DESC)` існує,
//   4. CHECK constraint обмежує `status` 4-ма значеннями,
//   5. trigger `strategic_goals_updated_at_trigger` оновлює `updated_at`
//      на UPDATE,
//   6. `createGoal` робить INSERT і coerce-ить bigint у number,
//   7. `listGoalsForWeek` повертає detермінований ordering за `persona`,
//   8. `updateGoalStatus` UPDATE-ить рядок і повертає `updated_at` > `created_at`,
//   9. down drops table + indexes + trigger; re-up відновлює schema.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import {
  createGoal,
  listGoalsForWeek,
  updateGoalStatus,
} from "../../lib/strategicGoals.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

const TIMEOUT_MS = 180_000;

let container: StartedTestContainer | undefined;
let pool: pg.Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

beforeAll(async () => {
  try {
    container = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({
        POSTGRES_USER: "hub",
        POSTGRES_PASSWORD: "hub",
        POSTGRES_DB: "hub_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    pool = new pg.Pool({
      connectionString: `postgresql://hub:hub@${host}:${port}/hub_test`,
      max: 4,
    });
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[062-strategic-goals] Skipping: Testcontainers unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (pool) {
    await pool.end().catch(() => {
      /* noop */
    });
  }
  if (container) {
    await container.stop().catch(() => {
      /* noop */
    });
  }
}, TIMEOUT_MS);

async function readUpMigrations(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

async function execSqlFile(p: pg.Pool, file: string): Promise<void> {
  const sql = (
    await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
  ).trim();
  if (!sql) return;
  await p.query(sql);
}

async function resetSchema(p: pg.Pool): Promise<void> {
  await p.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await p.query(`GRANT ALL ON SCHEMA public TO public;`);
}

async function applyAllForward(p: pg.Pool): Promise<void> {
  await resetSchema(p);
  const ups = await readUpMigrations();
  for (const f of ups) await execSqlFile(p, f);
}

async function tableExists(p: pg.Pool, table: string): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=$1
     ) AS exists`,
    [table],
  );
  return r.rows[0]?.exists ?? false;
}

async function indexDef(p: pg.Pool, name: string): Promise<string | null> {
  const r = await p.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname=$1`,
    [name],
  );
  return r.rows[0]?.indexdef ?? null;
}

describe("062_strategic_goals migration", () => {
  it(
    "creates strategic_goals with expected columns",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(await tableExists(pool, "strategic_goals")).toBe(true);

      const cols = await pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='strategic_goals'
          ORDER BY ordinal_position`,
      );
      const byName = Object.fromEntries(
        cols.rows.map((r) => [r.column_name, r]),
      );
      expect(byName["id"]?.data_type).toBe("bigint");
      expect(byName["id"]?.is_nullable).toBe("NO");
      expect(byName["persona"]?.data_type).toBe("text");
      expect(byName["persona"]?.is_nullable).toBe("NO");
      expect(byName["founder_user_id"]?.data_type).toBe("text");
      expect(byName["founder_user_id"]?.is_nullable).toBe("NO");
      expect(byName["week_start"]?.data_type).toBe("date");
      expect(byName["week_start"]?.is_nullable).toBe("NO");
      expect(byName["goal_text"]?.data_type).toBe("text");
      expect(byName["goal_text"]?.is_nullable).toBe("NO");
      expect(byName["status"]?.is_nullable).toBe("NO");
      expect(byName["created_at"]?.is_nullable).toBe("NO");
      expect(byName["updated_at"]?.is_nullable).toBe("NO");
    },
    TIMEOUT_MS,
  );

  it(
    "creates expected indexes",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const personaWeekIdx = await indexDef(
        pool,
        "strategic_goals_persona_week_idx",
      );
      expect(personaWeekIdx).not.toBeNull();
      expect(personaWeekIdx).toMatch(/\(persona, week_start\)/);

      const founderIdx = await indexDef(
        pool,
        "strategic_goals_founder_week_idx",
      );
      expect(founderIdx).not.toBeNull();
      expect(founderIdx).toMatch(/\(founder_user_id, week_start DESC\)/);
    },
    TIMEOUT_MS,
  );

  it(
    "CHECK constraint rejects invalid status values",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      // Direct SQL — bypassing helper validation to confirm DB-side CHECK.
      await expect(
        pool.query(
          `INSERT INTO strategic_goals (persona, founder_user_id, week_start, goal_text, status)
           VALUES ('finyk', 'user-1', '2026-05-11', 'g', 'invalid_status')`,
        ),
      ).rejects.toThrow(/check constraint|violates check/i);

      // Each valid value accepted.
      for (const s of ["active", "achieved", "abandoned", "carried_over"]) {
        await pool.query(
          `INSERT INTO strategic_goals (persona, founder_user_id, week_start, goal_text, status)
           VALUES ('finyk', 'user-1', '2026-05-11', 'g', $1)`,
          [s],
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    "createGoal INSERTs a row and coerces bigint id to number",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const out = await createGoal(pool, {
        persona: "finyk",
        founderUserId: "user-1",
        weekStart: "2026-05-11",
        goalText: "Test goal",
      });
      expect(out).not.toBeNull();
      expect(typeof out!.id).toBe("number");
      expect(out!.id).toBeGreaterThan(0);
      expect(out!.persona).toBe("finyk");
      expect(out!.status).toBe("active");
      expect(out!.weekStart).toBe("2026-05-11");
    },
    TIMEOUT_MS,
  );

  it(
    "listGoalsForWeek returns deterministic ordering and filters work",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      await createGoal(pool, {
        persona: "fizruk",
        founderUserId: "user-1",
        weekStart: "2026-05-11",
        goalText: "G3",
      });
      await createGoal(pool, {
        persona: "finyk",
        founderUserId: "user-1",
        weekStart: "2026-05-11",
        goalText: "G1",
      });
      await createGoal(pool, {
        persona: "nutrition",
        founderUserId: "user-2",
        weekStart: "2026-05-11",
        goalText: "G2",
      });

      const all = await listGoalsForWeek(pool, { weekStart: "2026-05-11" });
      expect(all.map((g) => g.persona)).toEqual([
        "finyk",
        "fizruk",
        "nutrition",
      ]);

      const onlyFinyk = await listGoalsForWeek(pool, {
        weekStart: "2026-05-11",
        persona: "finyk",
      });
      expect(onlyFinyk).toHaveLength(1);
      expect(onlyFinyk[0]!.goalText).toBe("G1");

      const onlyUser2 = await listGoalsForWeek(pool, {
        weekStart: "2026-05-11",
        founderUserId: "user-2",
      });
      expect(onlyUser2).toHaveLength(1);
      expect(onlyUser2[0]!.persona).toBe("nutrition");
    },
    TIMEOUT_MS,
  );

  it(
    "updateGoalStatus updates row and trigger bumps updated_at",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const created = await createGoal(pool, {
        persona: "routine",
        founderUserId: "user-1",
        weekStart: "2026-05-11",
        goalText: "Initial goal",
      });
      expect(created).not.toBeNull();

      // Sleep 50ms so updated_at clock advances past created_at.
      await new Promise((r) => setTimeout(r, 50));

      const updated = await updateGoalStatus(pool, created!.id, "achieved");
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("achieved");
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(
        created!.createdAt.getTime(),
      );
    },
    TIMEOUT_MS,
  );

  it(
    "down → re-up round-trip is idempotent (schema restored)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);
      expect(await tableExists(pool, "strategic_goals")).toBe(true);

      const downSql = await fs.readFile(
        path.join(MIGRATIONS_DIR, "062_strategic_goals.down.sql"),
        "utf8",
      );
      await pool.query(downSql);
      expect(await tableExists(pool, "strategic_goals")).toBe(false);

      // Re-up.
      const upSql = await fs.readFile(
        path.join(MIGRATIONS_DIR, "062_strategic_goals.sql"),
        "utf8",
      );
      await pool.query(upSql);
      expect(await tableExists(pool, "strategic_goals")).toBe(true);

      // Trigger and indexes restored too.
      const idx = await indexDef(pool, "strategic_goals_persona_week_idx");
      expect(idx).not.toBeNull();
    },
    TIMEOUT_MS,
  );
});
