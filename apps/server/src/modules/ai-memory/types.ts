/**
 * Public types для AI memory модуля. Стабільний контракт, на який
 * спираються майбутні PR-и (ingestion + retrieval). Зокрема, типи
 * `MemoryWrite` і `MemoryQueryResult` навмисно — vector-store-agnostic
 * (без посилань на pgvector / Postgres), щоб майбутня міграція на
 * Turbopuffer / Qdrant не зачіпала callers.
 *
 * Notes: bigint у Postgres → коеrcимо у `number` у serializer (rule
 * #1, AGENTS.md). У pg-driver `BIGSERIAL` повертається як string — у
 * `pgVectorStore.ts` парсимо через `Number(row.id)` перед поверненням.
 */

/**
 * Доменний source memory. Мап-се на `source` стовпчик у SQL-таблиці
 * `ai_memories` (CHECK constraint у `025_ai_memories_pgvector.sql`).
 *
 * Не "open string" навмисно: CHECK-constraint у БД і union-type у TS
 * мають співпадати. Додавання нового source-у — двофазне:
 *  1. PR що бампить ALLOWED_SOURCES + relax-ить CHECK-constraint.
 *  2. PR що додає ingestion-hook для нового source-у.
 */
export const ALLOWED_MEMORY_SOURCES = [
  "chat",
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
  "journal",
  "digest",
  "cofounder",
  // Migration 068 — PostHog → AI memory sync (PR-24). Behavioral product
  // events (`onboarding_completed`, `first_action_completed`,
  // `subscription_started`, `activation_v2_hit`) дзеркаляться як
  // structured text-rows. Strict-isolation: `recall_memory` openclaw tool
  // лишається на `sources=['cofounder']`; combined recall — через
  // `POST /api/ai-memory/recall` з явним `sources=['cofounder','product']`.
  "product",
] as const;

export type MemorySource = (typeof ALLOWED_MEMORY_SOURCES)[number];

/**
 * Метадані embedд'ингу — записуються у row, щоб майбутній re-embed
 * batch міг знайти всі rows конкретної (provider, model, version)
 * комбінації. Без цього вектор-spaces різних моделей перемішуються
 * у HNSW і recall провалюється.
 */
export interface EmbeddingMetadata {
  /** Провайдер (наприклад, "voyage"). */
  provider: string;
  /** Конкретна модель (наприклад, "voyage-3.5-lite"). */
  model: string;
  /** Internal semver embedding-схеми (наприклад, "1"). */
  version: string;
  /** Розмірність вектора (наприклад, 1024). Для дебагу partial-batch issue-ів. */
  dim: number;
}

/**
 * Запис у memory store. Caller передає content + metadata; embedding
 * генерується сервісом (`AiMemoryService.remember`). VectorStore сам
 * по собі embedд'ингу не робить.
 */
export interface MemoryWrite {
  userId: string;
  source: MemorySource;
  /**
   * Зовнішній id з домена. Для `source='finyk'` — mono_tx_id; для
   * 'digest' — week_key (`'2026-W18'`); для 'chat' — null. Унікальний
   * per (user_id, source); upsert-семантика дозволяє оновлювати запис
   * без додавання дубля.
   */
  sourceRef: string | null;
  /** Оригінальний текст memory (для re-embedding + human-debug). */
  content: string;
  /** Embedд'инг — Float32Array замість number[] для economy. */
  embedding: Float32Array;
  /** Snapshot embedding-метаданих на момент запису. */
  embeddingMeta: EmbeddingMetadata;
  /** Довільні структуровані факти. JSONB у БД. */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Один результат семантичного пошуку. `score` — cosine similarity,
 * нормалізована у [0, 1] (1 = ідентичний). pgvector повертає
 * cosine **distance** (0 = ідентичний, 2 = протилежний); ми
 * конвертуємо у similarity у `pgVectorStore.query` для consistency
 * з UI/business-logic-семантикою.
 */
export interface MemoryQueryResult {
  /** ID запису. Number, не bigint (rule #1, AGENTS.md). */
  id: number;
  source: MemorySource;
  sourceRef: string | null;
  content: string;
  embeddingMeta: EmbeddingMetadata;
  metadata: Record<string, unknown>;
  /** Cosine similarity у [0, 1]. Більше — ближче. */
  score: number;
  createdAt: Date;
}

/**
 * Параметри ANN-запиту. Pre-filter по `userId` обовʼязковий (нагадаємо:
 * партиційовано по `hash(user_id)`, тому без `userId` запит впаде).
 * `topK` — кількість найближчих сусідів; `sources` — optional pre-filter
 * по domain-source-у.
 */
export interface MemoryQueryOptions {
  userId: string;
  embedding: Float32Array;
  topK: number;
  sources?: MemorySource[] | undefined;
  /**
   * Optional `ef_search` override (HNSW search-time tuning). Default —
   * `env.AI_MEMORY_HNSW_EF_SEARCH`. Підвищити для query-paths, де recall
   * критичний (наприклад, "знайди всі схожі транзакції за рік").
   */
  efSearch?: number | undefined;
}

/**
 * Vector-store-agnostic інтерфейс. `pgVectorStore` — реалізація для
 * Postgres + pgvector; пізніше можна додати `turbopufferStore` без
 * змін у callers.
 *
 * Контракт:
 *  - `upsert` обовʼязково в межах одного транзакції; partial-failure
 *    кидає виняток і нічого не записується (atomicity).
 *  - `query` повертає до `topK` результатів, відсортованих за score
 *    ↓ (більше — ближче).
 *  - `deleteBySource` ідемпотентний (no-op якщо нема row-у).
 *  - `health` — ping для readiness-probe.
 */
export interface VectorStore {
  upsert(input: MemoryWrite[]): Promise<void>;
  query(opts: MemoryQueryOptions): Promise<MemoryQueryResult[]>;
  deleteBySource(
    userId: string,
    source: MemorySource,
    sourceRef: string,
  ): Promise<void>;
  /** Видаляє всі memory одного юзера. Виклик при GDPR hard-delete. */
  deleteAllForUser(userId: string): Promise<number>;
  health(): Promise<{ ok: boolean; provider: "pgvector" | "turbopuffer" }>;
}

/**
 * PR-38 — criticality classifier для embedding-викликів. Background
 * ingestion (digest, RAG-prep) має передавати `"non-critical"`, щоб
 * `embedBatch` міг fail-soft-нути при overflow-і soft daily-budget-у.
 * User-facing recall / explicit user write — `"critical"` (default).
 */
export type EmbeddingCallCriticality = "critical" | "non-critical";

/**
 * Per-call options для `embedBatch`. Окрема структура (а не позиційні
 * args) — щоб майбутні extension points (наприклад, `signal`, `timeoutMs`)
 * не ламали call-sites.
 */
export interface EmbedBatchOptions {
  /** Default — `"critical"`. */
  criticality?: EmbeddingCallCriticality;
}

/**
 * Embedд'инг-провайдер. Окремий від `VectorStore`: store зберігає
 * вектори, provider їх генерує. Розділення дозволяє мокати у тестах
 * (in-memory store + fake embeddings) без дотику до Voyage API.
 */
export interface EmbeddingProvider {
  /** Метадані поточної моделі. Запис у `MemoryWrite.embeddingMeta`. */
  readonly meta: EmbeddingMetadata;
  /**
   * Embed-ить batch текстів. Якщо API не доступне — кидає
   * `MissingVoyageApiKeyError` / `VoyageHttpError`. Caller має
   * вирішувати, чи ретраїти (BullMQ-attempt у PR2).
   *
   * PR-38: коли `options.criticality === "non-critical"` І денний
   * Voyage USD-burn перевищив `VOYAGE_DAILY_BUDGET_USD_SOFT` →
   * `VoyageSoftBudgetExceededError`. Caller (background-ingestion)
   * має ловити її як "skip without retry".
   */
  embedBatch(
    texts: string[],
    options?: EmbedBatchOptions,
  ): Promise<Float32Array[]>;
}
