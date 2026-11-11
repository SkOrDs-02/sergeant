import { boolFromEnv, intFromEnv } from "./envHelpers.js";

/**
 * Env-поля sync v2 — винесені з `env.ts`, щоб він тримався в межах
 * `max-lines: 600` (Hard Rule #18, `skipBlankLines` + `skipComments`), як
 * `telegramEnv.ts` і `pgEnv.ts`. Поведінка не змінюється: розгортається в
 * shape `envSchema` (`...syncEnvShape`), тож `env.SYNC_*` резолвляться так
 * само, як до виносу. Нове sync-поле додавай сюди, а не в `env.ts`.
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
   * Рубильник `GET /api/v2/sync/state-hash` (ADR-0106, аудит `data-38`).
   * Дефолт `false` → маршрут відповідає 404. Вмикати після заміру
   * `sync_state_hash_compute_ms` на проді; вимкнення — відкат (клієнт
   * мовчить). Ран-тайм читає `process.env` напряму
   * (`modules/sync/syncV2StateHash.ts`, `boolFromProcessEnv`) з тією ж
   * семантикою - це поле лише валідує й документує значення.
   */
  SYNC_STATE_HASH_ENABLED: boolFromEnv(false),

  /**
   * Байтовий бюджет однієї сторінки `GET /api/v2/sync/pull` (ADR-0105 §1,
   * аудит `rel-06`). Сторінка обрізається, щойно сума `octet_length(row::text)`
   * попередніх оп-ів досягає бюджету; перший оп сторінки віддається завжди.
   * Дефолт 2 MiB. Значення < 1 ігнорується (береться дефолт у `syncV2.ts`).
   */
  SYNC_V2_PULL_MAX_BYTES: intFromEnv(2_097_152),
};
