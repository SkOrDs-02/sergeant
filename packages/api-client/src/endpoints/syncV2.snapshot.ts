import { SYNC_CURSOR_EXPIRED_CODE } from "@sergeant/shared";
import { isApiError } from "../ApiError";
import type { HttpClient } from "../httpClient";
import type { SyncV2PullOp } from "./syncV2";

/**
 * `GET /api/v2/sync/snapshot` і `410 sync_cursor_expired` на pull
 * (ADR-0105 §3). Типи дзеркалять сервер один-в-один (Hard Rule #3):
 * `apps/server/src/modules/sync/syncV2Snapshot.ts` і `syncOpLogFloor.ts`.
 *
 * Маршрут закритий серверним прапорцем `SYNC_SNAPSHOT_ENABLED` (дефолт
 * вимкнено -> 404), доки клієнтський bootstrap не готовий.
 */

export { SYNC_CURSOR_EXPIRED_CODE };

/**
 * Одна сторінка знімка. `ops` - поточні рядки модульних sync-таблиць у формі
 * pull-оп-ів (`op: "insert"`, `row` у формі колонок, tombstone-и з
 * `deleted_at` включно, `id` = `as_of_op_id`, `origin_device_id: null`),
 * тож застосовуються тим самим `applyPullOp`.
 */
export interface SyncV2SnapshotResponse {
  ops: SyncV2PullOp[];
  /**
   * Курсор pull, на який клієнт стає ПІСЛЯ останньої сторінки. Знімається на
   * першій сторінці й повертається на кожній без змін; передається назад
   * разом із `cursor`. BIGINT -> number (Hard Rule #1).
   */
  as_of_op_id: number;
  /** Непрозорий курсор наступної сторінки; `null` - знімок завершено. */
  next_cursor: string | null;
}

export interface SyncV2SnapshotOptions {
  /** `next_cursor` попередньої сторінки; без нього - перша сторінка. */
  cursor?: string;
  /** `as_of_op_id` першої сторінки; обовʼязковий разом із `cursor`. */
  asOfOpId?: number;
  /** Стеля рядків на сторінку (серверний дефолт і max - 500). */
  limit?: number;
}

/**
 * Тіло `410` на `GET /api/v2/sync/pull`: стандартна форма помилки сервера
 * з `code: "sync_cursor_expired"` і `details: [{ floor_id }]`.
 */
export interface SyncCursorExpiredErrorBody {
  error: string;
  message: string;
  code: typeof SYNC_CURSOR_EXPIRED_CODE;
  requestId?: string;
  details?: Array<{ floor_id: number }>;
}

/** `true`, коли pull відхилено за простроченим курсором (треба snapshot). */
export function isSyncCursorExpiredError(err: unknown): boolean {
  if (!isApiError(err) || err.status !== 410) return false;
  const body = err.body as { code?: unknown } | null | undefined;
  return body?.code === SYNC_CURSOR_EXPIRED_CODE;
}

export function createSyncV2SnapshotEndpoint(
  http: HttpClient,
): (opts?: SyncV2SnapshotOptions) => Promise<SyncV2SnapshotResponse> {
  return (opts) =>
    http.get<SyncV2SnapshotResponse>("/api/v2/sync/snapshot", {
      query: {
        ...(opts?.cursor != null ? { cursor: opts.cursor } : {}),
        ...(opts?.asOfOpId != null ? { as_of_op_id: opts.asOfOpId } : {}),
        ...(opts?.limit != null ? { limit: opts.limit } : {}),
      },
    });
}
