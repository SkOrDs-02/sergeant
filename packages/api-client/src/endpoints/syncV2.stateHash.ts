import type { SyncStateHashTable } from "@sergeant/shared";
import type { HttpClient } from "../httpClient";

/**
 * `GET /api/v2/sync/state-hash?table=<t>` (ADR-0106, крок 1). Типи
 * дзеркалять серверну відповідь `SyncV2StateHashBody` у
 * `apps/server/src/modules/sync/syncV2StateHash.ts` один-в-один (Hard Rule
 * #3). Хеші рахує спільний канонізатор `computeStateHash`
 * (`@sergeant/shared`); клієнт порівнює їх зі своїм результатом того самого
 * канонізатора над локальною копією.
 *
 * Маршрут закритий серверним прапорцем `SYNC_STATE_HASH_ENABLED` (дефолт
 * вимкнено → 404): клієнт має трактувати 404 як «перевірка недоступна» і
 * мовчати. Таблиця поза allowlist → 400 `STATE_HASH_TABLE_NOT_ALLOWED`.
 */
export interface SyncV2StateHashBucket {
  /** 0..15 — перший півбайт SHA-256 від `pk`. */
  bucket: number;
  /** SHA-256 hex рядків кошика. */
  hash: string;
  count: number;
}

export interface SyncV2StateHashResponse {
  table: SyncStateHashTable;
  /**
   * Максимальний `id` застосованого оп-у користувача в тому ж знімку, що й
   * хеш; `0` — оп-ів немає. BIGSERIAL → number (Hard Rule #1). Порівнювати
   * хеші має сенс лише коли курсор pull клієнта `>= as_of_op_id`.
   */
  as_of_op_id: number;
  total: { hash: string; count: number };
  /** Рівно 16 кошиків, упорядкованих за `bucket`. */
  buckets: SyncV2StateHashBucket[];
}

export interface SyncV2StateHashEndpoints {
  stateHashV2: (table: SyncStateHashTable) => Promise<SyncV2StateHashResponse>;
}

/**
 * Окремий фабричний модуль, а не поле `createSyncV2Endpoints`: клієнтського
 * споживача на кроці 1 ще немає (детекція — крок 2 ADR-0106).
 */
export function createSyncV2StateHashEndpoints(
  http: HttpClient,
): SyncV2StateHashEndpoints {
  return {
    stateHashV2: (table) =>
      http.get<SyncV2StateHashResponse>("/api/v2/sync/state-hash", {
        query: { table },
      }),
  };
}
