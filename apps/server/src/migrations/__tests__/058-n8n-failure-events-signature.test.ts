// Migration 058 — focused round-trip for `n8n_failure_events.error_signature`
// generated column + index (PR-15 / WF-98 alert dedup cooldown).
//
// Mirrors `055-openclaw-reminders.test.ts`: Testcontainers harness with
// soft-skip when Docker is unavailable. Asserts that:
//   1. forward migration adds `error_signature` column generated as
//      md5(left(error_message, 200)),
//   2. composite index `(workflow_id, error_signature, created_at DESC)`
//      exists for cheap cooldown lookups,
//   3. signature deterministically derives from error_message (same
//      message → same signature; differing only after 200 chars → still
//      same signature),
//   4. WF-98 dedup query (COUNT prior events in 30-min window) returns
//      expected counts,
//   5. down drops index + column idempotently,
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
      `[058-n8n-failure-events-signature] Skipping: Testcontainers unavailable — ${skipReason}`,
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

async function columnExists(
  p: pg.Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     ) AS exists`,
    [table, column],
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

describe("058_n8n_failure_events_signature migration", () => {
  it(
    "adds error_signature generated column to n8n_failure_events",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(
        await columnExists(pool, "n8n_failure_events", "error_signature"),
      ).toBe(true);

      const r = await pool.query<{
        is_generated: string;
        generation_expression: string;
      }>(
        `SELECT is_generated, generation_expression
         FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='n8n_failure_events'
           AND column_name='error_signature'`,
      );
      expect(r.rows[0]?.is_generated).toBe("ALWAYS");
      expect(r.rows[0]?.generation_expression).toMatch(/md5/);
    },
    TIMEOUT_MS,
  );

  it(
    "creates composite cooldown-lookup index (workflow_id, error_signature, created_at)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(
        await indexExists(pool, "n8n_failure_events_signature_recent_idx"),
      ).toBe(true);
      const r = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname='public'
           AND indexname='n8n_failure_events_signature_recent_idx'`,
      );
      expect(r.rows[0]?.indexdef).toMatch(
        /\(workflow_id, error_signature, created_at DESC\)/,
      );
    },
    TIMEOUT_MS,
  );

  it(
    "derives signature deterministically from first 200 chars of error_message",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      // Same message → same signature.
      await pool.query(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wf_1', 'ECONNREFUSED 127.0.0.1:5432')`,
      );
      await pool.query(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wf_2', 'ECONNREFUSED 127.0.0.1:5432')`,
      );
      const same = await pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT error_signature)::text AS count
         FROM n8n_failure_events
         WHERE error_message = 'ECONNREFUSED 127.0.0.1:5432'`,
      );
      expect(same.rows[0]?.count).toBe("1");

      // Messages that differ only past char 200 → still same signature.
      const prefix = "A".repeat(200);
      await pool.query(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wf_3', $1)`,
        [`${prefix}-tail-one`],
      );
      await pool.query(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wf_3', $1)`,
        [`${prefix}-tail-two`],
      );
      const truncated = await pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT error_signature)::text AS count
         FROM n8n_failure_events
         WHERE error_message LIKE 'AAAA%'`,
      );
      expect(truncated.rows[0]?.count).toBe("1");

      // Different messages → different signatures.
      await pool.query(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wf_4', 'ETIMEDOUT api.stripe.com')`,
      );
      const diff = await pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT error_signature)::text AS count
         FROM n8n_failure_events
         WHERE workflow_id IN ('wf_1','wf_4')`,
      );
      expect(diff.rows[0]?.count).toBe("2");
    },
    TIMEOUT_MS,
  );

  it(
    "supports WF-98 cooldown query (COUNT prior events in 30-min window)",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      // Seed: 3 events for same (workflow, signature), one outside window.
      await pool.query(
        `INSERT INTO n8n_failure_events
           (workflow_id, error_message, created_at)
         VALUES
           ('wfA', 'boom', NOW() - INTERVAL '5 minutes'),
           ('wfA', 'boom', NOW() - INTERVAL '15 minutes'),
           ('wfA', 'boom', NOW() - INTERVAL '90 minutes')`,
      );

      // Insert "current" event, mimicking RETURNING id, error_signature.
      const inserted = await pool.query<{
        id: string;
        error_signature: string;
      }>(
        `INSERT INTO n8n_failure_events (workflow_id, error_message)
         VALUES ('wfA', 'boom')
         RETURNING id, error_signature`,
      );
      const currentId = inserted.rows[0]?.id;
      const sig = inserted.rows[0]?.error_signature;
      expect(currentId).toBeDefined();
      expect(sig).toBeDefined();

      // Cooldown query — count prior events for SAME (workflow_id, signature)
      // in last 30 minutes, EXCLUDING the just-inserted row.
      const cooldown = await pool.query<{ prior_alerts: string }>(
        `SELECT COUNT(*)::text AS prior_alerts
         FROM n8n_failure_events
         WHERE workflow_id = 'wfA'
           AND error_signature = $1
           AND created_at > NOW() - INTERVAL '30 minutes'
           AND id <> $2`,
        [sig, currentId],
      );
      // 2 prior in window (5min + 15min ago); 1 outside (90min ago) excluded.
      expect(cooldown.rows[0]?.prior_alerts).toBe("2");

      // Different workflow → 0 prior (no cross-workflow dedup).
      const otherWf = await pool.query<{ prior_alerts: string }>(
        `SELECT COUNT(*)::text AS prior_alerts
         FROM n8n_failure_events
         WHERE workflow_id = 'wfB'
           AND error_signature = $1
           AND created_at > NOW() - INTERVAL '30 minutes'`,
        [sig],
      );
      expect(otherWf.rows[0]?.prior_alerts).toBe("0");
    },
    TIMEOUT_MS,
  );

  it(
    "down migration drops index + column idempotently",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      await execSqlFile(pool, "058_n8n_failure_events_signature.down.sql");
      expect(
        await indexExists(pool, "n8n_failure_events_signature_recent_idx"),
      ).toBe(false);
      expect(
        await columnExists(pool, "n8n_failure_events", "error_signature"),
      ).toBe(false);

      // Idempotent: повторне виконання down не падає.
      await execSqlFile(pool, "058_n8n_failure_events_signature.down.sql");
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

      await execSqlFile(pool, "058_n8n_failure_events_signature.down.sql");
      await execSqlFile(pool, "058_n8n_failure_events_signature.sql");

      expect(
        await columnExists(pool, "n8n_failure_events", "error_signature"),
      ).toBe(true);
      expect(
        await indexExists(pool, "n8n_failure_events_signature_recent_idx"),
      ).toBe(true);
    },
    TIMEOUT_MS,
  );
});
