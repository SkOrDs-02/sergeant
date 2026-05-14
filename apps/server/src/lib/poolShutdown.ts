/**
 * Bounded `pg.Pool` drain for graceful shutdown.
 *
 * Audit `docs/audits/2026-05-13-backend-performance-roast.md` § P2-5.
 *
 * `pool.end()` чекає, поки всі checked-out клієнти повернуться у pool. Якщо
 * якийсь worker (BullMQ-job, AI-стрім, retry-loop) зависає у середині
 * транзакції або тримає row-lock — drain зависає до `SHUTDOWN_HARD_TIMEOUT_MS`
 * у `index.ts`, після чого `process.exit()` обриває pg-з'єднання, клієнти
 * отримують ECONNRESET замість graceful 503, а Sentry-flush і Redis-quit
 * взагалі не встигають виконатися.
 *
 * Цей helper обгортає `pool.end()` у `AbortController` з timeout
 * `SHUTDOWN_GRACE_MS / 2`. При abort повертає `{ ok: false, reason: "aborted" }`,
 * пише `logger.warn({ msg: "pg_pool_end_timeout" })`, і shutdown продовжує
 * виконувати наступні кроки (`disconnectRedis`, `Sentry.flush`). Hard-timer
 * у `index.ts` залишається remaining safety net на випадок, якщо й вони
 * зависнуть.
 *
 * Helper navmisne не throws: shutdown-pipeline має йти forward навіть при
 * pool-failure. Логіка вибору `exitCode` живе у `index.ts`.
 */

import type { Pool } from "pg";
import { serializeError } from "../obs/logger.js";

export type EndPoolResult =
  | { ok: true; reason: "ended" }
  | { ok: false; reason: "aborted"; abortedAfterMs: number }
  | { ok: false; reason: "error"; err: unknown };

/**
 * Мінімальний логер-shape, який нам тут потрібен. Pino-логер задовольняє цей
 * контракт (його `info`/`warn` приймають object як перший аргумент), а
 * `vi.fn()`-моки в тестах теж — без зайвої гри з overload-ами `pino.LogFn`.
 */
export interface ShutdownLogger {
  info: (obj: object) => void;
  warn: (obj: object) => void;
}

export interface EndPoolOptions {
  /**
   * Bounded час на drain. У продакшні — `SHUTDOWN_GRACE_MS / 2`, тобто
   * половина від загального grace-вікна; інша половина залишається на
   * Redis + Sentry-flush + `hardTimer`.
   */
  timeoutMs: number;
  /**
   * Pino-сумісний logger; за відсутності — helper нічого не пише. Інжектуємо
   * для testability (uniт-тести не повинні тягнути реал-pino).
   */
  logger?: ShutdownLogger;
  /**
   * Опційний external `AbortSignal`. Корисний, коли власник shutdown
   * pipeline-у хоче перервати drain до спливу `timeoutMs` (наприклад, з
   * другого SIGTERM). Якщо сигнал уже aborted на старті — drain
   * скасовується миттєво.
   */
  externalSignal?: AbortSignal;
}

/**
 * Drain pg-pool з bounded час. Ніколи не throws; завжди резолвиться у
 * структурований `EndPoolResult`, який caller може передати у Sentry-метрику.
 */
export async function endPoolWithAbortTimeout(
  pool: Pick<Pool, "end">,
  options: EndPoolOptions,
): Promise<EndPoolResult> {
  const { timeoutMs, logger, externalSignal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Дозволяємо процесу завершитися, якщо drain — остання запланована робота.
  timer.unref();

  let externalAbortListener: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalAbortListener = (): void => controller.abort();
      externalSignal.addEventListener("abort", externalAbortListener, {
        once: true,
      });
    }
  }

  const startedAt = Date.now();

  try {
    const endPromise: Promise<EndPoolResult> = Promise.resolve()
      .then(() => pool.end())
      .then<EndPoolResult>(() => ({ ok: true, reason: "ended" }))
      .catch<EndPoolResult>((err: unknown) => ({
        ok: false,
        reason: "error",
        err,
      }));

    const abortPromise = new Promise<EndPoolResult>((resolve) => {
      const onAbort = (): void => {
        resolve({
          ok: false,
          reason: "aborted",
          abortedAfterMs: Date.now() - startedAt,
        });
      };
      if (controller.signal.aborted) {
        onAbort();
      } else {
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    const result = await Promise.race([endPromise, abortPromise]);

    if (result.ok) {
      logger?.info({ msg: "pg_pool_ended" });
    } else if (result.reason === "aborted") {
      logger?.warn({
        msg: "pg_pool_end_timeout",
        timeoutMs,
        abortedAfterMs: result.abortedAfterMs,
      });
    } else {
      logger?.warn({
        msg: "pg_pool_end_error",
        err: serializeError(result.err, { includeStack: false }),
      });
    }

    return result;
  } finally {
    clearTimeout(timer);
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener("abort", externalAbortListener);
    }
  }
}
