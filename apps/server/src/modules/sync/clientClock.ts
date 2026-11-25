import { syncOpLogApplyTotal } from "../../obs/metrics.js";

/**
 * Годинник пристрою в LWW (аудит `data-51`, рішення власника 2026-11-21).
 *
 * LWW порівнює `client_ts`, тобто час пристрою. Доти сервер приймав
 * `client_ts` до +1 год наперед і писав його в `updated_at` як є: пристрій із
 * годинником, що поспішає на 50 хв, «замикав» рядок на 50 хв, і кожна правка
 * з правильного годинника за цей час мовчки отримувала `lww_conflict`.
 *
 * Тепер два кроки:
 *   1. Допуск наперед — хвилини, а не година ({@link CLOCK_SKEW_FORWARD_MS}).
 *      Оп поза допуском НЕ відхиляється назавжди, а отримує `retry` з
 *      `reason: "clock_skew"`: у журнал не пишеться, клієнт повторює його з
 *      тим самим `client_ts`, не палячи спроб, раз на `client_ts − server_now`
 *      (не довше 5 хв), тож оп проходить, щойно годинник сервера наздожене
 *      мітку, і в `dead_letter` через зсув не йде (`syncV2.pushLoop.ts`).
 *      Доти це була термінальна відмова: запис лишався лише на пристрої.
 *   2. У межах допуску мітка обрізається: `updated_at = min(client_ts,
 *      server_now)` ({@link createClientTsClamp}). Та сама обрізана мітка
 *      йде в `sync_op_log.client_ts`, тож інші пристрої (pull / SSE пишуть
 *      `updated_at = op.client_ts`) бачать той самий порядок, що й сервер.
 *      Сам автор свій оп назад не отримує (фільтр за origin), тому обрізану
 *      мітку йому повертає `result.client_ts` ({@link storedClientTsField}).
 *
 * HLC свідомо не робимо (рішення власника).
 */
export const CLOCK_SKEW_FORWARD_MS = 2 * 60 * 1000;

/** `client_ts` випереджає годинник сервера більше, ніж дозволяє допуск. */
export function exceedsForwardSkew(clientTs: Date, nowMs: number): boolean {
  return clientTs.getTime() - nowMs > CLOCK_SKEW_FORWARD_MS;
}

/**
 * Обрізка `client_ts` до годинника сервера, одна на push-запит.
 *
 * Мітка в минулому лишається як є. Мітка в майбутньому стає `server_now`,
 * але в межах одного пуша обрізані мітки строго зростають: кілька правок
 * того самого рядка з пристрою, що поспішає, обробляються за одну
 * мілісекунду, і з однаковою міткою друга програла б першій `lww_conflict`.
 * Тому обрізана мітка — щонайменше найбільша вже видана в цьому пуші + 1 мс
 * (порядок батча — порядок outbox пристрою; сюди ж входять і необрізані:
 * insert із `client_ts = now` і update з `now + 1 с` в одному пуші інакше
 * зрівнялися б), але ніколи не більша за власний `client_ts`.
 */
export function createClientTsClamp(): (clientTs: Date, nowMs: number) => Date {
  // Найбільша мітка, вже видана в цьому пуші (обрізана чи ні).
  let lastMs = Number.NEGATIVE_INFINITY;
  return (clientTs, nowMs) => {
    const clientMs = clientTs.getTime();
    if (clientMs <= nowMs) {
      lastMs = Math.max(lastMs, clientMs);
      return clientTs;
    }
    const clampedMs = Math.min(clientMs, Math.max(nowMs, lastMs + 1));
    lastMs = Math.max(lastMs, clampedMs);
    return new Date(clampedMs);
  };
}

/**
 * Поле `client_ts` per-op відповіді `applied`: мітка, яку сервер записав, коли
 * вона відрізняється від надісланої (обрізка вище). Без нього пристрій, що
 * поспішав, лишав у себе `updated_at = client_ts` пристрою, свій оп не тягнув
 * (pull фільтрує власні за origin), а чужу пізнішу правку відкидав як
 * старішу за локальну: розходження до наступної правки рядка. Клієнт
 * переписує локальну мітку рядка на цю, якщо вона досі дорівнює надісланій.
 * `null` (рядок журналу без мітки) і незмінна мітка поля не дають.
 */
export function storedClientTsField(
  sentClientTs: string,
  storedClientTs: Date | string | null | undefined,
): { client_ts?: string } {
  if (storedClientTs == null) return {};
  const storedMs = new Date(storedClientTs).getTime();
  if (!Number.isFinite(storedMs) || storedMs === Date.parse(sentClientTs)) {
    return {};
  }
  return { client_ts: new Date(storedMs).toISOString() };
}

/** Per-op відповідь `retry / clock_skew` + метрика; журнал не чіпаємо. */
export function clockSkewRetry(op: {
  table: string;
  idempotency_key: string;
}): {
  idempotency_key: string;
  status: "retry";
  reason: "clock_skew";
} {
  try {
    syncOpLogApplyTotal.inc({
      table: op.table,
      status: "retry",
      reason: "clock_skew",
    });
  } catch {
    /* metrics must never break a request */
  }
  return {
    idempotency_key: op.idempotency_key,
    status: "retry",
    reason: "clock_skew",
  };
}
