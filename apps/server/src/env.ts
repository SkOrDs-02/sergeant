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

/**
 * Парсить float з env-vars (USD-суми monthly cost — їх ніхто не пише
 * цілими). Порожнє/некорректне значення → `defaultValue`. NaN guard
 * критичний бо `prom-client` Gauge.set(NaN) кидає.
 */
function parseFloatEnv(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultValue;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const env = {
  // ─────────────────────────────────────────────────────────────────────────
  // Server
  // ─────────────────────────────────────────────────────────────────────────
  NODE_ENV: process.env["NODE_ENV"] || "development",
  PORT: parseIntEnv("PORT", 3000),
  HOST: process.env["HOST"] || "0.0.0.0",

  /** Global request timeout in ms. 0 = disabled. */
  REQUEST_TIMEOUT_MS: parseIntEnv("REQUEST_TIMEOUT_MS", 120_000),

  /** Enable response compression (gzip/br) */
  COMPRESSION_ENABLED: parseBoolEnv("COMPRESSION_ENABLED", true),

  /** Graceful shutdown: max wait for in-flight requests to finish (ms). */
  SHUTDOWN_GRACE_MS: parseIntEnv("SHUTDOWN_GRACE_MS", 15_000),

  /** Graceful shutdown: hard-kill timeout — process.exit fires after this (ms). */
  SHUTDOWN_HARD_TIMEOUT_MS: parseIntEnv("SHUTDOWN_HARD_TIMEOUT_MS", 25_000),

  // ─────────────────────────────────────────────────────────────────────────
  // Database
  // ─────────────────────────────────────────────────────────────────────────
  DATABASE_URL: process.env["DATABASE_URL"] || "",

  /**
   * Pooled Postgres connection string (PR #046 — pgBouncer).
   *
   * If set, the runtime app pool (`apps/server/src/db.ts`) routes every
   * `query()` and `pool.connect()` call here instead of `DATABASE_URL`.
   * `DATABASE_URL` stays the **direct** Postgres URL and is reserved for
   * surfaces that pgBouncer transaction-mode breaks: schema migrations
   * (advisory locks, `BEGIN…COMMIT` across roundtrips that cross
   * transactions), cron jobs that hold session-scoped state, and any
   * eventual `LISTEN/NOTIFY` consumer.
   *
   * Empty / unset → fall back to `DATABASE_URL` so existing single-URL
   * deployments keep working without a config change. See
   * `docs/runbooks/database-connection-pooling.md` for the Railway
   * pgBouncer deployment shape and the prepared-statement caveat.
   */
  DATABASE_URL_POOL: process.env["DATABASE_URL_POOL"] || "",

  /**
   * Read-replica Postgres connection string (PR #047 — analytics offload).
   *
   * If set, opt-in callers (currently `growth_*` / `seo_*` analytics reads
   * via `apps/server/src/dbReplica.ts`) route SELECTs through the replica
   * pool. Writes, transactions, and anything that needs read-after-write
   * consistency stay on the primary `pool` (= `DATABASE_URL_POOL ||
   * DATABASE_URL`).
   *
   * Empty / unset → replica helpers transparently fall back to the
   * primary pool, so existing deployments without a replica keep
   * working. Acceptable replication lag target: < 5s p99 (alert
   * threshold). See `docs/runbooks/postgres-read-replica.md`.
   */
  DATABASE_URL_REPLICA: process.env["DATABASE_URL_REPLICA"] || "",

  // ─────────────────────────────────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────────────────────────────────

  /** Min password length (NIST SP 800-63B recommends ≥8; 10 is the project default). */
  MIN_PASSWORD_LENGTH: parseIntEnv("MIN_PASSWORD_LENGTH", 10),

  /**
   * Max password length — hard-capped at 256 as DoS-defence (bound per-request
   * scrypt work). Better Auth uses scrypt under the hood (no 72-byte limit), so
   * the cap is operational, not cryptographic. We clamp the env-supplied value
   * with `Math.min(256, …)` as defence-in-depth alongside the zod `.max(256)` in
   * `apps/server/src/env/env.ts`. See ADR-0042.
   */
  MAX_PASSWORD_LENGTH: Math.min(256, parseIntEnv("MAX_PASSWORD_LENGTH", 256)),

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
  REDIS_URL: process.env["REDIS_URL"] || "",

  /** Max reconnect attempts before giving up */
  REDIS_MAX_RETRIES: parseIntEnv("REDIS_MAX_RETRIES", 10),

  /** Initial reconnect delay in ms */
  REDIS_RECONNECT_DELAY_MS: parseIntEnv("REDIS_RECONNECT_DELAY_MS", 100),

  /** Max reconnect delay in ms (exponential backoff cap) */
  REDIS_MAX_RECONNECT_DELAY_MS: parseIntEnv(
    "REDIS_MAX_RECONNECT_DELAY_MS",
    3_000,
  ),

  /**
   * Fail-mode for rate-limit middleware on security-sensitive endpoints
   * (`/api/auth/*`). When BOTH Redis and Postgres are unreachable (i.e. the
   * limiter is forced into the per-process in-memory bucket), the middleware
   * returns 503 instead of letting the request through.
   *
   * Rationale: in-memory buckets are per-replica state. On Railway with 3
   * replicas an attacker effectively gets `3×limit` requests/window because
   * each replica counts independently. For credential-stuffing this turns a
   * 5-attempts-per-15-min limit into 15. Fail-closed stops the degradation
   * — the user sees 503 + Retry-After, and the attacker cannot accumulate
   * attempts while the backend recovers.
   *
   * Defaults to `true`. Disable only if you observe false-positive 503s in
   * production (e.g. Redis blips routinely take Postgres down with them).
   * Non-auth routes (`/api/health`, public read APIs) stay fail-open
   * regardless of this flag — for them the cost-of-blocking outweighs the
   * abuse-amplification risk.
   */
  RATE_LIMIT_FAIL_CLOSED_AUTH: parseBoolEnv(
    "RATE_LIMIT_FAIL_CLOSED_AUTH",
    true,
  ),

  // ─────────────────────────────────────────────────────────────────────────
  // Internal API (machine-to-machine, used by n8n workflows)
  // ─────────────────────────────────────────────────────────────────────────

  /** Bearer token that n8n must include when calling /api/internal/* routes. */
  INTERNAL_API_KEY: process.env["INTERNAL_API_KEY"] || "",

  // ─────────────────────────────────────────────────────────────────────────
  // AI / Anthropic
  // ─────────────────────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"] || "",

  /** AI request timeout in ms */
  AI_TIMEOUT_MS: parseIntEnv("AI_TIMEOUT_MS", 180_000),

  /** Max AI retries on transient errors */
  AI_MAX_RETRIES: parseIntEnv("AI_MAX_RETRIES", 2),

  /** Max auto-continuation loops before stopping mid-stream (see AGENTS.md). */
  CHAT_MAX_TEXT_CONTINUATIONS: parseIntEnv("CHAT_MAX_TEXT_CONTINUATIONS", 3),

  /** SSE keep-alive heartbeat interval (ms). */
  SSE_HEARTBEAT_MS: parseIntEnv("SSE_HEARTBEAT_MS", 15_000),

  /** Circuit breaker: failures before opening */
  AI_CIRCUIT_BREAKER_THRESHOLD: parseIntEnv("AI_CIRCUIT_BREAKER_THRESHOLD", 5),

  /** Circuit breaker: half-open test interval in ms */
  AI_CIRCUIT_BREAKER_RESET_MS: parseIntEnv(
    "AI_CIRCUIT_BREAKER_RESET_MS",
    30_000,
  ),

  /**
   * AI-quota DB-circuit-breaker: how many DB errors in
   * `AI_QUOTA_CIRCUIT_WINDOW_MS` open the breaker. Default — 5 errors / 60s
   * (per `0011-resilience.md`). Setting `0` disables the breaker (legacy
   * fail-open path) — useful as a kill-switch during incident.
   */
  AI_QUOTA_CIRCUIT_THRESHOLD: parseIntEnv("AI_QUOTA_CIRCUIT_THRESHOLD", 5),

  /** Sliding window for AI-quota DB-error counting (ms). */
  AI_QUOTA_CIRCUIT_WINDOW_MS: parseIntEnv("AI_QUOTA_CIRCUIT_WINDOW_MS", 60_000),

  /** How long the AI-quota breaker stays open before HALF-OPEN probe (ms). */
  AI_QUOTA_CIRCUIT_OPEN_MS: parseIntEnv("AI_QUOTA_CIRCUIT_OPEN_MS", 300_000),

  /**
   * Killer-switch for AI-quota: when `true`, `assertAiQuota()` becomes a no-op
   * and every AI route runs without decrementing the `ai_usage_daily` counter.
   * Designed **exclusively** for CI/test environments where e2e tests hammer
   * the real Anthropic API without burning user quota
   * (see `.github/workflows/extended-e2e.yml`).
   *
   * In production this flag is a fail-open kill-switch on billing: a stray
   * `AI_QUOTA_DISABLED=1` in Railway env (copy-paste from staging, helm typo)
   * disables every per-user / per-IP cap and lets clients burn the entire
   * Anthropic budget. `assertStartupEnv()` in `env/env.ts` hard-blocks
   * production startup when this flag is truthy alongside `NODE_ENV=production`
   * (or any RAILWAY_* env), so a misconfigured deploy refuses to boot rather
   * than silently leak budget.
   *
   * Default: `false`.
   */
  AI_QUOTA_DISABLED: parseBoolEnv("AI_QUOTA_DISABLED", false),

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
  SENTRY_DSN: process.env["SENTRY_DSN"] || "",
  LOG_LEVEL: process.env["LOG_LEVEL"] || "info",

  // ─────────────────────────────────────────────────────────────────────────
  // External Services
  // ─────────────────────────────────────────────────────────────────────────
  MONO_TOKEN: process.env["MONO_TOKEN"] || "",
  RESEND_API_KEY: process.env["RESEND_API_KEY"] || "",

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
  SYNC_AUDIT_ADMIN_USER_IDS: process.env["SYNC_AUDIT_ADMIN_USER_IDS"] || "",

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
  VOYAGE_API_KEY: process.env["VOYAGE_API_KEY"] || "",

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
    process.env["VOYAGE_EMBEDDING_MODEL"] || "voyage-3.5-lite",

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
  AI_MEMORY_EMBEDDING_VERSION:
    process.env["AI_MEMORY_EMBEDDING_VERSION"] || "1",

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

  /**
   * Hard timeout for the RAG Voyage + pgvector round-trip (мс). Перевищення —
   * silent skip; чат продовжується без памʼяті (fail-open).
   */
  AI_MEMORY_RAG_TIMEOUT_MS: parseIntEnv("AI_MEMORY_RAG_TIMEOUT_MS", 1_500),

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

  // ─────────────────────────────────────────────────────────────────────────
  // OpenClaw v0 — Telegram-only co-founder bot (ADR-0031)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Server-side env для OpenClaw модуля. Token + Telegram allowlist живуть у
  // `tools/console` — це Telegram-bot частина. Сервер відповідає за:
  //   - tool execution (memory recall, decision write, query_app_db, etc.)
  //   - audit log у `openclaw_invocations`
  //   - per-day cost cap (читається тут, enforce-иться у console pre-call)
  //
  // Strict isolation memory namespace ('cofounder') і table-allowlist для
  // `query_app_db` — хардкоди у tools-модулі, не env. Не мінти runtime.

  /**
   * Better Auth user.id founder-а. Потрібен для join-ів з `ai_memories`
   * (PARTITION BY HASH(user_id)) і запису `openclaw_invocations.founder_user_id`.
   * Окремий від `OPENCLAW_FOUNDER_TG_USER_ID` — Telegram numeric id інший.
   */
  OPENCLAW_FOUNDER_USER_ID: process.env["OPENCLAW_FOUNDER_USER_ID"] || "",

  /**
   * Денний USD cap на Anthropic-token-и через OpenClaw. Pre-call check:
   * `SUM(cost_usd) WHERE invoked_at >= today_kyiv` + estimated next-call
   * cost; якщо > cap → fail-closed з reply
   * `"OpenClaw quota exceeded for today. Resume tomorrow."`
   *
   * Dollar-string бо NUMERIC(10,4) у БД; parseFloat на read-side.
   */
  OPENCLAW_DAILY_USD_BUDGET: process.env["OPENCLAW_DAILY_USD_BUDGET"] || "5",

  /**
   * Hard cap на Plan→Act→Reflect ітерації у одному виклику. Reach → fail-closed
   * з `status='iteration_cap'`.
   */
  OPENCLAW_MAX_ITERATIONS: parseIntEnv("OPENCLAW_MAX_ITERATIONS", 8),

  /**
   * Schedule env-и (TZ-aware human-readable strings). Phase 1 — лише
   * фіксуємо values; Phase 2 wires actual BullMQ repeatable jobs з парсингом.
   * Format: `"HH:MM TZ"` для daily / `"DOW HH:MM TZ"` для weekly /
   * `"D HH:MM TZ"` для monthly (D = day-of-month).
   */
  OPENCLAW_DAILY_MORNING_AT:
    process.env["OPENCLAW_DAILY_MORNING_AT"] || "08:30 Europe/Kyiv",
  OPENCLAW_WEEKLY_REVIEW_AT:
    process.env["OPENCLAW_WEEKLY_REVIEW_AT"] || "Fri 18:00 Europe/Kyiv",
  OPENCLAW_MONTHLY_OKR_AT:
    process.env["OPENCLAW_MONTHLY_OKR_AT"] || "1 09:00 Europe/Kyiv",

  /**
   * Broadcast policy.
   *   - `dm`: всі insights — лише DM до founder-а.
   *   - `digest`: weekly review + monthly OKR auto-broadcast у `📊 Дайджести`
   *     topic; daily ritual + ad-hoc DM залишаються DM-only (default).
   *   - `all`: усе у `📊 Дайджести` (для майбутньої team-у).
   */
  OPENCLAW_BROADCAST_MODE: (
    process.env["OPENCLAW_BROADCAST_MODE"] || "digest"
  ).toLowerCase() as "dm" | "digest" | "all",

  /**
   * Feature flag for the GitHub App auth-flow (stack-pulse-2026-05 PR-06).
   * When `true` (default since Phase 2) AND all three
   * `OPENCLAW_GITHUB_APP_*` env-vars are populated, OpenClaw mints
   * short-lived (1h) installation-tokens via
   * `apps/server/src/modules/openclaw/github-auth.ts` and never falls
   * back to a long-lived PAT.
   *
   * Setting this to `false` is supported only in `NODE_ENV=development`
   * tooling that genuinely cannot register a GitHub App (local dry-runs
   * with read-only mocks). In production the App-flow is mandatory:
   * `OPENCLAW_GITHUB_PAT` and the `Git_PAT` fallback have been removed,
   * and `assertStartupEnv()` in `env/env.ts` hard-blocks startup if the
   * legacy PAT env-vars are still present (Hard Rule #20 — «No OpenClaw
   * PATs in production»). Rotation runbook:
   * `docs/playbooks/rotate-openclaw-credentials.md`.
   */
  OPENCLAW_USE_GITHUB_APP: parseBoolEnv("OPENCLAW_USE_GITHUB_APP", true),

  /**
   * GitHub App ID (numeric, e.g. `123456`). Stored as a string because
   * GitHub returns it as a string in the App's «App settings» page and
   * we never do arithmetic on it. Together with the private key and
   * installation id below, this lets us mint installation-tokens.
   */
  OPENCLAW_GITHUB_APP_ID: process.env["OPENCLAW_GITHUB_APP_ID"] || "",

  /**
   * GitHub App private key (PEM). Some secret-stores (Vercel, Railway,
   * 1Password CLI) strip the actual newlines and replace them with
   * `\n` literals when injecting the value as a single-line env-var;
   * `github-auth.normalizePrivateKey` repairs that on the way in so
   * the key parses cleanly with `crypto.createSign('RSA-SHA256')`.
   *
   * Rotation runbook: `docs/playbooks/rotate-openclaw-credentials.md`.
   */
  OPENCLAW_GITHUB_APP_PRIVATE_KEY:
    process.env["OPENCLAW_GITHUB_APP_PRIVATE_KEY"] || "",

  /**
   * GitHub App installation id (numeric). One App can be installed on
   * multiple orgs / repos; the installation id picks which one we mint
   * tokens for. Sergeant pins it explicitly so a misconfigured App
   * (e.g. installed twice) can't accidentally widen blast radius.
   */
  OPENCLAW_GITHUB_APP_INSTALLATION_ID:
    process.env["OPENCLAW_GITHUB_APP_INSTALLATION_ID"] || "",

  /**
   * Repo target для decision PR-ів. Default — основний Sergeant repo.
   * Override для тестів / fork-ів.
   */
  OPENCLAW_GITHUB_REPO:
    process.env["OPENCLAW_GITHUB_REPO"] || "Skords-01/Sergeant",

  /**
   * Default branch у repo (для decision PR-ів). Якщо змінили на `main` /
   * `master` / `develop` — переоверайдити тут.
   */
  OPENCLAW_GITHUB_BASE_BRANCH:
    process.env["OPENCLAW_GITHUB_BASE_BRANCH"] || "main",

  // ─────────────────────────────────────────────────────────────────────────
  // PR-33 — Cost monitoring dashboard
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Fixed/budget monthly costs у USD для зовнішніх провайдерів. Виставляються
  // у `infra_monthly_cost_usd` Gauge один раз на старті процесу. Жодне
  // значення не обовʼязкове: якщо лишити порожнім — серія не зʼявляється
  // у `/metrics` (gauge не пре-allocate-имо нулі). `*_PLAN` лейбл — для
  // group-by у Grafana ("яку частку бюджету зʼїдає кожен tier").
  //
  // Cardinality contract: `provider`-лейбл з фіксованої множини 6 значень,
  // `plan`-лейбл — теж зі стандартних tiers (`free|hobby|pro|team|business|
  // enterprise|usage|budget`). Зміна plan-name на час runtime — НЕ
  // підтримується (треба рестарт процесу). Це OK бо subscription tier
  // міняється не частіше за раз на місяць.

  /** Railway infra subscription monthly cost (USD). Zero/empty → не репортимо. */
  RAILWAY_MONTHLY_COST_USD: parseFloatEnv("RAILWAY_MONTHLY_COST_USD", 0),
  /** Railway plan tier для labels (`hobby` | `pro` | `team` | `enterprise`). */
  RAILWAY_PLAN: process.env["RAILWAY_PLAN"] || "hobby",

  /** Vercel hosting monthly cost (USD). Zero/empty → не репортимо. */
  VERCEL_MONTHLY_COST_USD: parseFloatEnv("VERCEL_MONTHLY_COST_USD", 0),
  /** Vercel plan tier (`hobby` | `pro` | `enterprise`). */
  VERCEL_PLAN: process.env["VERCEL_PLAN"] || "hobby",

  /** PostHog analytics monthly cost (USD). Zero/empty → не репортимо. */
  POSTHOG_MONTHLY_COST_USD: parseFloatEnv("POSTHOG_MONTHLY_COST_USD", 0),
  /** PostHog plan tier (`free` | `pay-as-you-go` | `scale` | `enterprise`). */
  POSTHOG_PLAN: process.env["POSTHOG_PLAN"] || "free",

  /** Sentry error monitoring monthly cost (USD). Zero/empty → не репортимо. */
  SENTRY_MONTHLY_COST_USD: parseFloatEnv("SENTRY_MONTHLY_COST_USD", 0),
  /** Sentry plan tier (`developer` | `team` | `business` | `enterprise`). */
  SENTRY_PLAN: process.env["SENTRY_PLAN"] || "developer",

  /**
   * Anthropic monthly budget envelope (USD) — НЕ bill, а target. У Grafana
   * накладається лінією на `ai_cost_estimate_usd_total`-run-rate; коли
   * фактичний run-rate перетинає лінію — алерт.
   */
  ANTHROPIC_MONTHLY_BUDGET_USD: parseFloatEnv(
    "ANTHROPIC_MONTHLY_BUDGET_USD",
    0,
  ),
  /** Anthropic billing tier для лейбла (`usage` для pay-as-you-go). */
  ANTHROPIC_PLAN: process.env["ANTHROPIC_PLAN"] || "usage",

  /** Voyage AI monthly budget envelope (USD). Те саме що Anthropic. */
  VOYAGE_MONTHLY_BUDGET_USD: parseFloatEnv("VOYAGE_MONTHLY_BUDGET_USD", 0),
  /** Voyage billing tier (`usage` для pay-as-you-go, `enterprise`). */
  VOYAGE_PLAN: process.env["VOYAGE_PLAN"] || "usage",
} as const;

export type Env = typeof env;
