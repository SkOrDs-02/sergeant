import IORedis, { type Redis as IORedisClient } from "ioredis";

import { env } from "../../env.js";
import { logger, serializeError } from "../../obs/logger.js";

/**
 * Створює окремий ioredis-клієнт для BullMQ.
 *
 * Чому окремий, а не шерити `lib/redis.ts`:
 * 1. BullMQ ВИМАГАЄ `maxRetriesPerRequest: null` для воркер-конекшнів
 *    (інакше `bclient` падає на blocking-команді при reconnect).
 * 2. `enableOfflineQueue: true` потрібний, щоб `Queue.add()` не кидав
 *    помилку у момент reconnect — він буферизується.
 * 3. Наш базовий ioredis-клієнт у `lib/redis.ts` навмисне використовує
 *    `maxRetriesPerRequest: 1` + `enableOfflineQueue: false`, щоб
 *    rate-limiter швидко падав у in-memory fallback. Це несумісно з BullMQ.
 *
 * Повертає null, якщо `REDIS_URL` не заданий — caller-и відрабляють у
 * fallback-режимі (in-process direct dispatch замість enqueue).
 */
export function createBullConnection(name: string): IORedisClient | null {
  if (!env.REDIS_URL) {
    return null;
  }

  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    connectTimeout: 10_000,
  });

  client.on("error", (err) => {
    logger.warn({
      msg: "bullmq_connection_error",
      connection: name,
      err: serializeError(err, { includeStack: false }),
    });
  });

  client.on("connect", () => {
    logger.info({ msg: "bullmq_connection_ready", connection: name });
  });

  return client;
}

/** Ім'я BullMQ-черги, шарене між producer-ом і consumer-ом. */
export const AUTH_MAIL_QUEUE_NAME = "sergeant:auth-mail";
