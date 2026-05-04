// Migration 039 — focused round-trip for the Finyk tables
// (Stage 4 / PR #035 of `docs/planning/storage-roadmap.md`).
//
// Mirrors `035-nutrition-tables.test.ts`: same Docker / pgvector
// testcontainer harness, same soft-skip behaviour, same assertions
// shape — the only thing that changes is the table list and the
// per-table column checks. Keeping the harness identical means a
// regression in the migration-runner shows up the same way for both
// modules in CI logs.
//
// Asserts that:
//   1. applying every forward migration leaves all 15 finyk tables
//      present with the columns / indexes documented in
//      `apps/server/src/migrations/039_finyk_tables.sql`,
//   2. running `039_finyk_tables.down.sql` drops them all (and
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

const FINYK_TABLES = [
  "finyk_assets",
  "finyk_budgets",
  "finyk_custom_categories",
  "finyk_debts",
  "finyk_hidden_accounts",
  "finyk_hidden_transactions",
  "finyk_manual_expenses",
  "finyk_mono_debt_links",
  "finyk_networth_history",
  "finyk_prefs",
  "finyk_receivables",
  "finyk_subscriptions",
  "finyk_tx_categories",
  "finyk_tx_filters",
  "finyk_tx_splits",
] as const;

const FINYK_INDEXES = [
  "finyk_assets_user_active_idx",
  "finyk_budgets_user_active_idx",
  "finyk_custom_categories_user_active_idx",
  "finyk_debts_user_active_idx",
  "finyk_hidden_accounts_user_active_idx",
  "finyk_hidden_transactions_user_active_idx",
  "finyk_manual_expenses_user_active_idx",
  "finyk_mono_debt_links_user_idx",
  "finyk_networth_history_user_month_idx",
  "finyk_receivables_user_active_idx",
  "finyk_subscriptions_user_active_idx",
  "finyk_tx_categories_user_idx",
  "finyk_tx_filters_user_active_idx",
  "finyk_tx_splits_user_idx",
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
      `[039-finyk-tables] Skipping: Testcontainers unavailable — ${skipReason}`,
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

async function listTables(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename LIKE 'finyk_%'
     ORDER BY tablename`,
  );
  return r.rows.map((row) => row.tablename);
}

async function listFinykIndexes(p: pg.Pool): Promise<string[]> {
  const r = await p.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE 'finyk_%'
     ORDER BY indexname`,
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

describe("039_finyk_tables migration", () => {
  it(
    "creates all 15 finyk tables and their explicit indexes after forward migration",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const tables = await listTables(pool);
      expect(tables).toEqual([...FINYK_TABLES].sort());

      const indexes = await listFinykIndexes(pool);
      // Filter `_pkey` and the auto-named composite-PK indexes that
      // Postgres creates implicitly — only the explicit
      // `CREATE INDEX` statements from 039_finyk_tables.sql are
      // asserted.
      const explicit = indexes.filter((i) => !i.endsWith("_pkey"));
      expect(explicit).toEqual([...FINYK_INDEXES].sort());
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_budgets has the documented per-row + JSONB shape",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "finyk_budgets");
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "data_json",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["id"]!.type).toBe("uuid");
      expect(byName["id"]!.nullable).toBe("NO");
      expect(byName["user_id"]!.type).toBe("text");
      expect(byName["data_json"]!.type).toBe("jsonb");
      expect(byName["data_json"]!.nullable).toBe("NO");
      expect(byName["deleted_at"]!.nullable).toBe("YES");
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_hidden_accounts is keyed on (user_id, account_id) with soft-delete",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "finyk_hidden_accounts");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "account_id",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.finyk_hidden_accounts'::regclass
           AND  i.indisprimary
         ORDER BY a.attnum`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual([
        "user_id",
        "account_id",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_tx_categories has no soft-delete column (delete = DELETE FROM)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "finyk_tx_categories");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "transaction_id",
        "category_id",
        "created_at",
        "updated_at",
      ]);
      expect(cols.map((c) => c.name)).not.toContain("deleted_at");
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_networth_history keeps month as TEXT (not DATE) for LWW parity with LS",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "finyk_networth_history");
      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      expect(byName["month"]!.type).toBe("text");
      expect(byName["month"]!.nullable).toBe("NO");
      expect(byName["networth"]!.type).toBe("real");
      expect(byName["snapshot_json"]!.type).toBe("jsonb");

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.finyk_networth_history'::regclass
           AND  i.indisprimary
         ORDER BY a.attnum`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual([
        "user_id",
        "month",
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_prefs is a per-user singleton (user_id PRIMARY KEY)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      const cols = await listColumns(pool, "finyk_prefs");
      expect(cols.map((c) => c.name)).toEqual([
        "user_id",
        "prefs_json",
        "monthly_plan_json",
        "show_balance",
        "created_at",
        "updated_at",
      ]);

      const pkCheck = await pool.query<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM   pg_index i
         JOIN   pg_attribute a ON a.attrelid = i.indrelid
                              AND a.attnum   = ANY(i.indkey)
         WHERE  i.indrelid = 'public.finyk_prefs'::regclass
           AND  i.indisprimary`,
      );
      expect(pkCheck.rows.map((r) => r.column_name)).toEqual(["user_id"]);
    },
    TIMEOUT_MS,
  );

  it(
    "039_finyk_tables.down.sql drops every finyk_* table",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);
      expect((await listTables(pool)).length).toBeGreaterThan(0);

      await execSqlFile(pool, "039_finyk_tables.down.sql");
      expect(await listTables(pool)).toEqual([]);
      expect(await listFinykIndexes(pool)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "039_finyk_tables.down.sql is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const ups = await readMigrationFiles();
      await resetSchema(pool);
      for (const f of ups) await execSqlFile(pool, f);

      await execSqlFile(pool, "039_finyk_tables.down.sql");
      await execSqlFile(pool, "039_finyk_tables.down.sql");
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
        tables: await listTables(pool),
        indexes: await listFinykIndexes(pool),
        budgets: await listColumns(pool, "finyk_budgets"),
        prefs: await listColumns(pool, "finyk_prefs"),
        networthHistory: await listColumns(pool, "finyk_networth_history"),
      };

      await execSqlFile(pool, "039_finyk_tables.down.sql");
      await execSqlFile(pool, "039_finyk_tables.sql");

      const after = {
        tables: await listTables(pool),
        indexes: await listFinykIndexes(pool),
        budgets: await listColumns(pool, "finyk_budgets"),
        prefs: await listColumns(pool, "finyk_prefs"),
        networthHistory: await listColumns(pool, "finyk_networth_history"),
      };

      expect(after).toEqual(before);
    },
    TIMEOUT_MS,
  );
});
