import { env } from "../../env/env.js";

/**
 * Відмова на push для `increment`, старших за вікно журналу (ADR-0105 §2,
 * «побічна дія: втрата ідемпотентності»).
 *
 * Повтор опа ловиться за `idempotency_key`, а ключ живе в самому рядку
 * `sync_op_log`. Коли чистка видалить `applied`-рядок, повтор того самого
 * опа пройде apply вдруге. Для `insert`/`update`/`delete` це безпечно (LWW),
 * для `increment` (PN-лічильник `routine_streaks`) — ні: лічильник
 * подвоїться.
 *
 * ADR вимагав, щоб черга клієнта жила суттєво менше за 90 днів. Перевірка
 * 2026-11-19 (`packages/db-schema/src/sqlite/syncOpRetry.ts`,
 * `syncOpOutboxPurgeStale.ts`): обмеження за ВІКОМ для `pending` немає —
 * лише 10 спроб із паузами до 5 хв, а спроба буває тільки тоді, коли
 * застосунок відкритий. Оп, чию відповідь загубила мережа, може чекати
 * повтору скільки завгодно довго; `dead_letter` ще й повертається в
 * `pending` (`recoverDeadLetter`). Тож межу тримає сервер: він бачить і
 * старі клієнти.
 *
 * Чому `client_ts` достатньо. Оп приймається, лише якщо `client_ts` не
 * випереджає годинник сервера більш ніж на `CLOCK_SKEW_FORWARD_MS` (1 год,
 * `syncV2.ts`). Отже рядок, який чистка вже могла видалити
 * (`server_ts < now - D`), має `client_ts < now - D + 1 год`. Відмова для
 * всього, що старше `now - D + 1 доба`, накриває такі оп-и з запасом,
 * незалежно від того, як годинник пристрою поводився потім.
 *
 * Ціна: справжній `increment`, що пролежав у черзі офлайн довше за вікно,
 * теж відхиляється. Лічильник серій веб не показує, а подвоєння було б
 * гіршим за пропуск одного кроку.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Запас понад вікно; має бути ≥ допуску годинника вперед у push (1 год). */
export const STALE_INCREMENT_MARGIN_MS = DAY_MS;

/** Вікно журналу в днях з env; 0 — чистка вимкнена. */
export function appliedRetentionDays(): number {
  const v = env.SYNC_OP_LOG_APPLIED_RETENTION_DAYS;
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 0;
}

/** `true` — оп може бути повтором, чий ключ чистка вже видалила. */
export function isIncrementPastReplayWindow(
  clientTs: Date,
  nowMs: number,
  retentionDays: number,
): boolean {
  if (retentionDays < 1) return false;
  const oldestSafe = nowMs - retentionDays * DAY_MS + STALE_INCREMENT_MARGIN_MS;
  return clientTs.getTime() < oldestSafe;
}
