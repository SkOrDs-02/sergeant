// Migration 051 — focused round-trip for the Nutrition full-state tables
// (Stage 11 / PR #070n-schema of `docs/planning/storage-roadmap.md`).
//
// Mirrors `050-routine-full-state.test.ts`: same Docker / pgvector
// testcontainer harness, same soft-skip behaviour, same assertions
// shape — the only thing that changes is the table list and the
// per-table column checks.
//
// Asserts that:
//   1. applying every forward migration leaves both new nutrition
//      tables present with the columns documented in
//      `apps/server/src/migrations/051_nutrition_full_state.sql`,
//   2. running `051_nutrition_full_state.down.sql` drops them,
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

// Stage 11 / PR #070n-schema introduces 2 new tables (extending the
// 035_nutrition_tables.sql baseline of meals / pantries / pantry_items
// / prefs / recipes). The test scopes itself to the new tables only.
const NUTRITION_FULL_STATE_TABLES = [
  "nutrition_shopping_list",
  "nutrition_water_log",
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
      `[051-nutrition-full-state] Skipping: Testcontainers unavailable — ${skipReason}`,
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
    [[...NUTRITION_FULL_STATE_TABLES]],
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

describe("051_nutrition_full_state migration", () => {
  it(
    "creates both new nutrition tables after forward migration",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const tables = await listFullStateTables(pool);
      expect(tables).toEqual([...NUTRITION_FULL_STATE_TABLES]);
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_water_log is keyed on (user_id, date_key)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "nutrition_water_log");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "date_key",
        "volume_ml",
        "updated_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["user_id"]!.nullable).toBe("NO");
      expect(byName["date_key"]!.type).toBe("text");
      expect(byName["date_key"]!.nullable).toBe("NO");
      expect(byName["volume_ml"]!.type).toBe("integer");
      expect(byName["volume_ml"]!.nullable).toBe("NO");
      expect(byName["updated_at"]!.type).toBe("timestamp with time zone");

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.nutrition_water_log'::regclass
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
    "nutrition_shopping_list is a per-user singleton with jsonb data",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "nutrition_shopping_list");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "data",
        "updated_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["user_id"]!.nullable).toBe("NO");
      expect(byName["data"]!.type).toBe("jsonb");
      expect(byName["data"]!.nullable).toBe("NO");
      expect(byName["updated_at"]!.type).toBe("timestamp with time zone");

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.nutrition_shopping_list'::regclass
           AND  i.indisprimary`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual(["user_id"]);
    },
    TIMEOUT_MS,
  );

  it(
    "round-trips a row through nutrition_water_log",
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
        `INSERT INTO nutrition_water_log (user_id, date_key, volume_ml)
         VALUES ($1, $2, $3)`,
        ["u1", "2026-05-09", 750],
      );

      const r = await pool.query<{
        user_id: string;
        date_key: string;
        volume_ml: number;
      }>(
        `SELECT user_id, date_key, volume_ml FROM nutrition_water_log WHERE user_id = $1`,
        ["u1"],
      );
      expect(r.rows).toEqual([
        { user_id: "u1", date_key: "2026-05-09", volume_ml: 750 },
      ]);

      // Composite-PK upsert (`ON CONFLICT (user_id, date_key)`) is the
      // shape dual-write will use.
      await pool.query(
        `INSERT INTO nutrition_water_log (user_id, date_key, volume_ml)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, date_key)
         DO UPDATE SET volume_ml = EXCLUDED.volume_ml, updated_at = now()`,
        ["u1", "2026-05-09", 1500],
      );
      const r2 = await pool.query<{ volume_ml: number }>(
        `SELECT volume_ml FROM nutrition_water_log WHERE user_id = $1 AND date_key = $2`,
        ["u1", "2026-05-09"],
      );
      expect(r2.rows[0]!.volume_ml).toBe(1500);
    },
    TIMEOUT_MS,
  );

  it(
    "round-trips a JSONB document through nutrition_shopping_list",
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
        categories: [
          {
            name: "Овочі",
            items: [
              {
                id: "si_1",
                name: "помідори",
                quantity: "1 кг",
                note: "",
                checked: false,
              },
            ],
          },
        ],
      };

      await pool.query(
        `INSERT INTO nutrition_shopping_list (user_id, data) VALUES ($1, $2::jsonb)`,
        ["u1", JSON.stringify(doc)],
      );

      const r = await pool.query<{ data: typeof doc }>(
        `SELECT data FROM nutrition_shopping_list WHERE user_id = $1`,
        ["u1"],
      );
      expect(r.rows[0]!.data).toEqual(doc);
    },
    TIMEOUT_MS,
  );

  it(
    "051_nutrition_full_state.down.sql drops both tables",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);
      expect((await listFullStateTables(pool)).length).toBe(
        NUTRITION_FULL_STATE_TABLES.length,
      );

      await execSqlFile(pool, "051_nutrition_full_state.down.sql");
      expect(await listFullStateTables(pool)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "051_nutrition_full_state.down.sql is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await execSqlFile(pool, "051_nutrition_full_state.down.sql");
      // Second run must not raise — `IF EXISTS` keeps it idempotent
      // per AGENTS rule #4.
      await execSqlFile(pool, "051_nutrition_full_state.down.sql");
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
        waterLog: await listColumns(pool, "nutrition_water_log"),
        shoppingList: await listColumns(pool, "nutrition_shopping_list"),
      };

      await execSqlFile(pool, "051_nutrition_full_state.down.sql");
      await execSqlFile(pool, "051_nutrition_full_state.sql");

      const after = {
        tables: await listFullStateTables(pool),
        waterLog: await listColumns(pool, "nutrition_water_log"),
        shoppingList: await listColumns(pool, "nutrition_shopping_list"),
      };

      expect(after).toEqual(before);
    },
    TIMEOUT_MS,
  );
});
