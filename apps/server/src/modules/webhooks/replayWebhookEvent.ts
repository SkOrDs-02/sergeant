/**
 * PR-29 — webhook event replay helper.
 *
 * Re-POST-ить збережений у `n8n_webhook_events` payload назад у n8n
 * webhook URL (тобто фактично reruns business-логіку, яку n8n виконує
 * на live-доставці). Викликається з:
 *   * `scripts/replay-webhook.mjs` через `POST /api/internal/webhook-events/replay`.
 *   * Internal admin API endpoint напряму.
 *
 * Архітектура replay-у:
 *
 *   replay-CLI → POST /api/internal/webhook-events/replay
 *                  (admin / bearer auth у routes/internal/index.ts)
 *                  → listReplayableEvents (SELECT з n8n_webhook_events)
 *                  → (dry-run) повертає список з event-ID-ями без HTTP-виклику
 *                  → (execute) для кожного event-а:
 *                       1. POST {N8N_WEBHOOK_BASE_URL}/webhook/{path} з payload-ом
 *                       2. UPDATE n8n_webhook_events SET
 *                            replay_count = replay_count + 1,
 *                            last_replayed_at = now(),
 *                            processed_at = COALESCE(processed_at, now()),
 *                            error = NULL
 *                          WHERE id = $1
 *                       3. fail-soft: per-event помилки записуються в response,
 *                          інші event-и продовжують replay-итися.
 *
 * Чому fail-soft per-event (а не abort-batch на першій помилці):
 *   incident-replay типово фіксить bug-у у n8n / downstream API; перші
 *   події можуть упасти бо bug ще був, а наступні — пройти бо fix
 *   вже задеплоєний. Operator може потім зробити повторний replay-CLI
 *   тільки для failed-event-ID-ів через `--event-ids=...`.
 *
 * Чому не оновлюємо `error` при failed-replay-і:
 *   `error` колонка зарезервована за original-ingest-failure. Replay-
 *   failure — окремий signal, кодуємо його у HTTP-response від CLI/API,
 *   щоб не плутати dashboards «pending-events» з «failed-replays».
 *
 * Hard Rule #1: pg повертає `bigint` як string — coerce-имо у number
 * при списку event-ID-ями (`Number(row.id)`).
 *
 * Hard Rule #21: payload вже redacted-ний на ingest-side
 * (`recordWebhookEvent.sanitizeHeaders`), тому fresh `headers` для
 * replay-у — мінімальний `Content-Type: application/json` + опційний
 * `X-Replay-Source: sergeant-replay-cli` маркер.
 */

import type { Pool } from "pg";

/**
 * Mapping `workflow_id` → n8n webhook path. Кожен workflow_id вказує
 * на `parameters.path` із webhook-вузла n8n-workflow-JSON у `ops/n8n-workflows/`.
 *
 * Чому hardcode, а не parse manifest:
 *   * Set малий (4 workflow-и на момент PR-28).
 *   * Manifest.json не зберігає webhook-path-у — він у самих workflow-JSON-ах.
 *   * Зміна path-а — breaking change у самому n8n-workflow; гарантує,
 *     що зміна цього mapping-у проходить code review.
 */
export const WORKFLOW_ID_TO_WEBHOOK_PATH: Readonly<Record<string, string>> = {
  "01-billing-pipeline": "stripe-subscription",
  "02-failed-payment-recovery": "stripe-payment-failed",
  "06-mono-webhook-enrichment": "mono-transaction",
  "15-railway-deployment-notify": "railway-deploy",
};

/** Список допустимих workflow_id для CLI / API validation-у. */
export const REPLAYABLE_WORKFLOW_IDS = Object.freeze(
  Object.keys(WORKFLOW_ID_TO_WEBHOOK_PATH),
);

export class UnknownWorkflowError extends Error {
  readonly code = "UNKNOWN_WORKFLOW";
  readonly workflowId: string;
  constructor(workflowId: string) {
    super(
      `replayWebhookEvent: workflow_id "${workflowId}" не у WORKFLOW_ID_TO_WEBHOOK_PATH; додай у apps/server/src/modules/webhooks/replayWebhookEvent.ts якщо це новий n8n webhook-WF.`,
    );
    this.name = "UnknownWorkflowError";
    this.workflowId = workflowId;
  }
}

export class ReplayHttpError extends Error {
  readonly code = "REPLAY_HTTP_ERROR";
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(
      `replayWebhookEvent: target webhook повернув HTTP ${status}: ${body.slice(0, 200)}`,
    );
    this.name = "ReplayHttpError";
    this.status = status;
    this.body = body;
  }
}

export interface ReplayableEvent {
  /** BIGSERIAL primary key. Hard Rule #1: number, не string. */
  id: number;
  workflowId: string;
  source: string;
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
  replayCount: number;
  lastReplayedAt: Date | null;
}

export interface ListReplayableEventsInput {
  workflowId: string;
  /** Inclusive lower bound по `received_at`. Optional. */
  since?: Date;
  /** Конкретні event-ID-ями. Якщо передано — `since` ignored. */
  eventIds?: ReadonlyArray<number>;
  /** SELECT batch-cap. Default 100; max 1000 (protect-имо CLI від blast-radius-у). */
  limit?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * SELECT-ить replay-кандидати з `n8n_webhook_events`. Default — events
 * за останні 24h по workflow-id-у; з `since` — старіші; з `eventIds`
 * — точкове по IDs.
 *
 * Bigint id coerce-иться у `number` per Hard Rule #1.
 */
export async function listReplayableEvents(
  pool: Pool,
  input: ListReplayableEventsInput,
): Promise<ReplayableEvent[]> {
  if (!REPLAYABLE_WORKFLOW_IDS.includes(input.workflowId)) {
    throw new UnknownWorkflowError(input.workflowId);
  }

  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));

  let sql: string;
  let params: unknown[];

  if (input.eventIds && input.eventIds.length > 0) {
    // Точкове ID-based — все одно фільтр по workflow_id щоб CLI не
    // міг випадково replay-нути чужий WF подавши неправильні IDs.
    sql = `
      SELECT id, workflow_id, source, payload, received_at,
             processed_at, replay_count, last_replayed_at
        FROM n8n_webhook_events
       WHERE workflow_id = $1
         AND id = ANY($2::bigint[])
       ORDER BY received_at ASC
       LIMIT $3`;
    params = [input.workflowId, input.eventIds, limit];
  } else if (input.since) {
    sql = `
      SELECT id, workflow_id, source, payload, received_at,
             processed_at, replay_count, last_replayed_at
        FROM n8n_webhook_events
       WHERE workflow_id = $1
         AND received_at >= $2
       ORDER BY received_at ASC
       LIMIT $3`;
    params = [input.workflowId, input.since, limit];
  } else {
    sql = `
      SELECT id, workflow_id, source, payload, received_at,
             processed_at, replay_count, last_replayed_at
        FROM n8n_webhook_events
       WHERE workflow_id = $1
         AND received_at >= now() - interval '24 hours'
       ORDER BY received_at ASC
       LIMIT $2`;
    params = [input.workflowId, limit];
  }

  const result = await pool.query<{
    id: string;
    workflow_id: string;
    source: string;
    payload: unknown;
    received_at: Date;
    processed_at: Date | null;
    replay_count: number;
    last_replayed_at: Date | null;
  }>(sql, params);

  return result.rows.map((r) => ({
    id: Number(r.id),
    workflowId: r.workflow_id,
    source: r.source,
    payload: r.payload,
    receivedAt: r.received_at,
    processedAt: r.processed_at,
    replayCount: r.replay_count,
    lastReplayedAt: r.last_replayed_at,
  }));
}

export interface ReplayWebhookEventInput {
  event: ReplayableEvent;
  /** Base URL n8n-інстансу — `https://n8n.example.com` (без `/webhook/` суфіксу). */
  n8nWebhookBaseUrl: string;
  /** Optional fetch overide для тестів. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Timeout у мс. Default 10_000. */
  timeoutMs?: number;
}

export interface ReplayWebhookEventResult {
  id: number;
  status: number;
  /** Updated `replay_count` після успішного DB-UPDATE-у. */
  replayCount: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Re-POST-ить event-payload на n8n webhook URL. Якщо HTTP-status 2xx —
 * UPDATE-ить `n8n_webhook_events` row (інкрементує `replay_count`,
 * виставляє `last_replayed_at`, clear-ить `error`, виставляє
 * `processed_at` якщо був NULL).
 *
 * Throws:
 *   * `UnknownWorkflowError` — `event.workflowId` не у mapping-у.
 *   * `ReplayHttpError` — target webhook повернув non-2xx.
 *   * `AbortError` — timeout (typeof DOMException, name="AbortError").
 *   * `pg`-помилки — bubble-up.
 */
export async function replayWebhookEvent(
  pool: Pool,
  input: ReplayWebhookEventInput,
): Promise<ReplayWebhookEventResult> {
  const path = WORKFLOW_ID_TO_WEBHOOK_PATH[input.event.workflowId];
  if (!path) {
    throw new UnknownWorkflowError(input.event.workflowId);
  }

  const baseUrl = input.n8nWebhookBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/webhook/${path}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Маркер у logs / n8n executions — дозволяє відфільтрувати
        // replay-traffic від organic webhook-flow під час debug-у.
        "x-replay-source": "sergeant-replay-cli",
        "x-replay-event-id": String(input.event.id),
      },
      body: JSON.stringify(input.event.payload ?? null),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutTimer);
  }

  if (!response.ok) {
    // Read-once тіло щоб включити у помилку (n8n часто повертає
    // `{"message":"..."}` JSON).
    const body = await response.text().catch(() => "");
    throw new ReplayHttpError(response.status, body);
  }

  // 2xx → UPDATE DB атомарно. RETURNING — щоб відразу повернути
  // оновлений `replay_count` без додаткового read-у.
  const updated = await pool.query<{ replay_count: number }>(
    `UPDATE n8n_webhook_events
        SET replay_count = replay_count + 1,
            last_replayed_at = now(),
            processed_at = COALESCE(processed_at, now()),
            error = NULL
      WHERE id = $1
   RETURNING replay_count`,
    [input.event.id],
  );

  const row = updated.rows[0];
  if (!row) {
    // Гонка з retention-poller-ом — рядок зник між SELECT-ом і UPDATE-ом.
    // Поверни 0 щоб caller-CLI міг пояснити operator-у, що подія була
    // видалена retention-ом між batch-планом і виконанням.
    return {
      id: input.event.id,
      status: response.status,
      replayCount: 0,
    };
  }

  return {
    id: input.event.id,
    status: response.status,
    replayCount: row.replay_count,
  };
}
