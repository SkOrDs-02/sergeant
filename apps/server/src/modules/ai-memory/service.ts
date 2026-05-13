/**
 * Facade навколо `EmbeddingProvider` + `VectorStore`. Цей модуль —
 * єдиний entry-point для callers (PR2 ingestion + PR3 retrieval); ніхто
 * крім тестів не викликає `vectorStore`/`embeddings` напряму. Так
 * можна:
 *  1) міняти embedding-провайдера централізовано (Voyage → Cohere);
 *  2) міняти store централізовано (pgvector → Turbopuffer);
 *  3) додати cross-cutting concerns (retry-budget, telemetry, audit)
 *     без зачеплення caller-ів.
 *
 * У foundation-PR (цей) методи `remember()` / `recall()` поверrtaють
 * відразу, якщо `AI_MEMORY_ENABLED=false`. Це навмисна no-op-семантика:
 * PR2 включає прапор разом з ingestion-hooks; до того chat-flow не
 * має шансу випадково записати/прочитати щось.
 */

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import type {
  EmbeddingProvider,
  MemoryQueryResult,
  MemorySource,
  VectorStore,
} from "./types.js";
import { VoyageSoftBudgetExceededError } from "./voyageBudgetError.js";
import { isVoyageBudgetHardExceeded } from "./voyageBudget.js";

/**
 * Параметри запису одного memory. Caller передає сирий `content`;
 * embedding робить service.
 */
export interface RememberInput {
  userId: string;
  source: MemorySource;
  sourceRef: string | null;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Параметри retrieval. `query` — текст, який буде embed-нутий і
 * шуканий по similarity.
 */
export interface RecallInput {
  userId: string;
  query: string;
  topK?: number | undefined;
  sources?: MemorySource[] | undefined;
}

export interface AiMemoryService {
  /**
   * Записує batch memory. Атомарно (один транзакційний INSERT).
   * Якщо `AI_MEMORY_ENABLED=false` — no-op (повертається без виклику
   * embedding-провайдера / БД).
   */
  remember(inputs: RememberInput[]): Promise<void>;

  /**
   * Читає top-K схожих memory одного юзера. Якщо
   * `AI_MEMORY_ENABLED=false` — повертає [] без виклику провайдера/БД.
   */
  recall(input: RecallInput): Promise<MemoryQueryResult[]>;

  /** Hard-delete всіх memory користувача (GDPR). */
  forgetUser(userId: string): Promise<number>;

  /** Hard-delete конкретного source-row-у. */
  forgetSource(
    userId: string,
    source: MemorySource,
    sourceRef: string,
  ): Promise<void>;
}

interface CreateAiMemoryServiceDeps {
  embeddings: EmbeddingProvider;
  vectorStore: VectorStore;
  /**
   * Override `enabled` flag для тестів. Default — `env.AI_MEMORY_ENABLED`.
   * У production не передавай — тут флаг має один source-of-truth.
   */
  enabled?: boolean;
}

export function createAiMemoryService(
  deps: CreateAiMemoryServiceDeps,
): AiMemoryService {
  const enabled = deps.enabled ?? env.AI_MEMORY_ENABLED;

  return {
    async remember(inputs: RememberInput[]): Promise<void> {
      if (!enabled) {
        logger.debug({
          msg: "ai_memory_remember_skipped_disabled",
          count: inputs.length,
        });
        return;
      }
      if (inputs.length === 0) return;

      // Voyage hard daily budget pause-ingestion гейт. Якщо `VOYAGE_DAILY_BUDGET_USD_HARD`
      // вже відстрелявся сьогодні — skip-аємо embed-call ще до `embedBatch()`,
      // щоб не витрачати Voyage-квоту і не дублювати alert-и. Sentry-error
      // уже відправлений у `voyageBudget.ts::maybeFireHardAlert`. На
      // day-rollover flag скидається автоматично.
      if (isVoyageBudgetHardExceeded()) {
        logger.warn({
          msg: "ai_memory_remember_skipped_hard_budget",
          count: inputs.length,
          sources: inputs.map((i) => i.source),
        });
        return;
      }

      const texts = inputs.map((i) => i.content);
      let embeddings: Float32Array[];
      try {
        // PR-38 — background ingestion (digest / mono webhook / RAG-prep)
        // позначаємо як non-critical, щоб overflow `VOYAGE_DAILY_BUDGET_USD_SOFT`
        // skip-ав батч без BullMQ-retry-storm-у. `recall` лишається critical.
        embeddings = await deps.embeddings.embedBatch(texts, {
          criticality: "non-critical",
        });
      } catch (err) {
        if (err instanceof VoyageSoftBudgetExceededError) {
          // Idempotent Sentry warning уже відправлений у voyageBudget.ts.
          // Тут логуємо skip-фактаж по sources — operator-у важливо
          // знати, котрі ingestion-source-и нагрівали soft-cap.
          logger.warn({
            msg: "ai_memory_remember_skipped_soft_budget",
            count: inputs.length,
            sources: inputs.map((i) => i.source),
            usage_usd: err.usage,
            threshold_usd: err.threshold,
            day_key: err.dayKey,
          });
          return;
        }
        throw err;
      }
      if (embeddings.length !== inputs.length) {
        throw new Error(
          `Embedding provider returned ${embeddings.length} vectors for ${inputs.length} inputs`,
        );
      }

      await deps.vectorStore.upsert(
        inputs.map((input, i) => ({
          userId: input.userId,
          source: input.source,
          sourceRef: input.sourceRef,
          content: input.content,
          embedding: embeddings[i]!,
          embeddingMeta: deps.embeddings.meta,
          metadata: input.metadata,
        })),
      );
    },

    async recall(input: RecallInput): Promise<MemoryQueryResult[]> {
      if (!enabled) {
        logger.debug({ msg: "ai_memory_recall_skipped_disabled" });
        return [];
      }
      const topK = input.topK ?? env.AI_MEMORY_TOP_K;
      if (topK <= 0) return [];

      const [embedding] = await deps.embeddings.embedBatch([input.query]);
      if (!embedding) {
        throw new Error("Embedding provider returned empty result for query");
      }

      return deps.vectorStore.query({
        userId: input.userId,
        embedding,
        topK,
        sources: input.sources,
      });
    },

    async forgetUser(userId: string): Promise<number> {
      // GDPR cascade: нагадуємо, що `ai_memories.user_id` має ON DELETE
      // CASCADE до `"user"(id)`, тому Better Auth user-delete вже
      // видаляє row-и автоматично. Цей метод — escape-hatch для
      // внутрішніх admin-tools / тестів. Виклик безпечний навіть
      // якщо AI memory disabled (просто видалить row-и якщо вони є).
      return deps.vectorStore.deleteAllForUser(userId);
    },

    async forgetSource(
      userId: string,
      source: MemorySource,
      sourceRef: string,
    ): Promise<void> {
      await deps.vectorStore.deleteBySource(userId, source, sourceRef);
    },
  };
}
