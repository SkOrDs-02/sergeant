/**
 * Centralized environment configuration with validation and defaults.
 * All environment variables should be accessed through this module.
 */

function parseIntEnv(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  return defaultValue;
}

export const env = {
  // ─────────────────────────────────────────────────────────────────────────
  // Server
  // ─────────────────────────────────────────────────────────────────────────
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseIntEnv("PORT", 3000),
  HOST: process.env.HOST || "0.0.0.0",

  /** Global request timeout in ms. 0 = disabled. */
  REQUEST_TIMEOUT_MS: parseIntEnv("REQUEST_TIMEOUT_MS", 120_000),

  /** Enable response compression (gzip/br) */
  COMPRESSION_ENABLED: parseBoolEnv("COMPRESSION_ENABLED", true),

  // ─────────────────────────────────────────────────────────────────────────
  // Database
  // ─────────────────────────────────────────────────────────────────────────
  DATABASE_URL: process.env.DATABASE_URL || "",

  /** PG pool size */
  PG_POOL_SIZE: parseIntEnv("PG_POOL_SIZE", 10),

  /** PG connection timeout in ms */
  PG_CONNECTION_TIMEOUT_MS: parseIntEnv("PG_CONNECTION_TIMEOUT_MS", 5_000),

  /** PG idle timeout in ms */
  PG_IDLE_TIMEOUT_MS: parseIntEnv("PG_IDLE_TIMEOUT_MS", 30_000),

  /** PG statement timeout in ms */
  PG_STATEMENT_TIMEOUT_MS: parseIntEnv("PG_STATEMENT_TIMEOUT_MS", 30_000),

  /** Max retries for transient DB errors */
  DB_MAX_RETRIES: parseIntEnv("DB_MAX_RETRIES", 3),

  // ─────────────────────────────────────────────────────────────────────────
  // Redis
  // ─────────────────────────────────────────────────────────────────────────
  REDIS_URL: process.env.REDIS_URL || "",

  /** Max reconnect attempts before giving up */
  REDIS_MAX_RETRIES: parseIntEnv("REDIS_MAX_RETRIES", 10),

  /** Initial reconnect delay in ms */
  REDIS_RECONNECT_DELAY_MS: parseIntEnv("REDIS_RECONNECT_DELAY_MS", 100),

  /** Max reconnect delay in ms (exponential backoff cap) */
  REDIS_MAX_RECONNECT_DELAY_MS: parseIntEnv(
    "REDIS_MAX_RECONNECT_DELAY_MS",
    3_000,
  ),

  // ─────────────────────────────────────────────────────────────────────────
  // Internal API (machine-to-machine, used by n8n workflows)
  // ─────────────────────────────────────────────────────────────────────────

  /** Bearer token that n8n must include when calling /api/internal/* routes. */
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || "",

  // ─────────────────────────────────────────────────────────────────────────
  // AI / Anthropic
  // ─────────────────────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

  /** AI request timeout in ms */
  AI_TIMEOUT_MS: parseIntEnv("AI_TIMEOUT_MS", 180_000),

  /** Max AI retries on transient errors */
  AI_MAX_RETRIES: parseIntEnv("AI_MAX_RETRIES", 2),

  /** Circuit breaker: failures before opening */
  AI_CIRCUIT_BREAKER_THRESHOLD: parseIntEnv("AI_CIRCUIT_BREAKER_THRESHOLD", 5),

  /** Circuit breaker: half-open test interval in ms */
  AI_CIRCUIT_BREAKER_RESET_MS: parseIntEnv(
    "AI_CIRCUIT_BREAKER_RESET_MS",
    30_000,
  ),

  // ─────────────────────────────────────────────────────────────────────────
  // Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────

  /** Global rate limit: requests per window */
  RATE_LIMIT_MAX: parseIntEnv("RATE_LIMIT_MAX", 100),

  /** Global rate limit: window size in seconds */
  RATE_LIMIT_WINDOW_SEC: parseIntEnv("RATE_LIMIT_WINDOW_SEC", 60),

  /** Auth rate limit: attempts per window */
  AUTH_RATE_LIMIT_MAX: parseIntEnv("AUTH_RATE_LIMIT_MAX", 5),

  /** Auth rate limit: window size in seconds */
  AUTH_RATE_LIMIT_WINDOW_SEC: parseIntEnv("AUTH_RATE_LIMIT_WINDOW_SEC", 900),

  // ─────────────────────────────────────────────────────────────────────────
  // Observability
  // ─────────────────────────────────────────────────────────────────────────
  SENTRY_DSN: process.env.SENTRY_DSN || "",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  // ─────────────────────────────────────────────────────────────────────────
  // External Services
  // ─────────────────────────────────────────────────────────────────────────
  MONO_TOKEN: process.env.MONO_TOKEN || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",

  // ─────────────────────────────────────────────────────────────────────────
  // Feature Flags
  // ─────────────────────────────────────────────────────────────────────────

  /** Enable slow query logging (>100ms) */
  LOG_SLOW_QUERIES: parseBoolEnv("LOG_SLOW_QUERIES", true),

  /** Slow query threshold in ms */
  SLOW_QUERY_THRESHOLD_MS: parseIntEnv("SLOW_QUERY_THRESHOLD_MS", 100),

  // ─────────────────────────────────────────────────────────────────────────
  // Mono AI enrichment worker
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Запускати polling-консьюмера `mono_ai_enrichment_queue` у тому ж процесі,
   * що API. Default: false, щоб локальний dev / тести не виконували реальні
   * Anthropic-запити в фоні. У production вмикається через Railway env var.
   */
  MONO_ENRICHMENT_WORKER_ENABLED: parseBoolEnv(
    "MONO_ENRICHMENT_WORKER_ENABLED",
    false,
  ),

  /** Скільки row-ів забирати за один tick. */
  MONO_ENRICHMENT_BATCH_SIZE: parseIntEnv("MONO_ENRICHMENT_BATCH_SIZE", 5),

  /** Інтервал між тиками polling-loop (мс). */
  MONO_ENRICHMENT_INTERVAL_MS: parseIntEnv(
    "MONO_ENRICHMENT_INTERVAL_MS",
    5_000,
  ),

  /** Максимум спроб на tx до того, як queue.row.status='failed'. */
  MONO_ENRICHMENT_MAX_ATTEMPTS: parseIntEnv("MONO_ENRICHMENT_MAX_ATTEMPTS", 5),

  // ─────────────────────────────────────────────────────────────────────────
  // Sync audit log (PR #005 / Stage 0 — `docs/planning/storage-roadmap.md`)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Comma-separated allow-list of `user.id` значень, яким дозволено
   * викликати `GET /api/sync/audit?user_id=<X>` для чужих юзерів. Без
   * env-var-а endpoint доступний лише для запитів про власні логи
   * (`req.user.id === query.user_id` або без `user_id`-параметра).
   *
   * Whitespace навколо коми трімиться. Порожні значення фільтруються.
   * Інтенціонально без UI-toggle: це operational backdoor для
   * incident-response, а не self-service feature.
   */
  SYNC_AUDIT_ADMIN_USER_IDS: process.env.SYNC_AUDIT_ADMIN_USER_IDS || "",

  // ─────────────────────────────────────────────────────────────────────────
  // AI memory (pgvector + Voyage embeddings, ADR-0028)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Foundation layer без ingestion / retrieval (foundation-PR — лише storage
  // + клієнт). Ingestion / retrieval приходять окремими PR-ами і вмикаються
  // прапором `AI_MEMORY_ENABLED`. До цього прапора нічого не пишеться у
  // `ai_memories` і нічого не читається у retrieval-pipeline (тобто existing
  // chat-flow не зачіпається).

  /**
   * Майстер-вимикач AI memory pipeline. False у foundation-PR — embedд'инг
   * клієнт може існувати, але service-методи `remember()` / `recall()`
   * лишаються no-op-ами (повертають порожні результати без виклику
   * провайдера). Вмикається разом з PR-ом ingestion-у.
   */
  AI_MEMORY_ENABLED: parseBoolEnv("AI_MEMORY_ENABLED", false),

  /**
   * Voyage AI API key. Якщо не задано — `createVoyageEmbeddings()` кидає
   * `MissingVoyageApiKeyError` при будь-якому виклику. PR2 буде ставити
   * memory-write задачі у queue зі статусом `failed` без повторних
   * спроб у такому разі (щоб не валити Voyage квоту з кожним tick-ом).
   */
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY || "",

  /**
   * Voyage embedding model. `voyage-3.5-lite` — multilingual lite-tier
   * (~$0.02/1M токенів), нативно підтримує 1024-вимірний output.
   *
   * УВАГА: `voyage-3-lite` (попередник) повертає **тільки 512 dims**, що
   * несумісно з нашою схемою `HALFVEC(1024)` у міграції 025. Для 1024d
   * approved модельки: `voyage-3.5-lite` (default), `voyage-3`,
   * `voyage-3.5`, `voyage-3-large`. Зміна моделі вимагає re-embedд'ингу
   * всіх існуючих row-ів (vector spaces різних моделей не сумісні).
   */
  VOYAGE_EMBEDDING_MODEL:
    process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3.5-lite",

  /**
   * Розмірність embedding-вектора. Має співпадати з `HALFVEC(N)` у
   * SQL-міграції `025_ai_memories_pgvector.sql`. Voyage `voyage-3.5-lite`
   * вертає 1024 за замовчуванням.
   */
  VOYAGE_EMBEDDING_DIM: parseIntEnv("VOYAGE_EMBEDDING_DIM", 1024),

  /**
   * Internal semver embedding-схеми (наприклад, '1' → '2' при зміні
   * prompt-template для embedд'ингу). Окремо від `VOYAGE_EMBEDDING_MODEL`
   * — модель може лишатися та сама, але якщо ми додаємо метаданий префікс
   * у текст перед embedд'ингом — поточні row-и потрібно re-embed-ити.
   */
  AI_MEMORY_EMBEDDING_VERSION: process.env.AI_MEMORY_EMBEDDING_VERSION || "1",

  /**
   * Voyage HTTP timeout (мс). Embedд'инг — fast (зазвичай <1s), тому
   * default менше за Anthropic (`AI_TIMEOUT_MS=180s`): не хочемо тримати
   * Express handler 3 хвилини, якщо Voyage завис.
   */
  VOYAGE_TIMEOUT_MS: parseIntEnv("VOYAGE_TIMEOUT_MS", 15_000),

  /**
   * Voyage max retries on transient errors. 5xx/timeout/abort.
   * Не ретраїмо 4xx (auth/quota) — ці потребують manual fix.
   */
  VOYAGE_MAX_RETRIES: parseIntEnv("VOYAGE_MAX_RETRIES", 2),

  /**
   * Voyage batch size — кількість текстів у одному запиті. Voyage API
   * приймає до 128, але великий batch ≠ швидше: при rate-limit-і весь
   * batch фейлиться. 32 — sweet-spot.
   */
  VOYAGE_BATCH_SIZE: parseIntEnv("VOYAGE_BATCH_SIZE", 32),

  /**
   * HNSW search-time `ef_search` — кандидатів обходити при ANN-запиті.
   * Більше → краще recall, але повільніше. 40 — pgvector default;
   * Voyage benchmark показує recall@10 ≥ 0.95 на цьому значенні для
   * 1024-вимірних embedд'ингів.
   */
  AI_MEMORY_HNSW_EF_SEARCH: parseIntEnv("AI_MEMORY_HNSW_EF_SEARCH", 40),

  /**
   * Default top-K для retrieval. Можна override на per-query basis.
   * 8 — баланс між контекстом для моделі та token-cost-ом
   * (8 memory × ~80 токенів/memory ≈ 640 токенів input).
   */
  AI_MEMORY_TOP_K: parseIntEnv("AI_MEMORY_TOP_K", 8),

  /**
   * Top-K для **автоматичного** RAG-інжекту в `/api/chat` (PR3). Менший
   * за `AI_MEMORY_TOP_K`, бо RAG зливається у system context кожного
   * чат-запиту: 4 × ~80 токенів ≈ 320 токенів — поміщається в кеш-block,
   * не видно як "роздутий" prompt у Anthropic billing-ху. Явні виклики
   * tool-у `recall_memory` юзають AI_MEMORY_TOP_K.
   *
   * 0 → RAG-injection повністю вимкнений (tool ще працює). Зручно для
   * A/B-тесту cost-impact-у RAG.
   */
  AI_MEMORY_RAG_TOP_K: parseIntEnv("AI_MEMORY_RAG_TOP_K", 4),

  // ─────────────────────────────────────────────────────────────────────────
  // AI memory ingestion (PR2 — BullMQ async queue + hooks)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Hooks у `mono/webhook.ts` (finyk), `digest/weekly-digest.ts` (digest) і
  // `POST /api/ai-memory/ingest` (nutrition / fizruk / journal / routine з
  // клієнта) ставлять задачу у BullMQ-чергу `ai-memory-ingest` (Redis-keys
  // префікс `sergeant:`, див. `lib/jobs/connection.ts`).
  // Worker викликає `aiMemory.remember()`, який робить Voyage embedding +
  // pgvector upsert. Якщо `REDIS_URL` не заданий — fallback на in-process
  // direct dispatch (як у authMail).

  /**
   * Concurrent worker-jobs для ingestion. Default 4: Voyage embed-and-upsert
   * займає ~300–500мс, тому 4 паралельних достатньо щоб тримати throughput
   * ~10 jobs/s без перегріву Voyage rate-limit-у. У great-spike-сценарії
   * BullMQ автоматично черговує — ніколи не падаємо.
   */
  AI_MEMORY_INGEST_CONCURRENCY: parseIntEnv("AI_MEMORY_INGEST_CONCURRENCY", 4),

  /**
   * Max content-length у `MemoryIngestPayload.content` (символи). Voyage
   * `voyage-3.5-lite` max input — ~32K токенів, але типовий memory-record
   * (`"Витрата 100 ₴ Сільпо · продукти · 2026-01-15"`) — десятки символів.
   * 4_000 — generous-cap для digest-summaries; вище за нього content-text
   * обрізається на edge (`/api/ai-memory/ingest`) і у hooks-callsite-ах.
   */
  AI_MEMORY_INGEST_MAX_CONTENT_LEN: parseIntEnv(
    "AI_MEMORY_INGEST_MAX_CONTENT_LEN",
    4_000,
  ),

  /**
   * Per-attempt BullMQ-attempt count. 5 — миттєво → 30s → 2min → 8min →
   * 30min, сумарно ~40min. Voyage 5xx зазвичай recovery-ються за хвилини;
   * якщо й після 5 спроб не вдалось — memory-job помічається як `failed` і
   * НЕ блокує інших job-ів для того ж юзера.
   */
  AI_MEMORY_INGEST_ATTEMPTS: parseIntEnv("AI_MEMORY_INGEST_ATTEMPTS", 5),
} as const;

export type Env = typeof env;
