/**
 * rel-34: дебаунс дзеркалення `memoryBank` → `ai_memories`.
 *
 * Веб пушить ПОВНИЙ профіль після КОЖНОГО локального редагування
 * (`profileWriteThrough.ts`), тож людина, що правит кілька фактів поспіль,
 * давала стільки ж дзеркалень, а кожен проміжний текст факту — окремий
 * Voyage-ембеддинг. Тепер `PUT /api/me/profile` лише планує дзеркалення:
 * повторні PUT того ж користувача протягом `PROFILE_MIRROR_DEBOUNCE_MS`
 * зсувають таймер і заміщають профіль, тож ембедиться лише фінальний стан.
 *
 * Профіль у планувальник кладе роут уже ЗБЕРЕЖЕНИЙ (після LWW-мерджу в
 * `upsertUserProfile`), тож останній PUT і несе актуальний стан.
 *
 * Дзеркалення одного користувача не перетинаються: наступне чекає на
 * попереднє (діф у `profileMirror.ts` читає наявні рядки, і два паралельні
 * діфи поставили б той самий факт двічі).
 *
 * На SIGTERM `index.ts` кличе `flushPendingProfileMirrors()`: відкладені
 * дзеркалення виконуються одразу, а не губляться разом із процесом.
 * Втрачене (краш, OOM) самовідновлюється на наступному PUT профілю: діф
 * побачить факт як відсутній у `ai_memories`.
 */

import type { Pool } from "pg";

import { logger, serializeError } from "../../obs/logger.js";
import { mirrorProfileMemoryEntries } from "./profileMirror.js";

/**
 * 10 с покривають серію правок «відредагував, перечитав, виправив ще раз»,
 * а для RAG затримка непомітна: факт однаково потрапляє у фонову чергу.
 */
export const PROFILE_MIRROR_DEBOUNCE_MS = 10_000;

interface PendingMirror {
  timer: ReturnType<typeof setTimeout>;
  pool: Pool;
  profile: unknown;
}

const pending = new Map<string, PendingMirror>();
const inFlight = new Map<string, Promise<void>>();

function runMirror(
  userId: string,
  pool: Pool,
  profile: unknown,
): Promise<void> {
  const previous = inFlight.get(userId) ?? Promise.resolve();
  const run = previous
    .then(() => mirrorProfileMemoryEntries(pool, userId, profile))
    .then(
      () => undefined,
      (err: unknown) => {
        // `mirrorProfileMemoryEntries` не кидає за контрактом; це страховка,
        // щоб відхилений проміс не став unhandledRejection у таймері.
        logger.warn({
          msg: "ai_memory_profile_mirror_schedule_failed",
          userId,
          err: serializeError(err, { includeStack: false }),
        });
      },
    )
    .finally(() => {
      if (inFlight.get(userId) === run) inFlight.delete(userId);
    });
  inFlight.set(userId, run);
  return run;
}

/**
 * Запланувати дзеркалення профілю користувача. Не кидає і не чекає:
 * збереження профілю від дзеркалення не залежить.
 */
export function scheduleProfileMemoryMirror(
  pool: Pool,
  userId: string,
  profile: unknown,
  delayMs: number = PROFILE_MIRROR_DEBOUNCE_MS,
): void {
  const existing = pending.get(userId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const entry = pending.get(userId);
    if (!entry || entry.timer !== timer) return;
    pending.delete(userId);
    void runMirror(userId, entry.pool, entry.profile);
  }, delayMs);
  // Таймер не тримає процес живим; на штатному shutdown спрацює flush.
  timer.unref?.();
  pending.set(userId, { timer, pool, profile });
}

/**
 * Виконати всі відкладені дзеркалення негайно й дочекатись усіх, що в
 * польоті. Для graceful shutdown і тестів.
 */
export async function flushPendingProfileMirrors(): Promise<void> {
  const entries = [...pending.entries()];
  pending.clear();
  for (const [userId, entry] of entries) {
    clearTimeout(entry.timer);
    void runMirror(userId, entry.pool, entry.profile);
  }
  await Promise.all([...inFlight.values()]);
}
