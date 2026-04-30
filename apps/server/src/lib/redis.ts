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
    // Reconnection strategy with exponential backoff
    retryStrategy(times: number) {
      _reconnectAttempts = times;

      if (times > env.REDIS_MAX_RETRIES) {
        logger.error({
          msg: "redis_max_retries_exceeded",
          attempts: times,
          maxRetries: env.REDIS_MAX_RETRIES,
        });
        // Return null to stop retrying
        return null;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, ... up to max
      const delay = Math.min(
        env.REDIS_RECONNECT_DELAY_MS * Math.pow(2, times - 1),
        env.REDIS_MAX_RECONNECT_DELAY_MS,
      );

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
