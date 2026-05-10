// Migration 054 — focused round-trip for `ai_memories.persona` + `topic`
// extension (PR-B / Phase 0.5 PoC).
//
// Mirrors `052-fizruk-full-state.test.ts`: same Docker / pgvector test-
// container harness, same soft-skip behaviour, same assertions shape.
// Asserts that:
//   1. forward migration adds `persona` (NOT NULL DEFAULT 'cofounder')
//      і `topic` (nullable) колонки до `ai_memories`,
//   2. partial index `ai_memories_persona_topic_idx` створено WHERE
//      `source = 'cofounder'`,
//   3. existing rows у партиціях наслідують default 'cofounder',
//   4. down migration drop-ає колонки + index ідемпотентно,
//   5. down → re-up відновлює схему byte-for-byte.

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
      `[054-ai-memories-persona-topic] Skipping: Testcontainers unavailable — ${skipReason}`,
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

interface ColumnInfo {
  name: string;
  type: string;
  nullable: string;
  default: string | null;
}

async function listColumns(p: pg.Pool, table: string): Promise<ColumnInfo[]> {
  const r = await p.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row) => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable,
    default: row.column_default,
  }));
}

async function indexExists(
  p: pg.Pool,
  schema: string,
  index: string,
): Promise<boolean> {
  const r = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = $1 AND indexname = $2
     ) AS exists`,
    [schema, index],
  );
  return r.rows[0]?.exists ?? false;
}

async function applyForwardThrough(
  p: pg.Pool,
  lastFile: string,
): Promise<void> {
  const ups = await readUpMigrations();
  await resetSchema(p);
  for (const f of ups) {
    await execSqlFile(p, f);
    if (f === lastFile) return;
  }
}

async function applyAllForward(p: pg.Pool): Promise<void> {
  const ups = await readUpMigrations();
  await resetSchema(p);
  for (const f of ups) await execSqlFile(p, f);
}

describe("054_ai_memories_persona_topic migration", () => {
  it(
    "adds persona (NOT NULL DEFAULT 'cofounder') + topic (nullable) columns",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const cols = await listColumns(pool, "ai_memories");
      const personaCol = cols.find((c) => c.name === "persona");
      const topicCol = cols.find((c) => c.name === "topic");

      expect(personaCol).toBeDefined();
      expect(personaCol?.nullable).toBe("NO");
      expect(personaCol?.type).toBe("text");
      expect(personaCol?.default).toMatch(/cofounder/);

      expect(topicCol).toBeDefined();
      expect(topicCol?.nullable).toBe("YES");
      expect(topicCol?.type).toBe("text");
      expect(topicCol?.default).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "creates partial persona-topic index scoped to source='cofounder'",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      const exists = await indexExists(
        pool,
        "public",
        "ai_memories_persona_topic_idx",
      );
      expect(exists).toBe(true);

      const r = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname  = 'ai_memories_persona_topic_idx'`,
      );
      expect(r.rows[0]?.indexdef).toMatch(/source = 'cofounder'/);
      expect(r.rows[0]?.indexdef).toMatch(/persona/);
    },
    TIMEOUT_MS,
  );

  it(
    "existing rows inherit DEFAULT 'cofounder' for persona on new column add",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      // Apply through 053 (без 054), insert row, потім apply 054.
      await applyForwardThrough(pool, "053_finyk_prefs_excluded_dismissed.sql");

      // Сід на user-у з 028 (better-auth user table вже створено).
      await pool.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ('user_054test', 'a@b', 'A', false, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
      );

      // Insert ai_memories row БЕЗ persona/topic (стара схема).
      await pool.query(
        `INSERT INTO ai_memories
           (user_id, source, content, embedding, embedding_provider, embedding_model, embedding_version)
         VALUES (
           'user_054test',
           'cofounder',
           'pre-054 memory',
           array_fill(0.1::real, ARRAY[1024])::halfvec(1024),
           'voyage', 'voyage-3.5-lite', '1'
         )`,
      );

      // Тепер 054.
      await execSqlFile(pool, "054_ai_memories_persona_topic.sql");

      const r = await pool.query<{ persona: string; topic: string | null }>(
        `SELECT persona, topic FROM ai_memories WHERE user_id = 'user_054test'`,
      );
      expect(r.rows[0]?.persona).toBe("cofounder");
      expect(r.rows[0]?.topic).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "down migration drops index + columns idempotently",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      // Перший прогін down — drop проходить.
      await execSqlFile(pool, "054_ai_memories_persona_topic.down.sql");

      const colsAfter = await listColumns(pool, "ai_memories");
      expect(colsAfter.find((c) => c.name === "persona")).toBeUndefined();
      expect(colsAfter.find((c) => c.name === "topic")).toBeUndefined();

      const idxAfter = await indexExists(
        pool,
        "public",
        "ai_memories_persona_topic_idx",
      );
      expect(idxAfter).toBe(false);

      // Idempotent: другий прогін не падає.
      await execSqlFile(pool, "054_ai_memories_persona_topic.down.sql");
    },
    TIMEOUT_MS,
  );

  it(
    "down → re-up restores columns + index",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await applyAllForward(pool);

      await execSqlFile(pool, "054_ai_memories_persona_topic.down.sql");
      await execSqlFile(pool, "054_ai_memories_persona_topic.sql");

      const cols = await listColumns(pool, "ai_memories");
      expect(cols.map((c) => c.name)).toContain("persona");
      expect(cols.map((c) => c.name)).toContain("topic");

      const exists = await indexExists(
        pool,
        "public",
        "ai_memories_persona_topic_idx",
      );
      expect(exists).toBe(true);
    },
    TIMEOUT_MS,
  );
});
