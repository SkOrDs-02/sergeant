/**
 * pgvector реалізація `VectorStore`. Працює з таблицею `ai_memories`
 * (міграція 025), HALFVEC(1024) + HNSW + hash-партиціонування.
 *
 * Контракт у `types.ts → VectorStore`. Тут — single conccrete impl.
 *
 * Notes:
 *  - bigint у pg-driver-і повертається як string. Коеrcимо у `number`
 *    у serializer (rule #1, AGENTS.md). Стовпчик `id` BIGSERIAL,
 *    тому JS-side завжди бачимо `Number(row.id)`.
 *  - `halfvec` та `vector` мають однаковий wire-format-стрічний
 *    `[x, y, z, ...]`. pgvector сам каст-ить literals → halfvec при
 *    INSERT.
 *  - Cosine distance у pgvector — `<=>` оператор. distance ∈ [0, 2],
 *    similarity = 1 - distance/2 ∈ [0, 1] (для нормалізованих
 *    вeкторів — completely-equivalent з cosine similarity).
 */

import type pg from "pg";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import type {
  MemoryQueryOptions,
  MemoryQueryResult,
  MemorySource,
  MemoryWrite,
  VectorStore,
} from "./types.js";

/**
 * Серіалізує Float32Array у формат, який pgvector приймає у літералі:
 * `'[0.1,0.2,0.3]'`. NaN / Infinity не валідні (Voyage їх не
 * повертає, але safety check захищає від будь-яких артефактів).
 */
function serializeEmbedding(vec: Float32Array): string {
  const parts: string[] = [];
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    if (!Number.isFinite(v)) {
      throw new Error(
        `Embedding contains non-finite value at index ${i}: ${v}`,
      );
    }
    parts.push(v.toString());
  }
  return `[${parts.join(",")}]`;
}

/**
 * Валідує `userId` перед SQL-параметризацією. Better Auth `user.id`
 * — ULID (26 chars, alphanumeric). Сторонні значення можуть з'явитись
 * з тестів або кривих міграцій. Якщо userId порожній — ANN-запит
 * без partition-key крутить весь HNSW (тобто на ~1M рядках — катастрофа).
 */
function assertNonEmptyUserId(userId: string): void {
  if (!userId || userId.length === 0) {
    throw new Error("userId is required for vector store operations");
  }
}

interface PgVectorRow {
  id: string;
  source: string;
  source_ref: string | null;
  content: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_version: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  distance: string | number;
}

function rowToResult(row: PgVectorRow): MemoryQueryResult {
  const distance =
    typeof row.distance === "string" ? Number(row.distance) : row.distance;
  // Cosine distance ∈ [0, 2]; similarity = 1 - distance/2 ∈ [0, 1].
  const score = Math.max(0, Math.min(1, 1 - distance / 2));

  return {
    id: Number(row.id),
    source: row.source as MemorySource,
    sourceRef: row.source_ref,
    content: row.content,
    embeddingMeta: {
      provider: row.embedding_provider,
      model: row.embedding_model,
      version: row.embedding_version,
      dim: env.VOYAGE_EMBEDDING_DIM,
    },
    metadata: row.metadata ?? {},
    score,
    createdAt: row.created_at,
  };
}

/**
 * Створює pgvector-store, привʼязаний до конкретного `pg.Pool`.
 * У production — global pool з `db.ts`; у тестах — pool, що
 * вказує на testcontainer.
 */
export function createPgVectorStore(pool: pg.Pool): VectorStore {
  return {
    async upsert(input: MemoryWrite[]): Promise<void> {
      if (input.length === 0) return;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Один SQL, мульти-row INSERT через UNNEST для performance.
        // Без UNNEST — N окремих INSERT-ів, кожен з round-trip-ом.
        // На 32-batch-у це ~50 мс vs ~500 мс.
        //
        // Конфлікт unique (user_id, source, source_ref) → ON CONFLICT
        // не використовуємо: партиція не має unique-constraint-у на
        // ці 3 стовпці (PARTITION BY HASH дозволяє лише через PK).
        // Замість — caller відповідальний за unique-логіку (PR2:
        // queue-row має idempotency-key).
        const placeholders: string[] = [];
        const values: unknown[] = [];
        let idx = 1;
        for (const row of input) {
          assertNonEmptyUserId(row.userId);
          placeholders.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::halfvec, $${idx++}, $${idx++}, $${idx++}, $${idx++}::jsonb)`,
          );
          values.push(
            row.userId,
            row.source,
            row.sourceRef,
            row.content,
            serializeEmbedding(row.embedding),
            row.embeddingMeta.provider,
            row.embeddingMeta.model,
            row.embeddingMeta.version,
            JSON.stringify(row.metadata ?? {}),
          );
        }

        const sql = `
          INSERT INTO ai_memories (
            user_id, source, source_ref, content,
            embedding,
            embedding_provider, embedding_model, embedding_version,
            metadata
          ) VALUES ${placeholders.join(", ")}
        `;

        await client.query(sql, values);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
          /* nested rollback failure — original error wins */
        });
        throw error;
      } finally {
        client.release();
      }
    },

    async query(opts: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
      assertNonEmptyUserId(opts.userId);
      if (opts.topK <= 0) return [];

      const client = await pool.connect();
      try {
        // ef_search per-session — впливає лише на цей конект.
        // SET LOCAL обмежує scope до транзакції; без транзакції
        // SET LOCAL — no-op, тому BEGIN.
        await client.query("BEGIN");
        const efSearch = opts.efSearch ?? env.AI_MEMORY_HNSW_EF_SEARCH;
        await client.query(
          `SET LOCAL hnsw.ef_search = ${Math.floor(efSearch)}`,
        );

        const params: unknown[] = [
          opts.userId,
          serializeEmbedding(opts.embedding),
          opts.topK,
        ];
        let where = `user_id = $1`;
        if (opts.sources && opts.sources.length > 0) {
          // Source enum — guard-нутий у CHECK constraint, тож параметрицькі
          // значення безпечні. Використовуємо ANY($N::text[]) для
          // динамічного списку без string-concat-у.
          params.push(opts.sources);
          where += ` AND source = ANY($${params.length}::text[])`;
        }

        const sql = `
          SELECT
            id,
            source,
            source_ref,
            content,
            embedding_provider,
            embedding_model,
            embedding_version,
            metadata,
            created_at,
            embedding <=> $2::halfvec AS distance
          FROM ai_memories
          WHERE ${where}
          ORDER BY embedding <=> $2::halfvec
          LIMIT $3
        `;

        const result = await client.query<PgVectorRow>(sql, params);
        await client.query("COMMIT");

        return result.rows.map(rowToResult);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
          /* swallow */
        });
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteBySource(
      userId: string,
      source: MemorySource,
      sourceRef: string,
    ): Promise<void> {
      assertNonEmptyUserId(userId);
      await pool.query(
        `DELETE FROM ai_memories
         WHERE user_id = $1 AND source = $2 AND source_ref = $3`,
        [userId, source, sourceRef],
      );
    },

    async deleteAllForUser(userId: string): Promise<number> {
      assertNonEmptyUserId(userId);
      const result = await pool.query(
        `DELETE FROM ai_memories WHERE user_id = $1`,
        [userId],
      );
      return result.rowCount ?? 0;
    },

    async health(): Promise<{ ok: boolean; provider: "pgvector" }> {
      try {
        const result = await pool.query<{ has_vector: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM pg_extension WHERE extname = 'vector'
           ) AS has_vector`,
        );
        return {
          ok: result.rows[0]?.has_vector === true,
          provider: "pgvector",
        };
      } catch (error) {
        logger.warn({
          msg: "ai_memory_pgvector_health_failed",
          error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, provider: "pgvector" };
      }
    },
  };
}
