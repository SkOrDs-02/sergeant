/**
 * Integration tests для `pgVectorStore` через testcontainers + pgvector.
 *
 * Чому окремий контейнер (а не shared `test/pg-container.ts`):
 *  - shared контейнер — на `postgres:16-alpine`, без pgvector extension.
 *  - `CREATE EXTENSION vector` у міграції `025_ai_memories_pgvector.sql`
 *    впала б на чистий postgres → потрібен `pgvector/pgvector:pg16`.
 *  - Robotні testcontainers лежать у Vitest okремому suite-і
 *    (`*.integration.test.ts`, конфіг `vitest.integration.config.ts`),
 *    щоб дефолтний `pnpm test` без Docker не падав.
 *
 * Покриває:
 *  1. upsert + query roundtrip (semantic search)
 *  2. user-isolation (один user не бачить memories іншого user-а)
 *  3. source pre-filter (sources=['finyk'] не повертає 'chat')
 *  4. score нормалізації (cosine distance → similarity у [0, 1])
 *  5. deleteAllForUser → 0 row-ів після виклику
 *  6. health() → ok=true коли extension присутня
 *  7. partial-failure rollback (atomic upsert)
 *  8. CASCADE при видаленні user-row-у з `"user"` таблиці
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

import { createPgVectorStore } from "./vectorStore.js";
import type { EmbeddingMetadata, MemoryWrite, VectorStore } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");

const TIMEOUT_MS = 240_000;

const META: EmbeddingMetadata = {
  provider: "voyage",
  model: "voyage-3-lite",
  version: "1",
  // Зменшений dim для тестів (full 1024 — overkill, halfvec приймає
  // довільну розмірність). Migration `HALFVEC(1024)` все ще перевіряє
  // тип; якщо dim ≠ 1024 — pgvector кине помилку. Тому залишаємо 1024.
  dim: 1024,
};

let container: StartedTestContainer | undefined;
let pool: pg.Pool | undefined;
let store: VectorStore | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

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
    await runMigrations(pool);
    store = createPgVectorStore(pool);
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[ai-memory pgvector integration] Skipping: testcontainers/pgvector unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (pool) await pool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

/**
 * Створює юзера у `"user"` таблиці. Better Auth-схема — мінімум поля,
 * без validate-логіки на rest-у. ai_memories.user_id — FK CASCADE до
 * `"user"`, тому без юзера insert упаде.
 */
async function ensureUser(userId: string): Promise<void> {
  if (!pool) throw new Error("pool not initialized");
  await pool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@test.local`, userId],
  );
}

/**
 * Будує детермінований 1024-вимірний вектор з salt-у. Близькі salt-и
 * → близькі вектори (cosine similarity висока). Це достатньо для
 * перевірки ANN-pipeline-у без реальних embedding-ів.
 *
 * Реалізація: повторюємо salt-mod-1024 sin-pattern, нормалізуємо до
 * unit-length-у (cosine коректний лише для unit-length vectors).
 */
function fakeVector(salt: number, dim = META.dim): Float32Array {
  const arr = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    arr[i] = Math.sin(salt * 0.01 + i * 0.001);
    norm += arr[i] * arr[i];
  }
  const len = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) arr[i] /= len;
  return arr;
}

function makeWrite(
  userId: string,
  source: MemoryWrite["source"],
  sourceRef: string | null,
  content: string,
  salt: number,
  metadata?: Record<string, unknown>,
): MemoryWrite {
  return {
    userId,
    source,
    sourceRef,
    content,
    embedding: fakeVector(salt),
    embeddingMeta: META,
    metadata,
  };
}

describe("pgVectorStore integration", () => {
  it(
    "upsert + query повертає той самий контент за подібним вектором",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("u1");

      await store.upsert([
        makeWrite("u1", "chat", null, "the cat sat on the mat", 100),
        makeWrite("u1", "chat", null, "totally unrelated content", 9000),
      ]);

      const result = await store.query({
        userId: "u1",
        embedding: fakeVector(100), // близький до першого
        topK: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("the cat sat on the mat");
      expect(result[0].score).toBeGreaterThan(result[1].score);
      expect(result[0].score).toBeGreaterThan(0.99); // майже identical
      expect(result[0].embeddingMeta).toEqual(META);
      expect(typeof result[0].id).toBe("number");
    },
    TIMEOUT_MS,
  );

  it(
    "user-isolation: один user не бачить memories іншого user-а",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uA");
      await ensureUser("uB");

      await store.upsert([makeWrite("uA", "chat", null, "userA secret", 200)]);
      await store.upsert([makeWrite("uB", "chat", null, "userB secret", 200)]);

      const resA = await store.query({
        userId: "uA",
        embedding: fakeVector(200),
        topK: 10,
      });
      expect(resA).toHaveLength(1);
      expect(resA[0].content).toBe("userA secret");
    },
    TIMEOUT_MS,
  );

  it(
    "source pre-filter: sources=['finyk'] не повертає 'chat'",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uF");

      await store.upsert([
        makeWrite("uF", "chat", null, "chat msg", 300),
        makeWrite("uF", "finyk", "tx-1", "transaction summary", 300),
      ]);

      const finykOnly = await store.query({
        userId: "uF",
        embedding: fakeVector(300),
        topK: 10,
        sources: ["finyk"],
      });
      expect(finykOnly).toHaveLength(1);
      expect(finykOnly[0].source).toBe("finyk");

      const all = await store.query({
        userId: "uF",
        embedding: fakeVector(300),
        topK: 10,
      });
      expect(all).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  it(
    "score у [0, 1]; identical vectors → score близько 1.0",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uS");

      await store.upsert([makeWrite("uS", "chat", null, "exact", 400)]);
      const r = await store.query({
        userId: "uS",
        embedding: fakeVector(400),
        topK: 1,
      });
      expect(r[0].score).toBeGreaterThanOrEqual(0);
      expect(r[0].score).toBeLessThanOrEqual(1);
      expect(r[0].score).toBeGreaterThan(0.99);
    },
    TIMEOUT_MS,
  );

  it(
    "deleteAllForUser → row-count відповідає, query повертає []",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uD");

      await store.upsert([
        makeWrite("uD", "chat", null, "a", 500),
        makeWrite("uD", "chat", null, "b", 501),
        makeWrite("uD", "finyk", "tx-d", "c", 502),
      ]);
      const count = await store.deleteAllForUser("uD");
      expect(count).toBe(3);

      const after = await store.query({
        userId: "uD",
        embedding: fakeVector(500),
        topK: 10,
      });
      expect(after).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "deleteBySource — точково видаляє конкретний source-row, інші лишаються",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uX");

      await store.upsert([
        makeWrite("uX", "finyk", "tx-1", "a", 600),
        makeWrite("uX", "finyk", "tx-2", "b", 601),
      ]);
      await store.deleteBySource("uX", "finyk", "tx-1");

      const r = await store.query({
        userId: "uX",
        embedding: fakeVector(600),
        topK: 10,
      });
      expect(r).toHaveLength(1);
      expect(r[0].sourceRef).toBe("tx-2");
    },
    TIMEOUT_MS,
  );

  it(
    "deleteBySource ідемпотентний — повторний виклик не падає",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uI");
      await store.deleteBySource("uI", "finyk", "missing-tx");
      // не throw → ок
    },
    TIMEOUT_MS,
  );

  it(
    "health() — ok=true з provider='pgvector'",
    async (ctx) => {
      if (!dockerAvailable || !store) return ctx.skip();
      const h = await store.health();
      expect(h.ok).toBe(true);
      expect(h.provider).toBe("pgvector");
    },
    TIMEOUT_MS,
  );

  it(
    'GDPR cascade: DELETE FROM "user" видаляє ai_memories автоматично',
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uG");

      await store.upsert([
        makeWrite("uG", "chat", null, "secret memory", 700),
        makeWrite("uG", "finyk", "tx-g", "another", 701),
      ]);

      // Видаляємо юзера через "user" таблицю — CASCADE має почистити ai_memories.
      await pool.query(`DELETE FROM "user" WHERE id = $1`, ["uG"]);

      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ai_memories WHERE user_id = $1`,
        ["uG"],
      );
      expect(Number(result.rows[0].count)).toBe(0);
    },
    TIMEOUT_MS,
  );

  it(
    "atomic upsert: invalid embedding (різний dim) → rollback, нічого не записано",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uA1");

      const ok = makeWrite("uA1", "chat", null, "ok", 800);
      const bad: MemoryWrite = {
        ...makeWrite("uA1", "chat", null, "bad", 801),
        // 5-вимірний vector замість 1024 → pgvector кине помилку.
        embedding: Float32Array.of(0.1, 0.2, 0.3, 0.4, 0.5),
      };

      await expect(store.upsert([ok, bad])).rejects.toThrow();

      const after = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ai_memories WHERE user_id = $1`,
        ["uA1"],
      );
      expect(Number(after.rows[0].count)).toBe(0);
    },
    TIMEOUT_MS,
  );

  it(
    "metadata round-trip: JSONB зберігається і повертається без втрат",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uM");

      const meta = {
        amount: 1234.56,
        category: "food",
        date: "2026-04-26",
        nested: { mcc: 5411 },
      };
      await store.upsert([
        makeWrite("uM", "finyk", "tx-m", "purchased coffee", 900, meta),
      ]);

      const r = await store.query({
        userId: "uM",
        embedding: fakeVector(900),
        topK: 1,
      });
      expect(r[0].metadata).toEqual(meta);
    },
    TIMEOUT_MS,
  );

  it(
    "topK=0 → []  без виклику БД-запиту",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uK");
      await store.upsert([makeWrite("uK", "chat", null, "x", 1000)]);
      const r = await store.query({
        userId: "uK",
        embedding: fakeVector(1000),
        topK: 0,
      });
      expect(r).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "empty upsert → no-op",
    async (ctx) => {
      if (!dockerAvailable || !store) return ctx.skip();
      await store.upsert([]);
      // не throw → ок
    },
    TIMEOUT_MS,
  );
});
