// Migration 055 — focused round-trip for `openclaw_reminders` table
// (PR-B / Phase 0.5 PoC).
//
// Mirrors `052-fizruk-full-state.test.ts`: Testcontainers harness with
// soft-skip when Docker is unavailable. Asserts that:
//   1. forward migration creates `openclaw_reminders` with the documented
//      columns (id, founder_user_id, persona, topic, reminder_text, due_at,
//      status, source_invocation_id, channel, attempts, last_attempted_at,
//      sent_at, cancelled_at, metadata, created_at, updated_at),
//   2. CHECK constraints on status + channel reject invalid values,
//   3. partial cron-poller index `openclaw_reminders_due_pending_idx` exists
//      with `WHERE status='pending'`,
//   4. FK to `user(id)` cascades on user delete (GDPR),
//   5. down drops table + indexes idempotently,
//   6. down → re-up restores schema.

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

const REMINDERS_COLUMNS = [
  "id",
  "founder_user_id",
  "persona",
  "topic",
  "reminder_text",
  "due_at",
  "status",
  "source_invocation_id",
  "channel",
  "attempts",
  "last_attempted_at",
  "sent_at",
  "cancelled_at",
  "metadata",
  "created_at",
  "updated_at",
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
      `[055-openclaw-reminders] Skipping: Testcontainers unavailable — ${skipReason}`,
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
  const ups = await readUpMigrations();
  await resetSchema(p);
  for (const f of ups) await execSqlFile(p, f);
}

async function listColumnsOrdered(
  p: pg.Pool,
  table: string,
): Promise<string[]> {
  const r = await p.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row) => row.column_name);
}

async function tableExists(p: pg.Pool, table: string): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1
     ) AS exists`,
    [table],
  );
  return r.rows[0]?.exists ?? false;
}

async function indexExists(p: pg.Pool, name: string): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1
     ) AS exists`,
    [name],
  );
  return r.rows[0]?.exists ?? false;
}

async function seedFounderUser(p: pg.Pool, id: string): Promise<void> {
  await p.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, 'F', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, `${id}@b`],
  );
}

describe("055_openclaw_reminders migration", () => {
  it(
    "creates the openclaw_reminders table with all expected columns",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(await tableExists(pool, "openclaw_reminders")).toBe(true);
      const cols = await listColumnsOrdered(pool, "openclaw_reminders");
      expect(cols).toEqual([...REMINDERS_COLUMNS]);
    },
    TIMEOUT_MS,
  );

  it(
    "creates partial cron-poller index with WHERE status='pending'",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(
        await indexExists(pool, "openclaw_reminders_due_pending_idx"),
      ).toBe(true);
      const r = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname='public'
           AND indexname='openclaw_reminders_due_pending_idx'`,
      );
      expect(r.rows[0]?.indexdef).toMatch(/WHERE \(status = 'pending'/);
    },
    TIMEOUT_MS,
  );

  it(
    "rejects invalid status / channel via CHECK constraint",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);
      await seedFounderUser(pool, "user_055status");

      await expect(
        pool.query(
          `INSERT INTO openclaw_reminders
             (founder_user_id, reminder_text, due_at, status)
           VALUES ('user_055status', 't', NOW() + INTERVAL '1 day', 'bogus')`,
        ),
      ).rejects.toThrow(/check constraint/i);

      await expect(
        pool.query(
          `INSERT INTO openclaw_reminders
             (founder_user_id, reminder_text, due_at, channel)
           VALUES ('user_055status', 't', NOW() + INTERVAL '1 day', 'fax')`,
        ),
      ).rejects.toThrow(/check constraint/i);
    },
    TIMEOUT_MS,
  );

  it(
    "cascades reminders on user delete (GDPR)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);
      await seedFounderUser(pool, "user_055gdpr");

      await pool.query(
        `INSERT INTO openclaw_reminders
           (founder_user_id, reminder_text, due_at)
         VALUES ('user_055gdpr', 'check runway', NOW() + INTERVAL '1 day')`,
      );

      await pool.query(`DELETE FROM "user" WHERE id = 'user_055gdpr'`);

      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM openclaw_reminders WHERE founder_user_id = 'user_055gdpr'`,
      );
      expect(r.rows[0]?.count).toBe("0");
    },
    TIMEOUT_MS,
  );

  it(
    "down migration drops table + indexes idempotently",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      await execSqlFile(pool, "055_openclaw_reminders.down.sql");
      expect(await tableExists(pool, "openclaw_reminders")).toBe(false);
      expect(
        await indexExists(pool, "openclaw_reminders_due_pending_idx"),
      ).toBe(false);

      // Idempotent: повторне виконання down не падає.
      await execSqlFile(pool, "055_openclaw_reminders.down.sql");
    },
    TIMEOUT_MS,
  );

  it(
    "down → re-up restores schema",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      await execSqlFile(pool, "055_openclaw_reminders.down.sql");
      await execSqlFile(pool, "055_openclaw_reminders.sql");

      expect(await tableExists(pool, "openclaw_reminders")).toBe(true);
      const cols = await listColumnsOrdered(pool, "openclaw_reminders");
      expect(cols).toEqual([...REMINDERS_COLUMNS]);
    },
    TIMEOUT_MS,
  );
});
