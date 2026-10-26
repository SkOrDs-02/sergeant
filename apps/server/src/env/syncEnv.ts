import { boolFromEnv, intFromEnv } from "./envHelpers.js";

/**
 * Env-поля sync v2 - винесені з `env.ts` тим самим прийомом, що
 * `pgEnv.ts` / `telegramEnv.ts`: Hard Rule #18 (`max-lines: 600`,
 * `skipBlankLines` + `skipComments`), `env.ts` стояв рівно на межі, коли
 * ADR-0105 §3 додав прапорець знімка.
 *
 * Zero behaviour change: spread у shape `envSchema` (`...syncEnvShape`), тож
 * `env.SYNC_*` резолвляться як раніше.
 */
export const syncEnvShape = {
  /**
   * Рубильник `GET /api/v2/sync/stream` (SSE). Дефолт `false` → маршрут
   * відповідає 404, поки немає клієнта-споживача (Фаза 3,
   * `sync-client-wiring.md`); аудит 2026-10-01, sec-09. Ран-тайм читає
   * `process.env` напряму (`modules/sync/syncV2StreamGuard.ts`,
   * `boolFromProcessEnv`) з тією ж семантикою - це поле лише валідує й
   * документує значення.
   */
  SYNC_V2_STREAM_ENABLED: boolFromEnv(false),

  /**
   * Байтовий бюджет однієї сторінки `GET /api/v2/sync/pull` (ADR-0105 §1,
   * аудит `rel-06`). Сторінка обрізається, щойно сума `octet_length(row::text)`
   * попередніх оп-ів досягає бюджету; перший оп сторінки віддається завжди.
   * Дефолт 2 MiB. Значення < 1 ігнорується (береться дефолт у `syncV2.ts`).
   */
  SYNC_V2_PULL_MAX_BYTES: intFromEnv(2_097_152),

  /**
   * Рубильник `GET /api/v2/sync/snapshot` (ADR-0105 §3.3): дефолт вимкнено
   * (404), доки клієнт не вміє snapshot-bootstrap на `410
   * sync_cursor_expired`. Ран-тайм читає `process.env` напряму
   * (`modules/sync/syncV2Snapshot.ts`, `boolFromProcessEnv`) з тією ж
   * семантикою - це поле лише валідує й документує значення.
   */
  SYNC_SNAPSHOT_ENABLED: boolFromEnv(false),
};
