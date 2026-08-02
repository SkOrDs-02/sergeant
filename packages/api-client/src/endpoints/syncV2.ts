import type { HttpClient } from "../httpClient";

/**
 * Типи мають дзеркалити серверну response-форму один-в-один (Hard Rule
 * #3 із `AGENTS.md`). Якщо змінюєш форму на сервері — апдейт тут і у
 * відповідному `*.test.ts`. Сервер оголошений у
 * `apps/server/src/modules/sync/syncV2.ts`, табличний whitelist
 * (наразі `routine_entries`, `routine_streaks`) — у тому ж файлі.
 */

/**
 * Допустимі op-kind на per-row рівні.
 *
 * - `insert` / `update` / `delete` — LWW-протокол з PR #021.
 * - `increment` — PN-counter primitive, додано у Stage 5 PR #042a як
 *   protocol-only заділ під PR #042b (atomic
 *   `UPDATE … SET counter = counter + delta`). Серверна apply-фабрика
 *   після PR #042a відхиляє кожен `op='increment'` engine-level
 *   `reason='op_not_supported'`; whitelist per-таблиць вмикається у
 *   PR #042b.
 */
export type SyncV2OpKind = "insert" | "update" | "delete" | "increment";

/**
 * Один запис у вхідній черзі push-у. `idempotency_key` — ULID/UUID,
 * унікальний у межах `(user_id, idempotency_key)`. Реплеї з тим самим
 * ключем повертають кешований результат, не виконуючи DML повторно.
 */
export interface SyncV2PushOp {
  table: string;
  op: SyncV2OpKind;
  row: Record<string, unknown>;
  client_ts: string;
  idempotency_key: string;
}

export type SyncV2OpResultStatus = "applied" | "duplicate" | "rejected";

export interface SyncV2OpResult {
  idempotency_key: string;
  status: SyncV2OpResultStatus;
  reason?: string;
}

/**
 * Серверна відповідь на `POST /api/v2/sync/push`. `last_op_id` —
 * максимальний `id` у `sync_op_log`, який торкнули цей push (включно з
 * idempotency-кешованими попадайнями). Клієнт може використовувати
 * його як cursor для подальшого `pull?since=<last_op_id>` без
 * додаткового round-trip-у.
 */
export interface SyncV2PushResponse {
  accepted: number;
  last_op_id: number;
  results: SyncV2OpResult[];
}

/**
 * Один запис у відповіді pull-у. `id` — BIGSERIAL → number (Hard Rule
 * #1 — coerce у серіалайзері).
 */
export interface SyncV2PullOp {
  id: number;
  table: string;
  op: SyncV2OpKind;
  row: Record<string, unknown>;
  client_ts: string;
  server_ts: string;
  origin_device_id: string | null;
}

export interface SyncV2PullResponse {
  ops: SyncV2PullOp[];
  /** `null` коли більше нічого пулити; інакше — `id` останнього запису сторінки. */
  next_cursor: number | null;
}

export interface SyncV2PushOptions {
  /**
   * Опціональний `X-Origin-Device-Id`-заголовок, що дозволить
   * `pull` із того ж пристрою виключати власні записи.
   */
  originDeviceId?: string;
}

export interface SyncV2PullOptions {
  /** Серверний default — 100, max — 500. */
  limit?: number;
  originDeviceId?: string;
}

export interface SyncV2Endpoints {
  pushV2: (
    ops: SyncV2PushOp[],
    opts?: SyncV2PushOptions,
  ) => Promise<SyncV2PushResponse>;
  pullV2: (
    since?: number,
    opts?: SyncV2PullOptions,
  ) => Promise<SyncV2PullResponse>;
}

/**
 * Створює клієнт v2 sync поверх загального HttpClient. Шляхи —
 * `/api/v2/sync/{push,pull}`; `applyApiPrefix` залишає `/api/v2/*`
 * без модифікації, бо сервер монтує v2 окремим маунтом і не очікує
 * `/api/v1/v2/...` rewrite-у.
 */
export function createSyncV2Endpoints(http: HttpClient): SyncV2Endpoints {
  return {
    pushV2: (ops, opts) =>
      http.post<SyncV2PushResponse>(
        "/api/v2/sync/push",
        { ops },
        opts?.originDeviceId
          ? { headers: { "X-Origin-Device-Id": opts.originDeviceId } }
          : undefined,
      ),
    pullV2: (since = 0, opts) =>
      http.get<SyncV2PullResponse>("/api/v2/sync/pull", {
        query: {
          since,
          ...(opts?.limit != null ? { limit: opts.limit } : {}),
        },
        ...(opts?.originDeviceId
          ? { headers: { "X-Origin-Device-Id": opts.originDeviceId } }
          : {}),
      }),
  };
}
