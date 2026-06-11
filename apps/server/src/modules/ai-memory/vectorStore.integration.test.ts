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

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
  model: "voyage-3.5-lite",
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
    // In CI Docker MUST be available — a silent skip would green-light the job.
    if (process.env["CI"]) throw e;
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
    norm += arr[i]! * arr[i]!;
  }
  const len = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) arr[i]! /= len;
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
      expect(result[0]!.content).toBe("the cat sat on the mat");
      expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
      expect(result[0]!.score).toBeGreaterThan(0.99); // майже identical
      expect(result[0]!.embeddingMeta).toEqual(META);
      expect(typeof result[0]!.id).toBe("number");
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
      expect(resA[0]!.content).toBe("userA secret");
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
      expect(finykOnly[0]!.source).toBe("finyk");

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
      expect(r[0]!.score).toBeGreaterThanOrEqual(0);
      expect(r[0]!.score).toBeLessThanOrEqual(1);
      expect(r[0]!.score).toBeGreaterThan(0.99);
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
      expect(r[0]!.sourceRef).toBe("tx-2");
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
      expect(Number(result!.rows[0]!.count)).toBe(0);
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
      expect(Number(after!.rows[0]!.count)).toBe(0);
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
      expect(r[0]!.metadata).toEqual(meta);
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

  it(
    "PR-24 active-model filter: query не повертає рядки з іншою embedding_model",
    async (ctx) => {
      if (!dockerAvailable || !store || !pool) return ctx.skip();
      await pool.query("TRUNCATE ai_memories");
      await ensureUser("uMdl");

      // Вставляємо два рядки вручну: один з активною моделлю (voyage-3.5-lite),
      // другий — з синтетичною «old» моделлю (openai-3-large). Direct INSERT
      // обходить store.upsert, щоб обійти embeddingMeta від META та вставити
      // довільне значення embedding_model.
      await pool.query(
        `INSERT INTO ai_memories
           (user_id, source, source_ref, content, embedding,
            embedding_provider, embedding_model, embedding_version, metadata)
         VALUES
           ($1, 'chat', NULL, $2, $3::halfvec, 'voyage', 'voyage-3.5-lite',   '1', '{}'),
           ($1, 'chat', NULL, $4, $5::halfvec, 'openai', 'openai-3-large',    '1', '{}')`,
        [
          "uMdl",
          "active model content",
          // Ідентичний вектор для обох — щоб distance-rank не впливав:
          `[${Array.from(fakeVector(42)).join(",")}]`,
          "other model content",
          `[${Array.from(fakeVector(42)).join(",")}]`,
        ],
      );

      // store.query використовує env.VOYAGE_EMBEDDING_MODEL = 'voyage-3.5-lite'
      // → повинен повернути лише перший рядок.
      const results = await store.query({
        userId: "uMdl",
        embedding: fakeVector(42),
        topK: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("active model content");
      expect(results[0]!.embeddingMeta.model).toBe("voyage-3.5-lite");
    },
    TIMEOUT_MS,
  );
});

// ── Unit-level SQL predicate assertion (завжди виконується, Docker не потрібен) ──
//
// Перевіряємо, що vectorStore.query будує WHERE з `embedding_model = $N`
// і правильно передає env.VOYAGE_EMBEDDING_MODEL як bound-param. Це
// гарантує, що фільтр буде присутній навіть без testcontainers-середовища.
describe("pgVectorStore query SQL — active-model predicate (unit)", () => {
  it("query SQL містить embedding_model = $N і передає VOYAGE_EMBEDDING_MODEL як параметр", async () => {
    // Зберігаємо та встановлюємо env для ізоляції тесту.
    const savedModel = process.env["VOYAGE_EMBEDDING_MODEL"];
    process.env["VOYAGE_EMBEDDING_MODEL"] = "voyage-3.5-lite";

    try {
      // Будуємо mock-pool, що захоплює запити і повертає порожній result.
      const capturedQueries: Array<{ text: string; values: unknown[] }> = [];
      const mockClient = {
        query: vi
          .fn()
          .mockImplementation(
            (
              textOrObj: string | { text: string; values?: unknown[] },
              values?: unknown[],
            ) => {
              if (typeof textOrObj === "string") {
                const isSelect = /^\s*SELECT/i.test(textOrObj);
                if (isSelect) {
                  capturedQueries.push({
                    text: textOrObj,
                    values: values ?? [],
                  });
                  return Promise.resolve({ rows: [] });
                }
                // BEGIN / COMMIT / SET LOCAL — no-op
                return Promise.resolve({ rows: [] });
              }
              return Promise.resolve({ rows: [] });
            },
          ),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      // Динамічний import потрібен щоб env-singleton підхопив нове значення.
      const { createPgVectorStore } = await import("./vectorStore.js");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock pool не відповідає повному pg.Pool interface
      const testStore = createPgVectorStore(mockPool as any);

      await testStore.query({
        userId: "u-unit",
        embedding: fakeVector(1),
        topK: 5,
      });

      expect(capturedQueries).toHaveLength(1);
      const captured = capturedQueries[0]!;

      // Перевіряємо наявність предиката в SQL.
      expect(captured.text).toMatch(/embedding_model\s*=\s*\$\d+/);

      // Перевіряємо, що значення активної моделі присутнє у bound-params.
      expect(captured.values).toContain("voyage-3.5-lite");
    } finally {
      if (savedModel === undefined) {
        delete process.env["VOYAGE_EMBEDDING_MODEL"];
      } else {
        process.env["VOYAGE_EMBEDDING_MODEL"] = savedModel;
      }
    }
  });
});
