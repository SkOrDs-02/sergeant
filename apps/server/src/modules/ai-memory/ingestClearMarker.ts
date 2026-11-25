/**
 * Status: Active.
 *
 * B12 (аудит ai-pipeline-2026-08-05): мітка «памʼять очищено о T» на юзера
 * для черги AI memory ingest.
 *
 * «Очистити памʼять» видаляє рядки `ai_memories`, але задачі, що вже лежать
 * у Redis, ретраяться з backoff ще години, і гейт згоди їх не зупиняє —
 * стерті факти поверталися в RAG. Тому очищення (1) ставить мітку і (2)
 * знімає з черги задачі юзера, що ще чекають. Задачу, яка в момент
 * очищення була `active` (її `remove()` не бере), відсікає мітка: воркер
 * (`ingestQueue.ts::processMemoryIngestJob`) пропускає задачі, створені не
 * пізніше за мітку, а якщо мітка зʼявилась під час ембеддингу — прибирає
 * щойно записаний рядок.
 *
 * Модуль без стану: Queue і Redis-клієнт передає `ingestQueue.ts`.
 */
import type { Queue } from "bullmq";
import type { Redis as IORedisClient } from "ioredis";

import { BULLMQ_QUEUE_PREFIX } from "../../lib/jobs/connection.js";
import { logger, serializeError } from "../../obs/logger.js";

/**
 * TTL з великим запасом над вікном ретраїв (~2.5 год): мітка зачіпає лише
 * задачі, створені ДО очищення, тож довший TTL хибних пропусків не дає.
 */
export const CLEARED_AT_TTL_SEC = 24 * 3600;

/**
 * BullMQ-конекшн буферизує команди на час обриву Redis
 * (`maxRetriesPerRequest: null`), тож без стелі очищення висіло б.
 */
const PURGE_TIMEOUT_MS = 5_000;

/** Стани, з яких задачу ще можна зняти (`active` тримає лок воркера). */
const PURGEABLE_STATES = [
  "waiting",
  "delayed",
  "prioritized",
  "paused",
] as const;

export function clearedAtKey(userId: string): string {
  return `${BULLMQ_QUEUE_PREFIX}:ai_memory:cleared_at:${userId}`;
}

/**
 * Чи очищено памʼять юзера не раніше, ніж задачу поставили в чергу.
 * Без Redis чи без `timestamp` мітки немає. Збій Redis кидає — воркер
 * віддасть задачу BullMQ на ретрай замість писати навмання.
 */
export async function isClearedAfterEnqueue(
  client: Pick<IORedisClient, "get"> | null,
  userId: string,
  jobTimestamp: number | undefined,
): Promise<boolean> {
  if (!client || typeof jobTimestamp !== "number") return false;
  const raw = await client.get(clearedAtKey(userId));
  if (raw == null) return false;
  const clearedAt = Number(raw);
  return Number.isFinite(clearedAt) && jobTimestamp <= clearedAt;
}

/**
 * Ставить мітку і знімає з черги задачі юзера, що ще не почались. Не
 * кидає: збій Redis логуємо й повертаємо 0, щоб саме видалення рядків
 * (головна дія користувача) не залежало від черги. Повертає кількість
 * знятих задач.
 */
export async function purgeUserIngestJobs(
  queue: Pick<Queue<{ userId: string }>, "getJobs">,
  client: Pick<IORedisClient, "set">,
  userId: string,
): Promise<number> {
  const work = async (): Promise<number> => {
    // Мітка ДО зняття задач: задача, що стала `active` між цими кроками,
    // однаково її побачить.
    await client.set(
      clearedAtKey(userId),
      String(Date.now()),
      "EX",
      CLEARED_AT_TTL_SEC,
    );
    const jobs = await queue.getJobs([...PURGEABLE_STATES]);
    let removed = 0;
    for (const job of jobs) {
      if (job?.data?.userId !== userId) continue;
      try {
        await job.remove();
        removed += 1;
      } catch {
        // Задача встигла стати `active` (лок воркера) — її відсіче мітка.
      }
    }
    return removed;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("ai_memory_ingest_purge_timeout")),
      PURGE_TIMEOUT_MS,
    );
    timer.unref?.();
  });
  try {
    const removed = await Promise.race([work(), timeout]);
    logger.info({ msg: "ai_memory_ingest_purged_for_user", userId, removed });
    return removed;
  } catch (err) {
    logger.error({
      msg: "ai_memory_ingest_purge_failed",
      userId,
      err: serializeError(err, { includeStack: false }),
    });
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
