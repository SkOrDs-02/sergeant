import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── Auth-mail jobs (BullMQ) ────────────
export const authMailJobsEnqueuedTotal = new client.Counter({
  name: "auth_mail_jobs_enqueued_total",
  help: "Auth transactional mail enqueue attempts by mode",
  labelNames: ["mode"], // queued|fallback|enqueue_error
  registers: [register],
});

export const authMailJobsProcessedTotal = new client.Counter({
  name: "auth_mail_jobs_processed_total",
  help: "Auth transactional mail processor outcomes",
  labelNames: ["outcome"], // ok|retry|permanent_fail
  registers: [register],
});

export const authMailJobDurationMs = new client.Histogram({
  name: "auth_mail_job_duration_ms",
  help: "Auth transactional mail per-job duration (ms)",
  labelNames: ["outcome"], // ok|retry|permanent_fail
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const authMailQueueDepth = new client.Gauge({
  name: "auth_mail_queue_depth",
  help: "BullMQ auth-mail queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});

// ───────────────────── FTUX drip jobs (BullMQ) ────────────────
// Metric set дзеркалить auth-mail-набір. Лейбл `day` (`day_0|day_1|day_3`)
// дозволяє відрізняти Day-0 (immediate) від delayed-job-ів і дивитись на
// drop-off між днями (Day 0 надсилається 100%, Day 1/3 — після opt-out
// фільтрації + idempotency-перевірок). Лейбл `outcome` для processedTotal:
//   - `ok` — лист пішов через Resend
//   - `skipped_optout` — opt-out зафіксований у `email_unsubscribes`
//   - `skipped_already_sent` — `email_campaigns_log` уже має row
//   - `skipped_user_deleted` — юзера вже немає (3-day-ге очікування)
//   - `retry` / `permanent_fail` — як і в auth-mail.
export const ftuxDripJobsEnqueuedTotal = new client.Counter({
  name: "ftux_drip_jobs_enqueued_total",
  help: "FTUX drip mail enqueue attempts by mode and day",
  labelNames: ["mode", "day"], // mode: queued|fallback|skipped_no_redis|enqueue_error
  registers: [register],
});

export const ftuxDripJobsProcessedTotal = new client.Counter({
  name: "ftux_drip_jobs_processed_total",
  help: "FTUX drip mail processor outcomes",
  labelNames: ["outcome", "day"],
  // outcome: ok|retry|permanent_fail|skipped_optout|skipped_already_sent|skipped_user_deleted
  registers: [register],
});

export const ftuxDripJobDurationMs = new client.Histogram({
  name: "ftux_drip_job_duration_ms",
  help: "FTUX drip mail per-job duration (ms)",
  labelNames: ["outcome", "day"],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const ftuxDripQueueDepth = new client.Gauge({
  name: "ftux_drip_queue_depth",
  help: "BullMQ ftux-drip queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});

export const ftuxDripUnsubscribesTotal = new client.Counter({
  name: "ftux_drip_unsubscribes_total",
  help: "FTUX drip opt-out clicks by outcome",
  labelNames: ["outcome"], // ok|already_unsubscribed|invalid_token|missing_secret
  registers: [register],
});

// ───────────────── AI memory ingestion (BullMQ) ───────────────
// Лічильники для PR2-черги `ai-memory-ingest` (Redis-keys під префіксом
// `sergeant:`). Дзеркалять
// auth-mail-набір (enqueue / process / depth + duration), але з
// додатковим лейблом `source`, щоб алерти могли біти по конкретному
// домену (наприклад, finyk-spike при back-fill-і Monobank).
export const aiMemoryIngestEnqueuedTotal = new client.Counter({
  name: "ai_memory_ingest_enqueued_total",
  help: "AI memory ingest enqueue attempts by mode and source",
  // mode: queued|fallback|enqueue_error|disabled|source_disabled
  //   queued          — job pushed to BullMQ successfully
  //   fallback        — Redis unavailable; in-process direct dispatch
  //   enqueue_error   — Redis push failed (network / serialization / invalid source)
  //   disabled        — master AI_MEMORY_ENABLED=false (kills all sources)
  //   source_disabled — per-source flag off (e.g. MONO_AI_MEMORY_INGEST_ENABLED=false)
  labelNames: ["mode", "source"],
  registers: [register],
});

export const aiMemoryIngestProcessedTotal = new client.Counter({
  name: "ai_memory_ingest_processed_total",
  help: "AI memory ingest job outcomes",
  // outcome:
  //   ok             — job succeeded.
  //   retry          — retryable error; BullMQ scheduled next attempt.
  //   permanent_fail — non-retryable error (e.g. Voyage 4xx, invalid payload).
  //   dlq            — written to ai_memory_ingest_failed (DLQ); either
  //                    non-retryable error OR retries-exhausted final attempt.
  //                    Counted IN ADDITION to permanent_fail / retry outcome
  //                    so dashboards can distinguish "wrote to DLQ" from
  //                    "final fail outcome".
  //   skipped        — pre-flight skip (legacy; kept for back-compat).
  labelNames: ["outcome", "source"],
  registers: [register],
});

export const aiMemoryIngestDurationMs = new client.Histogram({
  name: "ai_memory_ingest_duration_ms",
  help: "AI memory ingest per-job duration (ms)",
  labelNames: ["outcome", "source"],
  // Voyage embed-and-upsert ~300–500мс типово; bucket-и розтягнуті, бо
  // у retry-сценарії duration може охопити timeout (`VOYAGE_TIMEOUT_MS`).
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const aiMemoryIngestQueueDepth = new client.Gauge({
  name: "ai_memory_ingest_queue_depth",
  help: "BullMQ AI memory ingest queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});
