import Redis from "ioredis";
import { logger } from "../obs/logger.js";
import { env } from "../env.js";

let _client: Redis | null = null;
let _isHealthy = false;
let _reconnectAttempts = 0;

export function getRedis(): Redis | null {
  return _client;
}

/**
 * Get Redis connection stats for monitoring.
 */
export function getRedisStats() {
  return {
    connected: _isHealthy,
    reconnectAttempts: _reconnectAttempts,
  };
}

/**
 * Creates a Redis client from REDIS_URL if set.
 * Rate limiting falls back to in-memory when Redis is unavailable.
 *
 * Features:
 * - Exponential backoff reconnection
 * - Health status tracking
 * - Graceful degradation
 */
export function connectRedis(): void {
  const url = env.REDIS_URL;
  if (!url) {
    logger.info({ msg: "redis_disabled", reason: "no REDIS_URL" });
    return;
  }

  const client = new Redis(url, {
    // Fail fast per-command so the in-memory fallback kicks in quickly
    // instead of queuing commands behind a stalled connection.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    // Connection timeouts
    connectTimeout: 5_000,
    commandTimeout: 3_000,
    // Reconnection strategy with exponential backoff.
    //
    // AI-DANGER: НІКОЛИ не повертай звідси `null`.
    //
    // До 2026-09-16 тут стояло `if (times > REDIS_MAX_RETRIES) return null`.
    // `null` для ioredis означає не «почекай довше», а «здавайся НАЗАВЖДИ»:
    // клієнт більше не перепідключається ніколи, тільки рестарт процесу.
    // При дефолтних 10 спробах це наставало приблизно за 19 секунд.
    //
    // Наслідок був тихий і довгий. Рестарт Redis у Coolify (звичайна
    // операція, секунди недоступності) назавжди садив rate-limit на
    // in-memory fallback — тобто ліміти переставали бути спільними між
    // репліками. `/healthz` при цьому рапортує лише "degraded" і віддає
    // 200, тож Coolify контейнер не перезапускає, і стан живе до
    // наступного деплою.
    //
    // Тепер затримка КЛАМПИТЬСЯ і ретраї тривають вічно — рівно так, як це
    // вже працює для BullMQ-конекшна (`lib/jobs/connection.ts`): там
    // власного `retryStrategy` немає, тож діє дефолт ioredis, який теж
    // ретраїть без кінця. Асиметрія між двома нашими клієнтами була
    // ненавмисною: обидва дивляться в один і той самий Redis.
    //
    // `REDIS_MAX_RETRIES` лишається — але тепер це поріг ГУЧНОСТІ, а не
    // здавання: до нього логуємо кожну спробу, після — раз на спробу
    // ескалюємо рівень, щоб лог не перетворився на суцільний шум.
    retryStrategy(times: number) {
      _reconnectAttempts = times;

      // Exponential backoff: 100ms, 200ms, 400ms, ... up to max
      const delay = Math.min(
        env.REDIS_RECONNECT_DELAY_MS * Math.pow(2, times - 1),
        env.REDIS_MAX_RECONNECT_DELAY_MS,
      );

      if (times > env.REDIS_MAX_RETRIES) {
        // Порогове повідомлення шлемо РІВНО один раз: далі ретраї йдуть із
        // максимальною затримкою, і писати error на кожен — це залити лог
        // при багатогодинному простої Redis.
        if (times === env.REDIS_MAX_RETRIES + 1) {
          logger.error({
            msg: "redis_max_retries_exceeded",
            attempts: times,
            maxRetries: env.REDIS_MAX_RETRIES,
            delayMs: delay,
            note: "reconnect triggers continue with clamped delay",
          });
        }
        return delay;
      }

      logger.info({
        msg: "redis_reconnecting",
        attempt: times,
        delayMs: delay,
      });

      return delay;
    },
  });

  client.on("connect", () => {
    _isHealthy = true;
    _reconnectAttempts = 0;
    logger.info({ msg: "redis_connected" });
  });

  client.on("ready", () => {
    _isHealthy = true;
    logger.info({ msg: "redis_ready" });
  });

  client.on("close", () => {
    _isHealthy = false;
    logger.warn({ msg: "redis_closed" });
  });

  client.on("error", (err: Error) => {
    _isHealthy = false;
    logger.warn({ msg: "redis_error", err: err.message });
  });

  client.on("reconnecting", () => {
    _isHealthy = false;
    logger.info({ msg: "redis_reconnecting_event" });
  });

  _client = client;
}

export async function disconnectRedis(): Promise<void> {
  if (!_client) return;
  _isHealthy = false;
  try {
    await _client.quit();
  } catch {
    /* ignore on shutdown */
  }
  _client = null;
}

/**
 * Perform a health check ping on Redis.
 * Returns true if healthy, false otherwise.
 */
export async function pingRedis(): Promise<boolean> {
  if (!_client) return false;
  try {
    const result = await _client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
