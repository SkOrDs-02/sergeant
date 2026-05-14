/**
 * `/forget` slash-команда — founder-controlled selective memory deletion.
 *
 * Контекст: PR-19 (#2605) активував AI memory ingest, PR-21 (#2625) активував
 * WF-30 daily digest, PR-22 (#2712) реалізував backfill з `tg_topic_archive`.
 * Тепер founder має повний read-write cycle через `/recall` + ingest queue +
 * digest. Цей модуль додає **read-write-delete** — `/forget id|query|topic|since`
 * у founder DM (privacy / GDPR-style right-to-be-forgotten).
 *
 * ─── Архітектура ───────────────────────────────────────────────────────
 *
 * 4 режими (mode):
 *   1. `byId`         — soft-delete конкретного row-у по `ai_memories.id`.
 *   2. `byTopic`      — soft-delete усіх rows для founder × topic.
 *   3. `since`        — soft-delete усіх rows founder-а, створених після YYYY-MM-DD.
 *   4. `previewQuery` — semantic search top-K → стейджимо `forget_token` у
 *                       in-memory store + повертаємо preview для founder UI.
 *                       НЕ видаляє нічого. Confirm — окремий виклик через
 *                       `confirmForget(token)`.
 *
 * Confirm-flow (для `previewQuery`):
 *   1. `previewForget()` → INSERT pending token у `pendingForgetTokens` Map,
 *      повертає `{ token, matches }`.
 *   2. Console-bot (`tools/openclaw`) рендерить preview з inline-keyboard
 *      (✅ / ❌). Callback ✅ → `confirmForget(token)` → UPDATE deleted_at.
 *      Callback ❌ → `cancelForget(token)` → удаляє token без DB writes.
 *   3. Tokens expire через 5 хв — захист від stale tap-у (founder скрол-нув
 *      далі і натиснув ✅ на стародавньому preview-вікні).
 *
 * Soft-delete pattern (migration 067):
 *   * `UPDATE ai_memories SET deleted_at = NOW() WHERE ...` — recoverable
 *     через 7-day window. Read-path (`vectorStore.query`, RAG, digest)
 *     фільтрує `WHERE deleted_at IS NULL` (вже додано у vectorStore.ts).
 *   * Hard-delete cron (`forgetCleanup.ts`) видаляє rows коли
 *     `deleted_at < NOW() - INTERVAL '7 days'`.
 *
 * Audit trail:
 *   * Кожен forget-call пише row у `openclaw_invocations` через
 *     `openInvocation()` + `finalizeInvocation()` з
 *     `trigger='dm'`, `user_message='/forget ...'`,
 *     `metadata.deleted_count = N`.
 *   * Sentry breadcrumb `[ai-memory-forget]` для transparency
 *     (debug-friendly у Replay та session-events).
 *
 * Rate-limit:
 *   * 3 deletes/hour/founder через in-memory fixed-window bucket. Не використовуємо
 *     Express-level `checkRateLimit` тут, бо forget-вики йдуть з internal-API
 *     route з INTERNAL_API_KEY-auth (без founder-session). Бакет keyed по
 *     `founder_user_id`.
 *   * `previewForget` не споживає бакет — лише `byId`/`byTopic`/`since`/
 *     `confirmForget` (актуальний DELETE).
 *
 * Чому in-memory token store (не Postgres):
 *   * 5-хвилинна TTL, дрібний обʼєм (~10 tokens/hour max).
 *   * Replicas: один Express-сервер обслуговує console-bot via single base URL,
 *     тож rotation-між-replica не існує у Phase 1. Якщо Phase 2 додасть
 *     multi-region — перенесемо у Postgres з `forget_tokens` table-ом.
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { logger, serializeError } from "../../obs/logger.js";
import { Sentry } from "../../sentry.js";
import { openInvocation, finalizeInvocation } from "../openclaw/store.js";
import { getAiMemory } from "./bootstrap.js";
import type { MemoryQueryResult } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type ForgetMode = "byId" | "byTopic" | "since" | "previewQuery";

export interface ForgetInput {
  founderUserId: string;
  founderTgUserId: number;
  rawCommand: string;
}

export interface ForgetByIdInput extends ForgetInput {
  memoryId: number;
}

export interface ForgetByTopicInput extends ForgetInput {
  topic: string;
}

export interface ForgetSinceInput extends ForgetInput {
  /** ISO 8601 date (`YYYY-MM-DD`); evaluated as UTC midnight start. */
  sinceDate: string;
}

export interface ForgetPreviewInput extends ForgetInput {
  query: string;
  topK?: number | undefined;
}

export interface ForgetConfirmInput extends ForgetInput {
  token: string;
}

export interface ForgetMatchPreview {
  id: number;
  content: string;
  source: string;
  topic: string | null;
  similarity: number;
  createdAt: string;
}

export interface ForgetPreviewResult {
  /** Confirmation token. TTL = 5 min. Founder taps ✅ → `confirmForget(token)`. */
  token: string;
  matches: ForgetMatchPreview[];
  /** ISO 8601 expiry timestamp; UI shows "expires at HH:MM" hint. */
  expiresAt: string;
}

export interface ForgetExecuteResult {
  deletedCount: number;
  /** `openclaw_invocations.id` для cross-reference у audit UI. */
  invocationId: number;
  mode: ForgetMode;
}

/**
 * Rate-limit verdict — emitted by `forgetByXxx` callers коли founder вже
 * перевищив 3 deletes/hour. Caller-route мапає у HTTP 429.
 */
export class ForgetRateLimitError extends Error {
  readonly retryAfterSec: number;
  readonly remaining: number;
  constructor(retryAfterSec: number, remaining: number) {
    super(
      `Rate-limited: 3 deletes/hour cap reached. Retry in ${retryAfterSec}s.`,
    );
    this.name = "ForgetRateLimitError";
    this.retryAfterSec = retryAfterSec;
    this.remaining = remaining;
  }
}

export class ForgetTokenError extends Error {
  readonly reason: "expired" | "unknown" | "founder_mismatch";
  constructor(reason: "expired" | "unknown" | "founder_mismatch") {
    super(`forget token ${reason}`);
    this.name = "ForgetTokenError";
    this.reason = reason;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Rate-limit bucket (3 deletes/hour/founder)
// ─────────────────────────────────────────────────────────────────────────

const FORGET_RATE_LIMIT_MAX = 3;
const FORGET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

interface ForgetRateBucket {
  startMs: number;
  count: number;
}

const forgetBuckets = new Map<string, ForgetRateBucket>();

/**
 * Returns `null` якщо ok; інакше — `ForgetRateLimitError` з retry-after.
 * НЕ кидає — caller вирішує, як ескалувати (HTTP 429 vs queue-skip).
 *
 * Тестам потрібен escape-hatch — `__resetForgetRateLimitForTests()` чистить
 * мапу.
 */
export function checkForgetRateLimit(
  founderUserId: string,
  nowMs: number = Date.now(),
): ForgetRateLimitError | null {
  const bucket = forgetBuckets.get(founderUserId);

  if (!bucket || nowMs - bucket.startMs >= FORGET_RATE_LIMIT_WINDOW_MS) {
    forgetBuckets.set(founderUserId, { startMs: nowMs, count: 1 });
    return null;
  }

  if (bucket.count >= FORGET_RATE_LIMIT_MAX) {
    const elapsedMs = nowMs - bucket.startMs;
    const remainingMs = FORGET_RATE_LIMIT_WINDOW_MS - elapsedMs;
    return new ForgetRateLimitError(
      Math.max(1, Math.ceil(remainingMs / 1000)),
      0,
    );
  }

  bucket.count += 1;
  return null;
}

export function __resetForgetRateLimitForTests(): void {
  forgetBuckets.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Pending-token store (5-min TTL)
// ─────────────────────────────────────────────────────────────────────────

const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;

interface PendingForgetToken {
  token: string;
  founderUserId: string;
  founderTgUserId: number;
  memoryIds: number[];
  rawCommand: string;
  expiresAtMs: number;
  query: string;
}

const pendingTokens = new Map<string, PendingForgetToken>();

function sweepExpiredTokens(nowMs: number): void {
  for (const [token, record] of pendingTokens.entries()) {
    if (record.expiresAtMs <= nowMs) pendingTokens.delete(token);
  }
}

export function __resetForgetTokensForTests(): void {
  pendingTokens.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Core helpers — audit row + Sentry breadcrumb
// ─────────────────────────────────────────────────────────────────────────

interface AuditForgetParams {
  pool: Pool;
  founderUserId: string;
  founderTgUserId: number;
  rawCommand: string;
  mode: ForgetMode;
  deletedCount: number;
  metadata?: Record<string, unknown>;
  error?: Error | undefined;
}

async function auditForget(params: AuditForgetParams): Promise<number> {
  const invocationId = await openInvocation(params.pool, {
    founderUserId: params.founderUserId,
    founderTgUserId: params.founderTgUserId,
    trigger: "dm",
    userMessage: params.rawCommand,
    metadata: {
      kind: "ai-memory-forget",
      mode: params.mode,
      ...params.metadata,
    },
  });

  await finalizeInvocation(params.pool, {
    invocationId,
    status: params.error ? "error" : "success",
    assistantResponse: params.error
      ? `forget failed: ${params.error.message}`
      : `Deleted ${params.deletedCount} row(s) via /forget ${params.mode}.`,
    toolCalls: [],
    costUsd: 0,
    durationMs: 0,
    iterations: 0,
    errorMessage: params.error ? params.error.message : null,
    toneMode: null,
    metadataPatch: {
      deleted_count: params.deletedCount,
      ...(params.metadata ?? {}),
    },
  });

  return invocationId;
}

function breadcrumbForget(
  mode: ForgetMode,
  founderUserId: string,
  fields: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: "ai-memory-forget",
    level: "info",
    message: `forget.${mode}`,
    data: {
      founder_user_id: founderUserId,
      ...fields,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Soft-delete SQL helpers
// ─────────────────────────────────────────────────────────────────────────

async function softDeleteByIds(
  pool: Pool,
  founderUserId: string,
  ids: readonly number[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await pool.query(
    `UPDATE ai_memories
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
        AND id = ANY($2::bigint[])
        AND deleted_at IS NULL`,
    [founderUserId, ids],
  );
  return result.rowCount ?? 0;
}

async function softDeleteByTopic(
  pool: Pool,
  founderUserId: string,
  topic: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE ai_memories
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
        AND topic = $2
        AND deleted_at IS NULL`,
    [founderUserId, topic],
  );
  return result.rowCount ?? 0;
}

async function softDeleteSince(
  pool: Pool,
  founderUserId: string,
  sinceDate: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE ai_memories
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
        AND created_at >= $2::timestamptz
        AND deleted_at IS NULL`,
    [founderUserId, sinceDate],
  );
  return result.rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * `/forget id <N>` — direct soft-delete of one memory row.
 *
 * Rate-limited (3/hour). Falls through `ForgetRateLimitError` if exceeded.
 * Audit row written in `openclaw_invocations` with `metadata.deleted_count`.
 */
export async function forgetById(
  pool: Pool,
  input: ForgetByIdInput,
): Promise<ForgetExecuteResult> {
  const rateLimit = checkForgetRateLimit(input.founderUserId);
  if (rateLimit) throw rateLimit;

  let deletedCount = 0;
  let auditError: Error | undefined;
  try {
    deletedCount = await softDeleteByIds(pool, input.founderUserId, [
      input.memoryId,
    ]);
  } catch (err) {
    auditError = err instanceof Error ? err : new Error(String(err));
    logger.error({
      msg: "ai_memory_forget_byid_failed",
      founderUserId: input.founderUserId,
      memoryId: input.memoryId,
      err: serializeError(auditError),
    });
  }

  const invocationId = await auditForget({
    pool,
    founderUserId: input.founderUserId,
    founderTgUserId: input.founderTgUserId,
    rawCommand: input.rawCommand,
    mode: "byId",
    deletedCount,
    metadata: { memory_id: input.memoryId },
    error: auditError,
  });

  breadcrumbForget("byId", input.founderUserId, {
    memory_id: input.memoryId,
    deleted_count: deletedCount,
  });

  if (auditError) throw auditError;
  return { deletedCount, invocationId, mode: "byId" };
}

/**
 * `/forget topic <topic>` — soft-delete всіх rows founder × topic. Топ-down
 * use-case: "забудь усе про project X".
 */
export async function forgetByTopic(
  pool: Pool,
  input: ForgetByTopicInput,
): Promise<ForgetExecuteResult> {
  const rateLimit = checkForgetRateLimit(input.founderUserId);
  if (rateLimit) throw rateLimit;

  let deletedCount = 0;
  let auditError: Error | undefined;
  try {
    deletedCount = await softDeleteByTopic(
      pool,
      input.founderUserId,
      input.topic,
    );
  } catch (err) {
    auditError = err instanceof Error ? err : new Error(String(err));
    logger.error({
      msg: "ai_memory_forget_bytopic_failed",
      founderUserId: input.founderUserId,
      topic: input.topic,
      err: serializeError(auditError),
    });
  }

  const invocationId = await auditForget({
    pool,
    founderUserId: input.founderUserId,
    founderTgUserId: input.founderTgUserId,
    rawCommand: input.rawCommand,
    mode: "byTopic",
    deletedCount,
    metadata: { topic: input.topic },
    error: auditError,
  });

  breadcrumbForget("byTopic", input.founderUserId, {
    topic: input.topic,
    deleted_count: deletedCount,
  });

  if (auditError) throw auditError;
  return { deletedCount, invocationId, mode: "byTopic" };
}

/**
 * `/forget since YYYY-MM-DD` — soft-delete всіх rows founder created on or
 * after date. Use sparingly — danger of mass-wipe.
 */
export async function forgetSince(
  pool: Pool,
  input: ForgetSinceInput,
): Promise<ForgetExecuteResult> {
  const rateLimit = checkForgetRateLimit(input.founderUserId);
  if (rateLimit) throw rateLimit;

  let deletedCount = 0;
  let auditError: Error | undefined;
  try {
    deletedCount = await softDeleteSince(
      pool,
      input.founderUserId,
      input.sinceDate,
    );
  } catch (err) {
    auditError = err instanceof Error ? err : new Error(String(err));
    logger.error({
      msg: "ai_memory_forget_since_failed",
      founderUserId: input.founderUserId,
      sinceDate: input.sinceDate,
      err: serializeError(auditError),
    });
  }

  const invocationId = await auditForget({
    pool,
    founderUserId: input.founderUserId,
    founderTgUserId: input.founderTgUserId,
    rawCommand: input.rawCommand,
    mode: "since",
    deletedCount,
    metadata: { since_date: input.sinceDate },
    error: auditError,
  });

  breadcrumbForget("since", input.founderUserId, {
    since_date: input.sinceDate,
    deleted_count: deletedCount,
  });

  if (auditError) throw auditError;
  return { deletedCount, invocationId, mode: "since" };
}

/**
 * `/forget query <text>` — semantic search top-K + stage `forget_token`.
 *
 * НЕ видаляє нічого. Caller-console показує preview з inline-keyboard;
 * `confirmForget(token)` потім виконує soft-delete.
 *
 * Не споживає rate-limit-бакет — preview це безкоштовно read-op. Бакет
 * списується тільки при `confirmForget()`.
 */
export async function previewForget(
  input: ForgetPreviewInput,
): Promise<ForgetPreviewResult> {
  const topK = input.topK ?? 5;
  const results = await getAiMemory().recall({
    userId: input.founderUserId,
    query: input.query,
    topK,
    sources: ["cofounder"],
  });

  const token = randomUUID();
  const expiresAtMs = Date.now() + PREVIEW_TOKEN_TTL_MS;

  sweepExpiredTokens(Date.now());
  pendingTokens.set(token, {
    token,
    founderUserId: input.founderUserId,
    founderTgUserId: input.founderTgUserId,
    memoryIds: results.map((r) => r.id),
    rawCommand: input.rawCommand,
    query: input.query,
    expiresAtMs,
  });

  breadcrumbForget("previewQuery", input.founderUserId, {
    query: input.query,
    match_count: results.length,
    token_short: token.slice(0, 8),
  });

  return {
    token,
    matches: results.map(toMatchPreview),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function toMatchPreview(r: MemoryQueryResult): ForgetMatchPreview {
  return {
    id: r.id,
    content: r.content,
    source: r.source,
    topic: (r.metadata?.["topic"] as string | undefined) ?? null,
    similarity: r.score,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Confirm staged forget — soft-delete memories pointed by `token`.
 *
 * Rate-limited (споживає 1 з 3-per-hour). Якщо token unknown / expired /
 * mismatch — кидає `ForgetTokenError`.
 */
export async function confirmForget(
  pool: Pool,
  input: ForgetConfirmInput,
): Promise<ForgetExecuteResult> {
  sweepExpiredTokens(Date.now());
  const record = pendingTokens.get(input.token);
  if (!record) {
    throw new ForgetTokenError("unknown");
  }
  if (record.expiresAtMs <= Date.now()) {
    pendingTokens.delete(input.token);
    throw new ForgetTokenError("expired");
  }
  if (record.founderUserId !== input.founderUserId) {
    throw new ForgetTokenError("founder_mismatch");
  }

  const rateLimit = checkForgetRateLimit(input.founderUserId);
  if (rateLimit) throw rateLimit;

  pendingTokens.delete(input.token);

  let deletedCount = 0;
  let auditError: Error | undefined;
  try {
    deletedCount = await softDeleteByIds(
      pool,
      input.founderUserId,
      record.memoryIds,
    );
  } catch (err) {
    auditError = err instanceof Error ? err : new Error(String(err));
    logger.error({
      msg: "ai_memory_forget_confirm_failed",
      founderUserId: input.founderUserId,
      token_short: input.token.slice(0, 8),
      err: serializeError(auditError),
    });
  }

  const invocationId = await auditForget({
    pool,
    founderUserId: input.founderUserId,
    founderTgUserId: input.founderTgUserId,
    rawCommand: input.rawCommand,
    mode: "previewQuery",
    deletedCount,
    metadata: {
      query: record.query,
      match_count: record.memoryIds.length,
      token_short: input.token.slice(0, 8),
    },
    error: auditError,
  });

  breadcrumbForget("previewQuery", input.founderUserId, {
    deleted_count: deletedCount,
    token_short: input.token.slice(0, 8),
  });

  if (auditError) throw auditError;
  return { deletedCount, invocationId, mode: "previewQuery" };
}

/**
 * Cancel staged forget — drop token without DB writes. Used коли founder
 * натискає ❌ у inline-keyboard. No rate-limit consumed.
 */
export function cancelForget(token: string, founderUserId: string): boolean {
  const record = pendingTokens.get(token);
  if (!record) return false;
  if (record.founderUserId !== founderUserId) return false;
  pendingTokens.delete(token);
  return true;
}
