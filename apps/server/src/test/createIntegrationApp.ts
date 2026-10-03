/**
 * Shared harness for server integration / e2e tests (Testcontainers + createApp).
 *
 * Consolidates bootstrapping duplicated across session-protection,
 * transcribe-usd-cap, and forthcoming route-level integration suites.
 * Import handlers/modules **after** `bootIntegrationHarness()` sets
 * `DATABASE_URL` — the production `db.ts` pool captures env at load time.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import type { Express } from "express";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

export const INTEGRATION_TIMEOUT_MS = 240_000;

export interface IntegrationHarness {
  pool: pg.Pool;
  app?: Express | undefined;
  container: StartedTestContainer;
  connectionUri: string;
}

export interface BootIntegrationOptions {
  /** Extra env vars applied before `createApp` import. */
  env?: Record<string, string | undefined>;
  /** Skip `createApp()` — pool-only harness (handler-direct tests). */
  app?: boolean;
}

let activeContainer: StartedTestContainer | undefined;
let activePool: pg.Pool | undefined;
let activeUri: string | undefined;

/**
 * Default env for integration suites. Call before dynamic imports of app modules.
 */
export function applyIntegrationEnv(
  overrides: Record<string, string | undefined> = {},
): void {
  process.env["BETTER_AUTH_SECRET"] ??= "0".repeat(64);
  process.env["MONO_WEBHOOK_ENABLED"] ??= "true";
  process.env["MONO_TOKEN_ENC_KEY"] ??= "0".repeat(64);
  process.env["INTERNAL_API_KEY"] ??= "internal-test-key";
  process.env["GROQ_API_KEY"] ??= "test-groq-key-do-not-use";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function runMigrations(p: pg.Pool): Promise<void> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await p.query(sql);
  }
}

/**
 * Boots pgvector Postgres, runs migrations, optionally `createApp()`.
 * Fails in CI when Docker is unavailable; skips locally via thrown error
 * caught by the caller (pattern: session-protection.integration.test.ts).
 */
export async function bootIntegrationHarness(
  options: BootIntegrationOptions = {},
): Promise<IntegrationHarness> {
  const wantApp = options.app !== false;

  const container = await new GenericContainer("pgvector/pgvector:pg17")
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
  const connectionUri = `postgresql://hub:hub@${host}:${port}/hub_test`;

  process.env["DATABASE_URL"] = connectionUri;
  applyIntegrationEnv(options.env);

  const pool = new pg.Pool({ connectionString: connectionUri, max: 8 });
  await runMigrations(pool);

  activeContainer = container;
  activePool = pool;
  activeUri = connectionUri;

  let app: Express | undefined;
  if (wantApp) {
    const { createApp } = await import("../app.js");
    app = createApp();
  }

  return { pool, app, container, connectionUri };
}

/**
 * Tear down container + pool from the most recent `bootIntegrationHarness`.
 */
export async function shutdownIntegrationHarness(): Promise<void> {
  if (activePool) {
    await activePool.end().catch(() => {});
    activePool = undefined;
  }
  if (activeContainer) {
    await activeContainer.stop().catch(() => {});
    activeContainer = undefined;
  }
  activeUri = undefined;
}

/** CSRF header required by `requireCsrfHeader` on mutating `/api/*` routes. */
export const CSRF_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

/**
 * Insert a Better Auth `user` row for FK-bound writes.
 */
export async function seedIntegrationUser(
  pool: pg.Pool,
  userId: string,
  email?: string,
): Promise<void> {
  const mail = email ?? `${userId}@test.local`;
  await pool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, mail, userId],
  );
}

/**
 * Truncate all public tables except `schema_migrations`.
 *
 * One multi-table TRUNCATE (not a per-table loop) shrinks the lock window.
 * Retries on 40P01 — Vitest forks can still race two connections inside the
 * same container when a previous test's pool client holds a brief lock.
 */
export async function truncateIntegrationTables(pool: pg.Pool): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query(`
        DO $$
        DECLARE stmt text;
        BEGIN
          SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(tablename), ', ')
                 || ' CASCADE'
            INTO stmt
            FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename <> 'schema_migrations';
          IF stmt IS NOT NULL THEN
            EXECUTE stmt;
          END IF;
        END $$;
      `);
      return;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code !== "40P01" || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
}

/**
 * Returns active pool from last boot (for tests that only need query helpers).
 */
export function getIntegrationPool(): pg.Pool {
  if (!activePool) throw new Error("Integration harness not booted");
  return activePool;
}

export function getIntegrationUri(): string {
  if (!activeUri) throw new Error("Integration harness not booted");
  return activeUri;
}
