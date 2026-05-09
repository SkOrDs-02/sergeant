// Migration 035 — focused round-trip for the Nutrition tables
// (Stage 4 / PR #031 of `docs/planning/storage-roadmap.md`).
//
// Complements `rollback-sanity.test.ts` (which round-trips every
// migration generically) with a pointed check that:
//
//   1. applying every forward migration leaves all 5 nutrition tables
//      present with the columns / indexes documented in
//      `apps/server/src/migrations/035_nutrition_tables.sql`,
//   2. running `035_nutrition_tables.down.sql` drops them all,
//   3. re-applying `035_nutrition_tables.sql` brings them back to a
//      byte-identical shape.
//
// Mirrors the harness style of `rollback-sanity.test.ts`: real
// `pgvector/pgvector:pg16` testcontainer, soft-skip with console
// warning if Docker is unavailable so non-Docker dev setups stay green.
//
// Why a focused test in addition to the catch-all sanity sweep:
// when nutrition's down.sql ever gets a typo (forgets `IF EXISTS`,
// drops in the wrong FK order), the catch-all test fails at the
// fingerprint comparison with a giant "this object differs" diff.
// This file fails on a single specific assertion, making the
// regression obvious in CI logs.

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

const NUTRITION_TABLES = [
  "nutrition_meals",
  "nutrition_pantries",
  "nutrition_pantry_items",
  "nutrition_prefs",
  "nutrition_recipes",
] as const;

const NUTRITION_INDEXES = [
  "nutrition_meals_user_eaten_idx",
  "nutrition_meals_user_active_idx",
  "nutrition_pantries_user_active_idx",
  "nutrition_pantry_items_pantry_idx",
  "nutrition_pantry_items_user_active_idx",
  "nutrition_recipes_user_active_idx",
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
      `[035-nutrition-tables] Skipping: Testcontainers unavailable — ${skipReason}`,
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

// Scoped to the 5 tables 035 owns. Later migrations (e.g. 051's water_log /
// shopping_list) introduce more `nutrition_*` tables — those belong to
// their own focused round-trip suites (`051-nutrition-full-state.test.ts`),
// so this file must not couple to them.
async function listOwnTables(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])
     ORDER BY tablename`,
    [[...NUTRITION_TABLES]],
  );
  return r.rows.map((row) => row.tablename);
}

async function listOwnIndexes(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    [[...NUTRITION_INDEXES]],
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

describe("035_nutrition_tables migration", () => {
  it(
    "creates all 5 nutrition tables and their indexes after forward migration",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const tables = await listOwnTables(pool);
      expect(tables).toEqual([...NUTRITION_TABLES].sort());

      const indexes = await listOwnIndexes(pool);
      // Per-table primary-key indexes (`nutrition_*_pkey`) are auto-created
      // by Postgres — filter them out so we only assert the explicit
      // CREATE INDEX statements from 035_nutrition_tables.sql.
      const explicit = indexes.filter((i) => !i.endsWith("_pkey"));
      expect(explicit).toEqual([...NUTRITION_INDEXES].sort());
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_meals has the documented column shape",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "nutrition_meals");
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "eaten_at",
        "meal_type",
        "name",
        "label",
        "kcal",
        "protein_g",
        "fat_g",
        "carbs_g",
        "source",
        "macro_source",
        "amount_g",
        "food_id",
        "is_demo",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["id"]!.type).toBe("uuid");
      expect(byName["id"]!.nullable).toBe("NO");
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["user_id"]!.nullable).toBe("NO");
      expect(byName["eaten_at"]!.type).toBe("timestamp with time zone");
      expect(byName["eaten_at"]!.nullable).toBe("NO");
      expect(byName["kcal"]!.type).toBe("integer");
      expect(byName["kcal"]!.nullable).toBe("YES");
      expect(byName["protein_g"]!.type).toBe("real");
      expect(byName["is_demo"]!.type).toBe("boolean");
      expect(byName["is_demo"]!.nullable).toBe("NO");
      expect(byName["deleted_at"]!.nullable).toBe("YES");
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_prefs is a per-user singleton (user_id PRIMARY KEY)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "nutrition_prefs");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "prefs_json",
        "active_pantry_id",
        "created_at",
        "updated_at",
      ]);

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.nutrition_prefs'::regclass
           AND  i.indisprimary`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual(["user_id"]);
    },
    TIMEOUT_MS,
  );

  it(
    "035_nutrition_tables.down.sql drops every 035-owned nutrition_* table",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);
      expect((await listOwnTables(pool)).length).toBeGreaterThan(0);

      await execSqlFile(pool, "035_nutrition_tables.down.sql");
      expect(await listOwnTables(pool)).toEqual([]);
      expect(await listOwnIndexes(pool)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "035_nutrition_tables.down.sql is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await execSqlFile(pool, "035_nutrition_tables.down.sql");
      // Second run must not raise — `IF EXISTS` keeps it idempotent
      // per AGENTS rule #4.
      await execSqlFile(pool, "035_nutrition_tables.down.sql");
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
        tables: await listOwnTables(pool),
        indexes: await listOwnIndexes(pool),
        meals: await listColumns(pool, "nutrition_meals"),
        prefs: await listColumns(pool, "nutrition_prefs"),
      };

      await execSqlFile(pool, "035_nutrition_tables.down.sql");
      await execSqlFile(pool, "035_nutrition_tables.sql");

      const after = {
        tables: await listOwnTables(pool),
        indexes: await listOwnIndexes(pool),
        meals: await listColumns(pool, "nutrition_meals"),
        prefs: await listColumns(pool, "nutrition_prefs"),
      };

      expect(after).toEqual(before);
    },
    TIMEOUT_MS,
  );
});
