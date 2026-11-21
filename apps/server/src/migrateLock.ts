/**
 * Advisory-lock раннера міграцій: `pg_try_advisory_lock` у циклі з власним
 * дедлайном замість блокуючого `pg_advisory_lock` (аудит rel-62).
 *
 * AI-CONTEXT: чому не `pg_advisory_lock`. `migrate.mjs` виставляє
 * `lock_timeout` (дефолт 10 с) на весь пул, і Postgres застосовує його і до
 * очікування advisory-lock. Тобто друга сесія міграцій падала через 10 с з
 * «canceling statement due to lock timeout» — повідомленням, з якого не
 * видно, що чекали саме на іншого раннера, а не на DDL-лок таблиці. А
 * зняти `lock_timeout` для цього запиту означало б чекати безстроково.
 * `pg_try_advisory_lock` повертається одразу, тож `lock_timeout` на нього
 * не діє взагалі, а скільки чекати вирішує `MIGRATE_LOCK_WAIT_MS`.
 */
import { logger } from "./obs/logger.js";
import { sleep as defaultSleep } from "./lib/timing.js";

/** Мінімальний контракт клієнта: лише `query`, щоб тест обійшовся моком. */
export interface LockQueryClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface AcquireMigrationLockOptions {
  /** Скільки загалом чекати на лок, мс. `0` — одна спроба. */
  waitMs: number;
  /** Пауза між спробами, мс. */
  pollMs?: number;
  /** Шви для тестів. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const MIGRATION_LOCK_TIMEOUT_CODE = "MIGRATION_LOCK_TIMEOUT";

const DEFAULT_POLL_MS = 1_000;

/**
 * Бере session-scoped advisory-lock або кидає помилку з кодом
 * `MIGRATION_LOCK_TIMEOUT`, коли дедлайн вичерпано. `migrate.mjs` ловить її
 * як будь-яку іншу й виходить з кодом 1 (`migrate_failed`).
 */
export async function acquireMigrationLock(
  client: LockQueryClient,
  key: bigint,
  opts: AcquireMigrationLockOptions,
): Promise<void> {
  const pollMs = Math.max(1, opts.pollMs ?? DEFAULT_POLL_MS);
  const waitMs = Math.max(0, opts.waitMs);
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const startedAt = now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [key.toString()],
    );
    if (rows[0]?.locked === true) {
      if (attempts > 1) {
        logger.info({
          msg: "migration_lock_acquired",
          attempts,
          waitedMs: now() - startedAt,
        });
      }
      return;
    }

    const waitedMs = now() - startedAt;
    if (waitedMs >= waitMs) {
      logger.error({
        msg: "migration_lock_timeout",
        attempts,
        waitedMs,
        waitMs,
        hint: "Advisory-lock міграцій тримає інша сесія (паралельний деплой або ручний db:migrate). Дочекайся її завершення й повтори деплой або збільш MIGRATE_LOCK_WAIT_MS.",
      });
      const err = new Error(
        `migration advisory lock not acquired within ${waitMs} ms (held by another session)`,
      );
      Object.assign(err, { code: MIGRATION_LOCK_TIMEOUT_CODE });
      throw err;
    }

    if (attempts === 1) {
      logger.warn({ msg: "migration_lock_waiting", waitMs, pollMs });
    }
    await sleep(Math.min(pollMs, waitMs - waitedMs));
  }
}
