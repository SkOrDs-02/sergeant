import {
  floatFromEnv,
  intFromEnv,
  strictPositiveIntFromEnv,
  stringWithDefault,
} from "./envHelpers.js";

/**
 * Voyage- і AI-memory-поля env — винесені з `env.ts` тим самим прийомом, що
 * `pgEnv.ts` і `syncEnv.ts`: Hard Rule #18 (`max-lines: 600`). Файл перетнув
 * межу, коли sec-46 (`EMAIL_VERIFICATION_REQUIRED_FROM`) і rel-34
 * (`AI_MEMORY_PROFILE_EMBED_DAILY_CAP`) дописали свої ключі одночасно.
 *
 * Zero behaviour change: spread у shape `envSchema` (`...aiMemoryEnvShape`),
 * тож `env.VOYAGE_*` і `env.AI_MEMORY_*` резолвляться як раніше.
 * `AI_MEMORY_ENABLED` і `DIGEST_AI_MEMORY_INGEST_ENABLED` лишились в `env.ts`.
 */
export const aiMemoryEnvShape = {
  VOYAGE_API_KEY: stringWithDefault(""),

  VOYAGE_EMBEDDING_MODEL: stringWithDefault("voyage-3.5-lite"),

  VOYAGE_EMBEDDING_DIM: intFromEnv(1024),

  AI_MEMORY_EMBEDDING_VERSION: stringWithDefault("1"),

  VOYAGE_TIMEOUT_MS: intFromEnv(15_000),

  VOYAGE_MAX_RETRIES: intFromEnv(2),

  VOYAGE_BATCH_SIZE: intFromEnv(32),

  AI_MEMORY_HNSW_EF_SEARCH: intFromEnv(40),

  AI_MEMORY_TOP_K: intFromEnv(8),

  AI_MEMORY_RAG_TOP_K: intFromEnv(4),

  AI_MEMORY_RAG_TIMEOUT_MS: intFromEnv(1_500),

  AI_MEMORY_DEDUP_THRESHOLD: floatFromEnv(0.97),

  AI_MEMORY_INGEST_CONCURRENCY: intFromEnv(4),

  AI_MEMORY_INGEST_MAX_CONTENT_LEN: intFromEnv(4_000),

  AI_MEMORY_INGEST_ATTEMPTS: intFromEnv(5),

  // rel-34: стеля Voyage-ембеддингів профілю на користувача за UTC-добу
  // (рішення власника 2026-11-21). `profileEmbedCap.ts`.
  AI_MEMORY_PROFILE_EMBED_DAILY_CAP: strictPositiveIntFromEnv(
    "AI_MEMORY_PROFILE_EMBED_DAILY_CAP",
    50,
  ),
};
