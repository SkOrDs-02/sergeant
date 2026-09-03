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
 *
 * Звужено ініціативою 0024 (PR-1, 2026-09-03): `chat`, `finyk`, `fizruk`,
 * `nutrition`, `routine`, `journal` прибрані — жоден із них ніколи не мав
 * продюсера в дереві (замір: `docs/90-work/initiatives/0024-ai-memory-
 * source-coverage.md` § Перезамір 2026-09-03). CHECK-constraint у БД поки
 * що дозволяє старі значення — це фаза 1 двофазного звуження; фаза 2
 * (DROP + двофазний CHECK) — PR-3 тієї ж ініціативи. Зворотний шлях (якщо
 * колись знадобиться `chat` як окреме джерело) — той самий двофазний
 * процес у зворотному напрямку: спершу розширити ALLOWED_MEMORY_SOURCES +
 * CHECK, потім додати продюсер.
 *
 * `cofounder` і `product` лишаються в списку, хоч їхні продюсери
 * (`backfill.ts`, `eventSync.ts`) видалені PR #928 (2026-08-29) — вони не
 * входять у цю чистку, бо в БД можуть лишатись legacy-рядки, які мають
 * читатись/видалятись через UI (список у `RESERVED_SOURCES` нижче,
 * `sources.test.ts` це охороняє).
 */
export const ALLOWED_MEMORY_SOURCES = [
  "digest",
  // LEGACY-source: писався OpenClaw-архівом (`tg_topic_archive` backfill,
  // ADR-0031). OpenClaw retired (ADR-0075), backfill-механіку знято
  // 2026-08-29 — нових рядків не буде. Значення лишається в enum, щоб
  // наявні рядки читались у list/recall і видалялись через UI; зняття з
  // CHECK-constraint — двофазне, разом із чисткою даних.
  "cofounder",
  // LEGACY-source: PostHog → memory дзеркало (migration 068, PR-24) знято
  // 2026-08-29 — телеметрія в ролі «фактів про людину» шуміла в RAG.
  // Значення лишається для наявних рядків; двофазне зняття — як вище.
  "product",
  // Migration 118 — L-8, аудит Профілю/Налаштувань (2026-08-08,
  // docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md). Явно
  // заявлені факти про самого користувача (client-side «банк памʼяті»
  // `hub_user_profile_v1` / `USER_PROFILE`, дзеркальований серверним
  // `user_profile` з міграції 115) — НЕ поведінкові events (`product`) і
  // НЕ витяг із чату (`chat`). Обидві фази приземлились: CHECK-constraint і
  // union-тип (міграція 118), а `mirrorProfileMemoryEntries`
  // (`profileMirror.ts`, викликається з `routes/me.ts` після успішного
  // `PUT /api/me/profile`) реально пише й прибирає ці рядки — джерело
  // наповнене, не порожнє.
  "profile",
] as const;

/**
 * Джерела без активного продюсера в дереві, залишені в
 * `ALLOWED_MEMORY_SOURCES` навмисно (не за недоглядом). `sources.test.ts`
 * вимагає, щоб кожне значення `ALLOWED_MEMORY_SOURCES` мало або продюсера
 * (`enqueueMemoryIngest({ source: "..." })` десь у дереві), або запис тут
 * із посиланням на рішення.
 *
 * `cofounder` і `product` — тимчасово порожні продюсери (PR #928 видалив
 * `backfill.ts` / `eventSync.ts`, 2026-08-29), лишені для legacy-рядків;
 * ADR/рішення — `docs/90-work/initiatives/0024-ai-memory-source-coverage.md`.
 */
export const RESERVED_SOURCES: readonly MemorySource[] = [
  "cofounder",
  "product",
];

export type MemorySource = (typeof ALLOWED_MEMORY_SOURCES)[number];

/**
 * Метадані embedдʼингу — записуються у row, щоб майбутній re-embed
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
 * по собі embedдʼингу не робить.
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
  /** Embedдʼинг — Float32Array замість number[] для economy. */
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
 * Embedдʼинг-провайдер. Окремий від `VectorStore`: store зберігає
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
