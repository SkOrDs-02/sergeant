// Migration 060 — focused integration test for `n8n_webhook_events`
// (PR-28: webhook replay infrastructure).
//
// Mirrors `058-n8n-failure-events-signature.test.ts`: Testcontainers
// harness з soft-skip-ом коли Docker недоступний. Перевіряє, що:
//   1. forward migration створює таблицю з очікуваними колонками,
//   2. індекс `(workflow_id, received_at DESC)` існує,
//   3. partial-index `(received_at) WHERE processed_at IS NULL` існує,
//   4. `recordWebhookEvent` робить append-only insert і coerce-ить bigint,
//   5. retention-poller DELETE-ить рядки старші за threshold (3 days тут),
//   6. retention idempotent — повторний запуск видаляє 0 рядків,
//   7. payload-size cap кидає `PayloadTooLargeError` без INSERT-у,
//   8. down drops table + indexes, re-up відновлює schema.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import {
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  recordWebhookEvent,
} from "../../modules/webhooks/recordWebhookEvent.js";
import { WebhookEventsRetentionPoller } from "../../modules/webhooks/retentionPoller.js";

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
      `[060-n8n-webhook-events] Skipping: Testcontainers unavailable — ${skipReason}`,
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
  await resetSchema(p);
  const ups = await readUpMigrations();
  for (const f of ups) await execSqlFile(p, f);
}

async function tableExists(p: pg.Pool, table: string): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=$1
     ) AS exists`,
    [table],
  );
  return r.rows[0]?.exists ?? false;
}

async function indexDef(p: pg.Pool, name: string): Promise<string | null> {
  const r = await p.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname=$1`,
    [name],
  );
  return r.rows[0]?.indexdef ?? null;
}

describe("060_n8n_webhook_events migration", () => {
  it(
    "creates n8n_webhook_events with expected columns",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      expect(await tableExists(pool, "n8n_webhook_events")).toBe(true);

      const cols = await pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='n8n_webhook_events'
          ORDER BY ordinal_position`,
      );
      const byName = Object.fromEntries(
        cols.rows.map((r) => [r.column_name, r]),
      );
      expect(byName["id"]?.data_type).toBe("bigint");
      expect(byName["id"]?.is_nullable).toBe("NO");
      expect(byName["workflow_id"]?.data_type).toBe("text");
      expect(byName["workflow_id"]?.is_nullable).toBe("NO");
      expect(byName["source"]?.is_nullable).toBe("NO");
      expect(byName["payload"]?.data_type).toBe("jsonb");
      expect(byName["payload"]?.is_nullable).toBe("NO");
      expect(byName["headers"]?.data_type).toBe("jsonb");
      expect(byName["headers"]?.is_nullable).toBe("NO");
      expect(byName["received_at"]?.is_nullable).toBe("NO");
      expect(byName["processed_at"]?.is_nullable).toBe("YES");
      expect(byName["error"]?.is_nullable).toBe("YES");
    },
    TIMEOUT_MS,
  );

  it(
    "creates composite replay index (workflow_id, received_at DESC) and partial pending index",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const replayIdx = await indexDef(
        pool,
        "n8n_webhook_events_workflow_received_at_idx",
      );
      expect(replayIdx).not.toBeNull();
      expect(replayIdx).toMatch(/\(workflow_id, received_at DESC\)/);

      const pendingIdx = await indexDef(pool, "n8n_webhook_events_pending_idx");
      expect(pendingIdx).not.toBeNull();
      expect(pendingIdx).toMatch(/WHERE \(?processed_at IS NULL\)?/);
    },
    TIMEOUT_MS,
  );

  it(
    "recordWebhookEvent INSERTs an append-only row and coerces bigint id to number",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const out = await recordWebhookEvent(pool, {
        workflowId: "01-billing-pipeline",
        source: "stripe",
        payload: { type: "customer.subscription.created", id: "evt_1" },
        headers: {
          "content-type": "application/json",
          "x-stripe-signature-id": "sig_123",
          authorization: "Bearer should-not-be-stored",
        },
      });

      expect(typeof out.id).toBe("number");
      expect(out.id).toBeGreaterThan(0);
      expect(out.receivedAt).toBeInstanceOf(Date);

      const r = await pool.query<{
        workflow_id: string;
        source: string;
        payload: { type: string; id: string };
        headers: Record<string, string>;
        processed_at: Date | null;
        error: string | null;
      }>(
        `SELECT workflow_id, source, payload, headers, processed_at, error
           FROM n8n_webhook_events
          WHERE id = $1`,
        [out.id],
      );
      const row = r.rows[0];
      expect(row).toBeDefined();
      expect(row?.workflow_id).toBe("01-billing-pipeline");
      expect(row?.source).toBe("stripe");
      expect(row?.payload).toEqual({
        type: "customer.subscription.created",
        id: "evt_1",
      });
      expect(row?.headers).toEqual({
        "content-type": "application/json",
        "x-stripe-signature-id": "sig_123",
      });
      // Sensitive header was filtered out at the helper level — never reached the DB.
      expect(row?.headers).not.toHaveProperty("authorization");
      expect(row?.processed_at).toBeNull();
      expect(row?.error).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "retention DELETE removes rows older than threshold; second tick is idempotent",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      // Fresh row — within retention window.
      await recordWebhookEvent(pool, {
        workflowId: "06-mono-webhook-enrichment",
        source: "mono",
        payload: { account: "fresh" },
      });

      // Old row — manually backdated to 10 days ago.
      await pool.query(
        `INSERT INTO n8n_webhook_events
           (workflow_id, source, payload, received_at)
         VALUES ($1, $2, $3::jsonb, now() - interval '10 days')`,
        [
          "06-mono-webhook-enrichment",
          "mono",
          JSON.stringify({ account: "old" }),
        ],
      );

      const poller = new WebhookEventsRetentionPoller({
        pool,
        retentionDays: 3,
        intervalMs: 0,
      });

      const firstTick = await poller.runOnce();
      expect(firstTick.deleted).toBe(1);

      const remaining = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM n8n_webhook_events`,
      );
      expect(Number(remaining.rows[0]?.count)).toBe(1);

      // Idempotency: second tick deletes nothing because everything left is fresh.
      const secondTick = await poller.runOnce();
      expect(secondTick.deleted).toBe(0);
    },
    TIMEOUT_MS,
  );

  it(
    "payload-size cap rejects oversized payload without INSERT",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const before = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM n8n_webhook_events`,
      );
      const initialCount = Number(before.rows[0]?.count);

      const huge = "z".repeat(MAX_PAYLOAD_BYTES + 1);
      await expect(
        recordWebhookEvent(pool, {
          workflowId: "01-billing-pipeline",
          source: "stripe",
          payload: { blob: huge },
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeError);

      const after = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM n8n_webhook_events`,
      );
      expect(Number(after.rows[0]?.count)).toBe(initialCount);
    },
    TIMEOUT_MS,
  );

  it(
    "down migration drops table + indexes; re-up restores schema",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);
      expect(await tableExists(pool, "n8n_webhook_events")).toBe(true);

      const downSql = await fs.readFile(
        path.join(MIGRATIONS_DIR, "060_n8n_webhook_events.down.sql"),
        "utf8",
      );
      await pool.query(downSql);

      expect(await tableExists(pool, "n8n_webhook_events")).toBe(false);
      expect(
        await indexDef(pool, "n8n_webhook_events_workflow_received_at_idx"),
      ).toBeNull();
      expect(await indexDef(pool, "n8n_webhook_events_pending_idx")).toBeNull();

      // Re-apply the up migration manually (without resetting the rest of the schema).
      const upSql = await fs.readFile(
        path.join(MIGRATIONS_DIR, "060_n8n_webhook_events.sql"),
        "utf8",
      );
      await pool.query(upSql);
      expect(await tableExists(pool, "n8n_webhook_events")).toBe(true);
    },
    TIMEOUT_MS,
  );
});
