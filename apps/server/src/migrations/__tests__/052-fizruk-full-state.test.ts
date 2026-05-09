// Migration 052 — focused round-trip for the Fizruk full-state tables
// (Stage 12 / PR #070f-schema of `docs/planning/storage-roadmap.md`).
//
// Mirrors `051-nutrition-full-state.test.ts`: same Docker / pgvector
// testcontainer harness, same soft-skip behaviour, same assertions
// shape — the table list and per-table column checks are the only
// things that change.
//
// Asserts that:
//   1. applying every forward migration leaves the six new fizruk
//      tables present with the columns documented in
//      `apps/server/src/migrations/052_fizruk_full_state.sql`,
//   2. running `052_fizruk_full_state.down.sql` drops them,
//   3. the down migration is idempotent (rule #4 invariant),
//   4. down → re-up restores the schema fingerprint byte-for-byte.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

const TIMEOUT_MS = 180_000;

// Stage 12 / PR #070f-schema introduces 6 new tables (extending the
// 029_fizruk_tables.sql baseline of workouts / workout_items /
// workout_sets / custom_exercises / measurements). The test scopes
// itself to the new tables only.
const FIZRUK_FULL_STATE_TABLES = [
  "fizruk_daily_log",
  "fizruk_monthly_plan",
  "fizruk_plan_templates",
  "fizruk_programs",
  "fizruk_wellbeing",
  "fizruk_workout_templates",
] as const;

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
      `[052-fizruk-full-state] Skipping: Testcontainers unavailable — ${skipReason}`,
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

async function readMigrationFiles(): Promise<string[]> {
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

async function listFullStateTables(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])
     ORDER BY tablename`,
    [[...FIZRUK_FULL_STATE_TABLES]],
  );
  return r.rows.map((row) => row.tablename);
}

async function listColumns(
  p: pg.Pool,
  table: string,
): Promise<{ name: string; type: string; nullable: string }[]> {
  const r = await p.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row) => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable,
  }));
}

async function listPrimaryKey(p: pg.Pool, table: string): Promise<string[]> {
  const r = await p.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM   pg_index i
     JOIN   pg_attribute a ON a.attrelid = i.indrelid
                          AND a.attnum   = ANY(i.indkey)
     WHERE  i.indrelid = ($1 || '.' || $2)::regclass
       AND  i.indisprimary
     ORDER BY a.attnum`,
    ["public", table],
  );
  return r.rows.map((row) => row.column_name);
}

describe("052_fizruk_full_state migration", () => {
  it(
    "creates all six new fizruk tables after forward migration",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const tables = await listFullStateTables(pool);
      expect(tables).toEqual([...FIZRUK_FULL_STATE_TABLES]);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_daily_log carries the full diary schema",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "fizruk_daily_log");
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "entry_at",
        "weight_kg",
        "sleep_hours",
        "energy_level",
        "mood",
        "note",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["id"]!.type).toBe("uuid");
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["user_id"]!.nullable).toBe("NO");
      expect(byName["entry_at"]!.type).toBe("timestamp with time zone");
      expect(byName["entry_at"]!.nullable).toBe("NO");
      expect(byName["weight_kg"]!.type).toBe("real");
      expect(byName["weight_kg"]!.nullable).toBe("YES");
      expect(byName["sleep_hours"]!.type).toBe("real");
      expect(byName["sleep_hours"]!.nullable).toBe("YES");
      expect(byName["energy_level"]!.type).toBe("integer");
      expect(byName["energy_level"]!.nullable).toBe("YES");
      expect(byName["mood"]!.type).toBe("integer");
      expect(byName["mood"]!.nullable).toBe("YES");
      expect(byName["note"]!.type).toBe("text");
      expect(byName["note"]!.nullable).toBe("NO");
      expect(byName["deleted_at"]!.type).toBe("timestamp with time zone");

      expect(await listPrimaryKey(pool, "fizruk_daily_log")).toEqual(["id"]);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_monthly_plan / fizruk_plan_templates / fizruk_programs are per-user singletons",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      // monthly_plan — JSONB blob, not-null with empty default.
      const mp = await listColumns(pool, "fizruk_monthly_plan");
      expect(mp.map((c) => c.name)).toEqual(["user_id", "data", "updated_at"]);
      const mpByName = Object.fromEntries(mp.map((c) => [c.name, c]));
      expect(mpByName["user_id"]!.type).toBe("text");
      expect(mpByName["user_id"]!.nullable).toBe("NO");
      expect(mpByName["data"]!.type).toBe("jsonb");
      expect(mpByName["data"]!.nullable).toBe("NO");
      expect(await listPrimaryKey(pool, "fizruk_monthly_plan")).toEqual([
        "user_id",
      ]);

      // plan_templates — JSONB blob, nullable (the slot may be empty).
      const pt = await listColumns(pool, "fizruk_plan_templates");
      expect(pt.map((c) => c.name)).toEqual(["user_id", "data", "updated_at"]);
      const ptByName = Object.fromEntries(pt.map((c) => [c.name, c]));
      expect(ptByName["data"]!.type).toBe("jsonb");
      expect(ptByName["data"]!.nullable).toBe("YES");
      expect(await listPrimaryKey(pool, "fizruk_plan_templates")).toEqual([
        "user_id",
      ]);

      // programs — single text column for the active program id.
      const pr = await listColumns(pool, "fizruk_programs");
      expect(pr.map((c) => c.name)).toEqual([
        "user_id",
        "active_program_id",
        "updated_at",
      ]);
      const prByName = Object.fromEntries(pr.map((c) => [c.name, c]));
      expect(prByName["active_program_id"]!.type).toBe("text");
      expect(prByName["active_program_id"]!.nullable).toBe("YES");
      expect(await listPrimaryKey(pool, "fizruk_programs")).toEqual([
        "user_id",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_wellbeing is keyed on (user_id, date_key)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "fizruk_wellbeing");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "date_key",
        "mood",
        "energy",
        "sleep_quality",
        "sleep_hours",
        "notes",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["date_key"]!.type).toBe("text");
      expect(byName["mood"]!.type).toBe("integer");
      expect(byName["mood"]!.nullable).toBe("YES");
      expect(byName["sleep_hours"]!.type).toBe("real");
      expect(byName["notes"]!.type).toBe("text");
      expect(byName["notes"]!.nullable).toBe("NO");

      expect(await listPrimaryKey(pool, "fizruk_wellbeing")).toEqual([
        "user_id",
        "date_key",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_workout_templates carries the per-row template schema",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "fizruk_workout_templates");
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "name",
        "exercise_ids",
        "groups",
        "last_used_at",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["id"]!.type).toBe("uuid");
      expect(byName["name"]!.nullable).toBe("NO");
      expect(byName["exercise_ids"]!.type).toBe("jsonb");
      expect(byName["exercise_ids"]!.nullable).toBe("NO");
      expect(byName["groups"]!.type).toBe("jsonb");
      expect(byName["groups"]!.nullable).toBe("NO");
      expect(byName["last_used_at"]!.type).toBe("timestamp with time zone");
      expect(byName["last_used_at"]!.nullable).toBe("YES");
    },
    TIMEOUT_MS,
  );

  it(
    "round-trips a daily-log entry",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      // Seed a user so the FK to "user"(id) is satisfied.
      await pool.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ('u1', 'u1@example.com', 'U1', false, now(), now())`,
      );

      await pool.query(
        `INSERT INTO fizruk_daily_log (user_id, entry_at, weight_kg, sleep_hours, energy_level, mood, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ["u1", "2026-05-09T20:00:00Z", 72.4, 7.5, 4, 4, "felt great"],
      );

      const r = await pool.query<{
        user_id: string;
        weight_kg: number;
        sleep_hours: number;
        energy_level: number;
        mood: number;
        note: string;
      }>(
        `SELECT user_id, weight_kg, sleep_hours, energy_level, mood, note
         FROM fizruk_daily_log WHERE user_id = $1`,
        ["u1"],
      );
      expect(r.rows).toEqual([
        {
          user_id: "u1",
          weight_kg: 72.4000015258789, // float32 round-trip is byte-identical to ±5 ULP
          sleep_hours: 7.5,
          energy_level: 4,
          mood: 4,
          note: "felt great",
        },
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "round-trips a JSONB document through fizruk_monthly_plan",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await pool.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ('u1', 'u1@example.com', 'U1', false, now(), now())`,
      );

      const doc = {
        reminderEnabled: true,
        reminderHour: 18,
        reminderMinute: 30,
        days: { "2026-05-09": { templateId: "tpl_abc" } },
      };

      await pool.query(
        `INSERT INTO fizruk_monthly_plan (user_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        ["u1", JSON.stringify(doc)],
      );

      const r = await pool.query<{ data: typeof doc }>(
        `SELECT data FROM fizruk_monthly_plan WHERE user_id = $1`,
        ["u1"],
      );
      expect(r.rows[0]!.data).toEqual(doc);
    },
    TIMEOUT_MS,
  );

  it(
    "round-trips composite-PK upsert through fizruk_wellbeing",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await pool.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ('u1', 'u1@example.com', 'U1', false, now(), now())`,
      );

      // Composite-PK upsert (`ON CONFLICT (user_id, date_key)`) is the
      // shape dual-write will use.
      await pool.query(
        `INSERT INTO fizruk_wellbeing (user_id, date_key, mood, energy, sleep_quality, sleep_hours, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, date_key)
         DO UPDATE SET
           mood = EXCLUDED.mood,
           energy = EXCLUDED.energy,
           sleep_quality = EXCLUDED.sleep_quality,
           sleep_hours = EXCLUDED.sleep_hours,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        ["u1", "2026-05-09", 4, 5, 5, 7.5, "good day"],
      );

      const r1 = await pool.query<{ mood: number; notes: string }>(
        `SELECT mood, notes FROM fizruk_wellbeing WHERE user_id = $1 AND date_key = $2`,
        ["u1", "2026-05-09"],
      );
      expect(r1.rows[0]).toEqual({ mood: 4, notes: "good day" });

      // Re-upsert merges into the same composite-PK row.
      await pool.query(
        `INSERT INTO fizruk_wellbeing (user_id, date_key, mood, energy, sleep_quality, sleep_hours, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, date_key)
         DO UPDATE SET
           mood = EXCLUDED.mood,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        ["u1", "2026-05-09", 5, 5, 5, 7.5, "even better"],
      );
      const r2 = await pool.query<{ mood: number; notes: string }>(
        `SELECT mood, notes FROM fizruk_wellbeing WHERE user_id = $1 AND date_key = $2`,
        ["u1", "2026-05-09"],
      );
      expect(r2.rows[0]).toEqual({ mood: 5, notes: "even better" });
    },
    TIMEOUT_MS,
  );

  it(
    "052_fizruk_full_state.down.sql drops every new table",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);
      expect((await listFullStateTables(pool)).length).toBe(
        FIZRUK_FULL_STATE_TABLES.length,
      );

      await execSqlFile(pool, "052_fizruk_full_state.down.sql");
      expect(await listFullStateTables(pool)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "052_fizruk_full_state.down.sql is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await execSqlFile(pool, "052_fizruk_full_state.down.sql");
      // Second run must not raise — `IF EXISTS` keeps it idempotent
      // per AGENTS rule #4.
      await execSqlFile(pool, "052_fizruk_full_state.down.sql");
    },
    TIMEOUT_MS,
  );

  it(
    "down then re-up restores the same schema fingerprint",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const before = {
        tables: await listFullStateTables(pool),
        dailyLog: await listColumns(pool, "fizruk_daily_log"),
        monthlyPlan: await listColumns(pool, "fizruk_monthly_plan"),
        planTemplates: await listColumns(pool, "fizruk_plan_templates"),
        programs: await listColumns(pool, "fizruk_programs"),
        wellbeing: await listColumns(pool, "fizruk_wellbeing"),
        workoutTemplates: await listColumns(pool, "fizruk_workout_templates"),
      };

      await execSqlFile(pool, "052_fizruk_full_state.down.sql");
      await execSqlFile(pool, "052_fizruk_full_state.sql");

      const after = {
        tables: await listFullStateTables(pool),
        dailyLog: await listColumns(pool, "fizruk_daily_log"),
        monthlyPlan: await listColumns(pool, "fizruk_monthly_plan"),
        planTemplates: await listColumns(pool, "fizruk_plan_templates"),
        programs: await listColumns(pool, "fizruk_programs"),
        wellbeing: await listColumns(pool, "fizruk_wellbeing"),
        workoutTemplates: await listColumns(pool, "fizruk_workout_templates"),
      };

      expect(after).toEqual(before);
    },
    TIMEOUT_MS,
  );
});
