/**
 * PR-28 — webhook replay infrastructure.
 *
 * `recordWebhookEvent` — server-side helper для INSERT-у append-only рядка
 * в `n8n_webhook_events` (migration 060) перед business-обробкою webhook-у.
 * Викликається з:
 *   * n8n workflow-ів напряму через `n8n-nodes-base.postgres` (raw INSERT).
 *   * server-side webhook handler-ів, які приймають доставку до того, як
 *     передадуть на n8n (наприклад, internal-relay).
 *
 * Інваріанти:
 *   * Append-only. Жодних UPDATE/DELETE — то робота `retentionPoller`.
 *   * Hard Rule #1 (DB types): `id` повертається як `number`, а не string,
 *     щоб RQ caches / OpenAPI types не отримували string-bigint.
 *   * Hard Rule #21 (Pino redaction): `headers` фільтруються через
 *     allowlist; sensitive headers (`authorization`, `cookie`,
 *     `x-mono-webhook-secret`, …) видаляються до запису в БД (вони НЕ
 *     потрібні для replay-у і їх зберігання — security-liability).
 *   * Payload size cap: `MAX_PAYLOAD_BYTES` (default 256 KB). Більший
 *     payload → `PayloadTooLargeError`. Кожен provider, який сюди заходить
 *     (Stripe, Mono, Railway), уже cap-ить webhook size <100 KB; 256 KB
 *     дає margin без ризику blow-up-нути JSONB column heap.
 */

import type { Pool } from "pg";

/** Максимальний розмір payload-у (JSON-серіалізованого) у байтах. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

/** Максимальний розмір headers-об'єкта (JSON-серіалізованого) у байтах. */
export const MAX_HEADERS_BYTES = 8 * 1024;

/**
 * Allowlist headers, які безпечно зберігати для replay. Усе поза цим
 * списком redact-ається ще до INSERT-у (case-insensitive порівняння).
 *
 * Філософія: replay potrebuje тільки provider-identification headers
 * (request-id для cross-reference з provider-логами, signature-id щоб
 * перевірити кому належить запис). Все, що дає authorization /
 * impersonation — у redact list.
 */
export const SAFE_HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  "content-type",
  "user-agent",
  "x-request-id",
  "x-forwarded-for",
  "x-stripe-signature-id",
  "x-mono-request-id",
  "x-mono-x-request-id",
  "x-railway-deployment-id",
  "x-railway-event",
  "x-github-event",
  "x-github-delivery",
  "x-n8n-execution-id",
  "x-n8n-workflow-id",
]);

export class PayloadTooLargeError extends Error {
  readonly code = "PAYLOAD_TOO_LARGE";
  readonly limit: number;
  readonly actual: number;
  constructor(actual: number, limit: number) {
    super(
      `recordWebhookEvent: payload ${actual} bytes exceeds limit ${limit} bytes`,
    );
    this.name = "PayloadTooLargeError";
    this.actual = actual;
    this.limit = limit;
  }
}

export class HeadersTooLargeError extends Error {
  readonly code = "HEADERS_TOO_LARGE";
  readonly limit: number;
  readonly actual: number;
  constructor(actual: number, limit: number) {
    super(
      `recordWebhookEvent: headers ${actual} bytes exceeds limit ${limit} bytes`,
    );
    this.name = "HeadersTooLargeError";
    this.actual = actual;
    this.limit = limit;
  }
}

export interface RecordWebhookEventInput {
  /** Короткий handle n8n workflow-у — '01-billing-pipeline', '06-mono-webhook-enrichment'. */
  workflowId: string;
  /** Provider handle — 'stripe', 'mono', 'railway'. */
  source: string;
  /** Raw webhook body. Серіалізується у JSONB. */
  payload: unknown;
  /** Request headers (raw). Через allowlist + redact фільтруються до INSERT-у. */
  headers?: Record<string, string | string[] | undefined>;
}

export interface RecordWebhookEventResult {
  /** BIGSERIAL primary key, coerced to `number` per Hard Rule #1. */
  id: number;
  /** Server-clock-time INSERT-у. */
  receivedAt: Date;
}

/**
 * Фільтрує `headers` через `SAFE_HEADER_ALLOWLIST` (case-insensitive).
 * Будь-який entry поза allowlist-ом — викидається. Це happens ДО INSERT-у,
 * тож sensitive headers взагалі не потрапляють у БД (а не просто
 * mask-аються в логах).
 *
 * Array-valued headers (Express дублює одного імені header-ів у array)
 * join-ляться через `, ` — стандартний HTTP-варіант serialization-у.
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (rawValue === undefined) continue;
    const key = rawKey.toLowerCase();
    if (!SAFE_HEADER_ALLOWLIST.has(key)) continue;
    out[key] = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
  }
  return out;
}

/**
 * INSERT-ить append-only рядок у `n8n_webhook_events`. Повертає
 * `{ id, receivedAt }` для caller-а (типово, n8n workflow / handler
 * використає `id` як correlation key у наступних update-ах
 * `processed_at`/`error`).
 *
 * Throws:
 *   * `PayloadTooLargeError` — payload-JSON > `MAX_PAYLOAD_BYTES`.
 *   * `HeadersTooLargeError` — sanitized-headers-JSON > `MAX_HEADERS_BYTES`.
 *     (Малоймовірно після allowlist, але cap залишається як defence
 *     проти `x-forwarded-for` з тисячею IP-проксі-хопів.)
 *   * Будь-яка `pg`-помилка — bubble-up без обгортки (caller-овий
 *     контекст краще знає, як логувати).
 */
export async function recordWebhookEvent(
  pool: Pool,
  input: RecordWebhookEventInput,
): Promise<RecordWebhookEventResult> {
  const payloadJson = JSON.stringify(input.payload ?? null);
  const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError(payloadBytes, MAX_PAYLOAD_BYTES);
  }

  const sanitizedHeaders = sanitizeHeaders(input.headers);
  const headersJson = JSON.stringify(sanitizedHeaders);
  const headersBytes = Buffer.byteLength(headersJson, "utf8");
  if (headersBytes > MAX_HEADERS_BYTES) {
    throw new HeadersTooLargeError(headersBytes, MAX_HEADERS_BYTES);
  }

  const result = await pool.query<{ id: string; received_at: Date }>(
    `INSERT INTO n8n_webhook_events (workflow_id, source, payload, headers)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, received_at`,
    [input.workflowId, input.source, payloadJson, headersJson],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "recordWebhookEvent: INSERT … RETURNING returned no rows (impossible without rollback)",
    );
  }

  return {
    // Hard Rule #1: pg returns bigint as string — coerce to number.
    id: Number(row.id),
    receivedAt: row.received_at,
  };
}

/**
 * UPDATE-ить `processed_at` для уже існуючого рядка. Викликається
 * caller-ом після успішної business-обробки (success-path).
 *
 * Idempotent: повторний виклик з тим самим `id` просто перезапише
 * `processed_at` на пізніший timestamp; consumer-логіки не ламає.
 */
export async function markWebhookEventProcessed(
  pool: Pool,
  id: number,
): Promise<void> {
  await pool.query(
    `UPDATE n8n_webhook_events
        SET processed_at = now(),
            error = NULL
      WHERE id = $1`,
    [id],
  );
}

/**
 * UPDATE-ить `error` для уже існуючого рядка. Викликається на
 * failure-path; `processed_at` залишається NULL (тобто рядок видно у
 * `n8n_webhook_events_pending_idx` як «завислий», доки caller не
 * викличе `markWebhookEventProcessed` після retry).
 *
 * `errorMessage` обрізається до 8 KB щоб не blow-up рядок під час
 * incident-storm-у (наприклад, value-stack-trace на 1 MB).
 */
export async function markWebhookEventFailed(
  pool: Pool,
  id: number,
  errorMessage: string,
): Promise<void> {
  const truncated =
    errorMessage.length > 8 * 1024
      ? `${errorMessage.slice(0, 8 * 1024)}…[truncated]`
      : errorMessage;
  await pool.query(
    `UPDATE n8n_webhook_events
        SET error = $2
      WHERE id = $1`,
    [id, truncated],
  );
}
