import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import pg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

let container: StartedTestContainer | undefined;
let pool: pg.Pool | undefined;
let connectionUri: string | undefined;

/**
 * Starts a Postgres 16 container via Testcontainers, runs all forward
 * migrations from apps/server/src/migrations/, and returns a pg.Pool.
 *
 * Designed to be called once per Vitest `globalSetup` or inside a
 * `beforeAll` block. The container is reused within the same process.
 */
export async function startPgContainer(): Promise<pg.Pool> {
  if (pool) return pool;

  // Use the pgvector image (matches the local-dev image called out in
  // migration 025_ai_memories_pgvector.sql). The plain `postgres:16-alpine`
  // image does not ship the `vector` extension, which causes that
  // migration to fail at container boot.
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
  connectionUri = `postgresql://hub:hub@${host}:${port}/hub_test`;

  pool = new pg.Pool({ connectionString: connectionUri, max: 5 });

  await runMigrations(pool);

  return pool;
}

/**
 * Runs all forward SQL migrations (skipping `.down.sql`) in lexicographic
 * order. Mirrors the logic in `db.ts → runPendingSqlMigrations` but without
 * advisory locks or the `schema_migrations` tracking table — in tests we
 * always start from a clean database.
 */
async function runMigrations(p: pg.Pool): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    return;
  }

  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();

  for (const file of sqlFiles) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = (await fs.readFile(fullPath, "utf8")).trim();
    if (!sql) continue;
    await p.query(sql);
  }
}

/**
 * Returns the connection URI for the running container. Useful for setting
 * `DATABASE_URL` in env-dependent code paths.
 */
export function getConnectionUri(): string {
  if (!connectionUri) throw new Error("Pg container not started");
  return connectionUri;
}

/**
 * Stops the container and closes the pool. Call in `afterAll` or
 * `globalTeardown`.
 */
export async function stopPgContainer(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
  if (container) {
    await container.stop();
    container = undefined;
  }
  connectionUri = undefined;
}

/**
 * Helper: execute a parameterized query against the test pool.
 */
export async function testQuery<
  R extends pg.QueryResultRow = pg.QueryResultRow,
>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>> {
  if (!pool) throw new Error("Pg container not started");
  return pool.query<R>(text, values);
}

/**
 * Truncate all user-created tables (except schema_migrations) so tests
 * can run against a clean state without restarting the container.
 */
export async function truncateAll(): Promise<void> {
  if (!pool) return;
  // AI-NOTE: order matters due to FK constraints; TRUNCATE CASCADE handles it.
  await pool.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> 'schema_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}
