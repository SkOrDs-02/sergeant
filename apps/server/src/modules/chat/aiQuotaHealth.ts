import pool from "../../db.js";
import { logger } from "../../obs/logger.js";

/**
 * Інфраструктурний шар для AI-quota circuit-breaker (PR-03 → PR-04 → PR-05).
 *
 * Фіксує DB-помилки квоти у sliding-window-і та надає легкий health-probe.
 * Тут — лише підрахунки й probe; рішення відкривати breaker і Prometheus-counter
 * живуть у наступних PR-ах. Решта модуля квоти лишається fail-open до моменту,
 * коли circuit-breaker (PR-04) вимкне fail-open для DB-error-ів.
 *
 * Sliding-window чистимо ліниво при кожному `record`/`get`, щоб уникнути
 * setInterval-а в global-scope (test-leaks, jest-fake-timers, dual-instances
 * у вкладених контейнерах). Window default — 60 секунд (1 хвилина), що
 * відповідає визначенню "5 DB errors/min" з 0011-resilience.md.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 1_000;

const errorTimestamps: number[] = [];

/**
 * Витягає `code` з PG-помилки (для логів). Покриває як справжні `pg.PoolError`,
 * так і fail-open-маркери (`ECONNREFUSED`, `ENOTFOUND`).
 */
function pgErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function pruneOlderThan(now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  while (errorTimestamps.length > 0 && errorTimestamps[0]! < cutoff) {
    errorTimestamps.shift();
  }
}

/**
 * Зафіксувати DB-помилку у sliding-window. Викликається з aiQuota-шляхів
 * `db_error`. `windowMs` — лише для prune-у "хвоста" (новіші вікна виключені
 * при `get`).
 */
export function recordDbError(
  err?: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const now = Date.now();
  pruneOlderThan(now, windowMs);
  errorTimestamps.push(now);
  logger.debug({
    msg: "ai_quota_db_error_recorded",
    code: pgErrorCode(err),
    windowMs,
    countInWindow: errorTimestamps.length,
  });
}

/** Скільки DB-помилок зафіксовано в останні `windowMs` мілісекунд. */
export function getDbErrorCount(windowMs: number = DEFAULT_WINDOW_MS): number {
  pruneOlderThan(Date.now(), windowMs);
  return errorTimestamps.length;
}

/** Test-only: скинути sliding-window. Прод-код ніколи це не викликає. */
export function resetDbErrorWindow(): void {
  errorTimestamps.length = 0;
}

export interface DbHealthProbeResult {
  ok: boolean;
  /** ms-резолюція круглим до 1 ms; -1 якщо probe впав до отримання latency. */
  latencyMs: number;
  code?: string;
  message?: string;
}

/**
 * Дешевий `SELECT 1` health-probe з ручним таймаутом. Не кидає винятків —
 * результат завжди описує і успіх, і failure-mode (для PR-04 half-open
 * перевірки).
 *
 * Не reuse-ить `pool.query`-метрики (`db.ts`), бо це навмисно out-of-band
 * перевірка стану DB, і domain-метрика для probe — `circuit_breaker_*`
 * (PR-05), а не загальні `db_query_duration_ms`.
 */
export async function dbHealthProbe(
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<DbHealthProbeResult> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error("db_health_probe_timeout"), {
          code: "ETIMEDOUT",
        }),
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([pool.query("SELECT 1"), timeoutPromise]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string } | undefined;
    const result: DbHealthProbeResult = {
      ok: false,
      latencyMs: Date.now() - start,
      message: err?.message || String(e),
    };
    if (err?.code) result.code = err.code;
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only constants — підтягуються тестами щоб не дублювати magic-numbers. */
export const __aiQuotaHealthTestHooks = {
  DEFAULT_WINDOW_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
};
