// Migration 050 — focused round-trip for the Routine full-state tables
// (Stage 10 / PR #070r-schema of `docs/planning/storage-roadmap.md`).
//
// Mirrors `035-nutrition-tables.test.ts` and `039-finyk-tables.test.ts`:
// same Docker / pgvector testcontainer harness, same soft-skip
// behaviour, same assertions shape — the only thing that changes is
// the table list and the per-table column checks. Keeping the
// harness identical means a regression in the migration-runner shows
// up the same way for all three modules in CI logs.
//
// Asserts that:
//   1. applying every forward migration leaves all 7 new routine tables
//      present with the columns / indexes documented in
//      `apps/server/src/migrations/050_routine_full_state.sql`,
//   2. running `050_routine_full_state.down.sql` drops them all (and
//      removes the explicit indexes),
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

// Stage 10 / PR #070r-schema introduces 7 new tables (extending the
// 026_routine_tables.sql baseline of `routine_entries` /
// `routine_streaks`). The test scopes itself to the new tables only —
// the baseline pair stays out of this list and out of the
// down.sql so we don't accidentally drop production tables that
// migration 026 owns.
const ROUTINE_FULL_STATE_TABLES = [
  "routine_categories",
  "routine_completion_notes",
  "routine_habit_order",
  "routine_habits",
  "routine_prefs",
  "routine_pushups",
  "routine_tags",
] as const;

const ROUTINE_FULL_STATE_INDEXES = [
  "routine_categories_user_active_idx",
  "routine_completion_notes_user_active_idx",
  "routine_habits_user_active_idx",
  "routine_tags_user_active_idx",
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
      `[050-routine-full-state] Skipping: Testcontainers unavailable — ${skipReason}`,
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
    [[...ROUTINE_FULL_STATE_TABLES]],
  );
  return r.rows.map((row) => row.tablename);
}

async function listFullStateIndexes(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    [[...ROUTINE_FULL_STATE_INDEXES]],
  );
  return r.rows.map((row) => row.indexname);
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

describe("050_routine_full_state migration", () => {
  it(
    "creates all 7 new routine tables and their explicit indexes after forward migration",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const tables = await listFullStateTables(pool);
      expect(tables).toEqual([...ROUTINE_FULL_STATE_TABLES]);

      const indexes = await listFullStateIndexes(pool);
      expect(indexes).toEqual([...ROUTINE_FULL_STATE_INDEXES]);
    },
    TIMEOUT_MS,
  );

  it(
    "routine_habits has the documented column shape with jsonb arrays",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "routine_habits");
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "name",
        "emoji",
        "tag_ids",
        "category_id",
        "archived",
        "paused",
        "recurrence",
        "start_date",
        "end_date",
        "time_of_day",
        "reminder_times",
        "weekdays",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["id"]!.type).toBe("uuid");
      expect(byName["id"]!.nullable).toBe("NO");
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["user_id"]!.nullable).toBe("NO");
      expect(byName["tag_ids"]!.type).toBe("jsonb");
      expect(byName["tag_ids"]!.nullable).toBe("NO");
      expect(byName["reminder_times"]!.type).toBe("jsonb");
      expect(byName["weekdays"]!.type).toBe("jsonb");
      expect(byName["archived"]!.type).toBe("boolean");
      expect(byName["paused"]!.type).toBe("boolean");
      expect(byName["created_at"]!.type).toBe("timestamp with time zone");
      expect(byName["deleted_at"]!.nullable).toBe("YES");
    },
    TIMEOUT_MS,
  );

  it(
    "routine_pushups is keyed on (user_id, date_key)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "routine_pushups");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "date_key",
        "reps",
        "updated_at",
      ]);

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.routine_pushups'::regclass
           AND  i.indisprimary
         ORDER BY a.attnum`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual([
        "user_id",
        "date_key",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "routine_completion_notes is keyed on (user_id, note_key) with soft-delete",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "routine_completion_notes");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "note_key",
        "note",
        "updated_at",
        "deleted_at",
      ]);

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.routine_completion_notes'::regclass
           AND  i.indisprimary
         ORDER BY a.attnum`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual([
        "user_id",
        "note_key",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "routine_prefs / routine_habit_order are per-user singletons",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const prefsCols = await listColumns(pool, "routine_prefs");
      expect(prefsCols.map((c) => c.name)).toEqual([
        "user_id",
        "data",
        "updated_at",
      ]);
      const prefsByName = Object.fromEntries(prefsCols.map((c) => [c.name, c]));
      expect(prefsByName["data"]!.type).toBe("jsonb");

      const orderCols = await listColumns(pool, "routine_habit_order");
      expect(orderCols.map((c) => c.name)).toEqual([
        "user_id",
        "order",
        "updated_at",
      ]);
      const orderByName = Object.fromEntries(orderCols.map((c) => [c.name, c]));
      expect(orderByName["order"]!.type).toBe("jsonb");

      for (const table of ["routine_prefs", "routine_habit_order"] as const) {
        const pkCheck = await pool.query<{ column_name: string }>(
          `SELECT a.attname AS column_name
           FROM   pg_index i
           JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                AND a.attnum   = ANY(i.indkey)
           WHERE  i.indrelid = $1::regclass
             AND  i.indisprimary`,
          [`public.${table}`],
        );
        expect(pkCheck.rows.map((r) => r.column_name)).toEqual(["user_id"]);
      }
    },
    TIMEOUT_MS,
  );

  it(
    "050_routine_full_state.down.sql drops every full-state table",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);
      expect((await listFullStateTables(pool)).length).toBe(
        ROUTINE_FULL_STATE_TABLES.length,
      );

      await execSqlFile(pool, "050_routine_full_state.down.sql");
      expect(await listFullStateTables(pool)).toEqual([]);
      expect(await listFullStateIndexes(pool)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "050_routine_full_state.down.sql is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await execSqlFile(pool, "050_routine_full_state.down.sql");
      // Second run must not raise — `IF EXISTS` keeps it idempotent
      // per AGENTS rule #4.
      await execSqlFile(pool, "050_routine_full_state.down.sql");
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
        indexes: await listFullStateIndexes(pool),
        habits: await listColumns(pool, "routine_habits"),
        prefs: await listColumns(pool, "routine_prefs"),
        completionNotes: await listColumns(pool, "routine_completion_notes"),
      };

      await execSqlFile(pool, "050_routine_full_state.down.sql");
      await execSqlFile(pool, "050_routine_full_state.sql");

      const after = {
        tables: await listFullStateTables(pool),
        indexes: await listFullStateIndexes(pool),
        habits: await listColumns(pool, "routine_habits"),
        prefs: await listColumns(pool, "routine_prefs"),
        completionNotes: await listColumns(pool, "routine_completion_notes"),
      };

      expect(after).toEqual(before);
    },
    TIMEOUT_MS,
  );
});
