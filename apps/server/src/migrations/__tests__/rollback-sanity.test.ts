// Migration rollback sanity (audit PR-5.B).
//
// Audit `docs/audits/2026-04-26-sergeant-audit-devin.md` flags that
// `*.down.sql` files exist as documented escape hatches for manual
// rollback (AGENTS.md rule #4) but never execute in CI:
//
//   > `down.sql` не run в production (правильно), але і не run в CI як
//   > sanity-check.
//   > `PR-5.B` — `ci(server): apply down.sql in test job after up.sql,
//   > then re-apply up.sql` (catch-all sanity check, що `down`
//   > принаймні виконується).
//
// This test closes the gap. Per cycle, against a real Postgres-16
// container:
//   1. apply every forward migration (`NNN_*.sql`, excluding `.down.sql`)
//   2. capture a schema fingerprint (tables + indexes + columns)
//   3. apply every `.down.sql` in reverse order
//   4. re-apply the forward migrations whose down.sql we just ran
//   5. assert the final schema fingerprint equals the initial one
//
// Why a real container, not pg-mem / mocks: the down/up files use
// FK + check-constraint syntax (`REFERENCES "user"(id) ON DELETE CASCADE`,
// partial unique indexes, CHECK clauses) that pg-mem silently ignores —
// a mock would say "down works" while production rejects the same SQL.
//
// Local dev without Docker: the test soft-skips with a console warning
// instead of failing, so `pnpm test` stays green for non-Docker setups.
// CI runs on `ubuntu-latest` which has Docker pre-installed, so the
// suite runs there.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

// Postgres-16-alpine boot + migrations runs ~15–30s on ubuntu-latest.
// Generous ceiling so a slow registry pull does not flake CI.
const TIMEOUT_MS = 180_000;

interface SchemaFingerprint {
  tables: string[];
  indexes: string[];
  // table → ordered list of "column:type:nullable"
  columns: Record<string, string[]>;
}

let container: StartedTestContainer | undefined;
let pool: pg.Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

beforeAll(async () => {
  try {
    // Use the pgvector image — migration 025_ai_memories_pgvector.sql
    // requires the `vector` extension which `postgres:16-alpine` does not
    // ship. Without this the forward-migration phase fails before the
    // rollback assertions can run.
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
      `[migrations rollback-sanity] Skipping: Testcontainers unavailable — ${skipReason}`,
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

// ── helpers ──────────────────────────────────────────────────────────────────

async function readMigrationFiles(): Promise<{
  ups: string[];
  downs: string[];
}> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sql = files.filter((f) => f.endsWith(".sql"));
  const ups = sql
    .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
  const downs = sql.filter((f) => f.endsWith(".down.sql")).sort();
  return { ups, downs };
}

async function execSqlFile(p: pg.Pool, file: string): Promise<void> {
  const sql = (
    await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
  ).trim();
  if (!sql) return;
  await p.query(sql);
}

/**
 * Drop and recreate the `public` schema. Cheaper than restarting the
 * container and gives every test a fully clean slate so the order in
 * which tests run can never bleed state across cases. Postgres always
 * reserves `public` for the default user; we re-grant after recreate.
 */
async function resetSchema(p: pg.Pool): Promise<void> {
  await p.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await p.query(`GRANT ALL ON SCHEMA public TO public;`);
}

async function captureSchema(p: pg.Pool): Promise<SchemaFingerprint> {
  const tables = (
    await p.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename`,
    )
  ).rows.map((r) => r.tablename);

  const indexes = (
    await p.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
       ORDER BY indexname`,
    )
  ).rows.map((r) => r.indexname);

  const columnsRows = (
    await p.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    )
  ).rows;

  const columns: Record<string, string[]> = {};
  for (const row of columnsRows) {
    const sig = `${row.column_name}:${row.data_type}:${row.is_nullable}`;
    (columns[row.table_name] ??= []).push(sig);
  }

  return { tables, indexes, columns };
}

/** Returns the corresponding forward filename for a `.down.sql` file. */
function forwardOf(downFile: string): string {
  return downFile.replace(/\.down\.sql$/, ".sql");
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("migration rollback sanity (audit PR-5.B)", () => {
  it(
    "lists at least one forward migration and one down.sql",
    () => {
      // Sanity that the test is actually exercising something. If the
      // repo ever has zero down.sql files this test should fail loudly
      // instead of silently passing.
      // (Runs even without Docker because it is filesystem-only.)
      return readMigrationFiles().then(({ ups, downs }) => {
        expect(ups.length).toBeGreaterThan(0);
        expect(downs.length).toBeGreaterThan(0);
      });
    },
    TIMEOUT_MS,
  );

  it(
    "each down.sql has a matching forward .sql sibling",
    async () => {
      const { ups, downs } = await readMigrationFiles();
      const upsSet = new Set(ups);
      const orphans = downs.filter((d) => !upsSet.has(forwardOf(d)));
      expect(orphans).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "applies up.sql, runs each down.sql in reverse, then re-applies up.sql cleanly",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const { ups, downs } = await readMigrationFiles();
      await resetSchema(pool);

      // Phase 1: forward.
      for (const f of ups) await execSqlFile(pool, f);
      const initial = await captureSchema(pool);

      // Phase 2: down.sql in reverse order.
      for (const f of [...downs].reverse()) await execSqlFile(pool, f);

      // Phase 3: re-apply only the rolled-back forward migrations.
      const reapply = downs.map(forwardOf);
      for (const f of reapply) await execSqlFile(pool, f);
      const final = await captureSchema(pool);

      // The schema after roll-down + re-apply must be byte-identical
      // to the initial fully-applied state (canonicalized ordering in
      // captureSchema).
      expect(final).toEqual(initial);
    },
    TIMEOUT_MS,
  );

  it(
    "every down.sql is idempotent (re-running it twice does not error)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const { ups, downs } = await readMigrationFiles();
      await resetSchema(pool);

      // Bring the schema up so down.sql has something to drop.
      for (const f of ups) await execSqlFile(pool, f);

      // Run every down.sql twice. AGENTS rule #4 mandates idempotent
      // rollbacks ("Ідемпотентно — повторний прогін не падає"); this
      // test enforces the comment so a future down.sql that forgets
      // `IF EXISTS` cannot ship.
      for (const f of [...downs].reverse()) {
        await execSqlFile(pool, f);
        await execSqlFile(pool, f);
      }
    },
    TIMEOUT_MS,
  );
});
