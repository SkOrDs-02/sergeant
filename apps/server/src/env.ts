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
} as const;

export type Env = typeof env;
