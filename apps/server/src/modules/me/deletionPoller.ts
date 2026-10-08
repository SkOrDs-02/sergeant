/**
 * In-process добивач акаунтів, у яких минуло вікно на скасування.
 *
 * > **Last validated:** 2026-09-20. **Status:** Active
 *
 * ЧОМУ цей файл існує. `DELETE /api/me` більше не видаляє одразу: він
 * ставить `deletion_requested_at` (`dataRights.ts::requestAccountDeletion`,
 * міграція 145). Незворотну частину `purgeUserData` після кінця вікна має
 * покликати хтось, і це той хтось. Без нього позначені акаунти висіли б
 * вічно, тобто ми порушили б власну обіцянку видалити дані (ADR-0098,
 * GDPR Art. 17).
 *
 * Патерн дзеркалить `modules/gdpr/cleanupPoller.ts`: `setInterval` +
 * `unref()`, ідемпотентні `start`/`stop`, overlap-guard, помилка тику
 * логується і не валить процес. Claim рядків той самий `FOR UPDATE SKIP
 * LOCKED`, що в `cleanupWorker.ts::claimBatch`, як вимагає ADR-0089
 * § Compliance: періодичний ідемпотентний скан із дедупом у Postgres це
 * in-process timer, не BullMQ.
 *
 * Інтервал година: точність до години для 30-денного вікна надлишкова, а
 * частіший скан безпідставно молотить базу.
 */

import type { Pool } from "pg";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import { waitUntilIdle } from "../../lib/pollerDrain.js";
import {
  resolveStartupDelayMs,
  scheduleStartupTick,
} from "../../lib/pollerStartupTick.js";
import { toPublicErrorCode } from "../../obs/errorCode.js";
import { purgeUserData } from "./dataRights.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Акаунтів за тик. Вікно 30-денне, тож за годину фізично не назбирується
 * багато; ліміт тут запобіжник проти разового сплеску (масовий тест-прогін,
 * міграція даних), а не пропускна здатність.
 */
const DEFAULT_BATCH_LIMIT = 20;

/** ISO-час останнього успішного тику ЦЬОГО процесу; null до першого. */
let lastRunAtIso: string | null = null;

export interface AccountDeletionPollerOptions {
  pool: Pool;
  /** Інтервал у мілісекундах. Default 1 год. 0 означає off. */
  intervalMs?: number | undefined;
  /** Акаунтів за тик. Default 20. */
  batchLimit?: number | undefined;
  /**
   * Затримка одноразового стартового тіку (мс). Default - jitter 30-90 с;
   * 0 або від'ємне вимикає (rel-19: без нього кожен деплой скидав інтервал).
   */
  startDelayMs?: number | undefined;
}

export interface AccountDeletionTickResult {
  /** Скільки акаунтів дозріло і було взято в роботу цим тиком. */
  claimed: number;
  /** Скільки з них дійсно видалено. */
  purged: number;
  /** Скільки впало на помилці; лишаються позначеними і дозріють знову. */
  failed: number;
}

/**
 * Забирає дозрілі акаунти одним атомарним запитом. `FOR UPDATE SKIP
 * LOCKED` дає двом реплікам працювати одночасно без подвійного видалення
 * того самого акаунта.
 *
 * Лізи (`next_attempt_at`) тут немає навмисно, на відміну від
 * `gdpr_cleanup_queue`: рядок зникає разом із самим акаунтом, тож
 * повторний claim неможливий у принципі, а впав тик, акаунт лишився
 * позначеним і дозріє знову за годину.
 */
async function claimMatureAccounts(
  pool: Pick<Pool, "query">,
  limit: number,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
       FROM "user"
      WHERE deletion_requested_at IS NOT NULL
        AND deletion_requested_at < NOW() - ($2 || ' days')::interval
      ORDER BY deletion_requested_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit, String(ACCOUNT_DELETION_GRACE_DAYS)],
  );
  return rows.map((r) => r.id);
}

export class AccountDeletionPoller {
  private readonly pool: Pool;
  private readonly intervalMs: number;
  private readonly batchLimit: number;
  private readonly startDelayMs: number;
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: AccountDeletionPollerOptions) {
    this.pool = options.pool;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    this.startDelayMs = resolveStartupDelayMs(options.startDelayMs);
  }

  /** Запускає loop. Ідемпотентно: повторний start не дублює timer. */
  start(): void {
    if (this.timer) return;
    if (this.intervalMs <= 0) {
      logger.info({
        msg: "account_deletion_poller_disabled",
        reason: "interval_zero",
        intervalMs: this.intervalMs,
      });
      return;
    }
    logger.info({
      msg: "account_deletion_poller_started",
      intervalMs: this.intervalMs,
      batchLimit: this.batchLimit,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    });
    const onTickError = (err: unknown): void => {
      logger.error({
        msg: "account_deletion_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
    };
    this.timer = setInterval(() => {
      void this.runOnce().catch(onTickError);
    }, this.intervalMs);
    this.timer.unref?.();
    // Одноразовий стартовий тік: інтервал рахується від старту процесу, а
    // деплоїв більше, ніж годин (rel-19).
    this.startTimer = scheduleStartupTick(
      this.startDelayMs,
      () => this.runOnce(),
      onTickError,
    );
  }

  /** Зупиняє loop. Ідемпотентно; чекає, поки in-flight тик завершиться. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const drain = await waitUntilIdle(() => this.running);
    this.stopping = false;
    if (!drain.idle) {
      logger.warn({
        msg: "account_deletion_poller_stop_timeout",
        waitedMs: drain.waitedMs,
      });
    }
    logger.info({ msg: "account_deletion_poller_stopped" });
  }

  /**
   * Один тик. Public для тестів і для ручного прогону.
   *
   * Кожен акаунт добивається окремо: одна помилка (наприклад, недоступний
   * провайдер) не має забирати з собою решту пачки.
   */
  async runOnce(): Promise<AccountDeletionTickResult | null> {
    if (this.running || this.stopping) return null;
    this.running = true;
    try {
      const ids = await this.claimBatch();

      let purged = 0;
      let failed = 0;
      for (const userId of ids) {
        try {
          // Черга очищення зовнішніх сервісів наповнюється саме тут, а не
          // в день прохання (рішення 6 спеки): поки вікно триває, у
          // Stripe, Sentry, PostHog і Resend нічого не чіпається, тож
          // відновлення повертає акаунт цілим. Чергу наповнює сам
          // `purgeUserData` усередині своєї транзакції.
          await purgeUserData(this.pool, userId);
          purged += 1;
        } catch (err) {
          failed += 1;
          logger.error({
            msg: "account_deletion_purge_failed",
            // Сам id не логуємо: це ідентифікатор, який пережив би
            // видалений акаунт у логах. Класу помилки досить, щоб
            // побачити, що добивач стоїть.
            errorCode: toPublicErrorCode(err),
          });
        }
      }

      lastRunAtIso = new Date().toISOString();
      if (purged > 0 || failed > 0) {
        logger.info({
          msg: "account_deletion_tick",
          claimed: ids.length,
          purged,
          failed,
        });
      }
      return { claimed: ids.length, purged, failed };
    } finally {
      this.running = false;
    }
  }

  /**
   * Claim у власній короткій транзакції: `FOR UPDATE SKIP LOCKED` тримає
   * блокування лише до COMMIT, а саме видалення йде своїми транзакціями і
   * довгого lock-у на `"user"` не тримає.
   */
  private async claimBatch(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const ids = await claimMatureAccounts(client, this.batchLimit);
      await client.query("COMMIT");
      return ids;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Snapshot для `/health/workers`, та сама роль, що
 * `getGdprCleanupWorkerStatus`. Без цієї видимості факт «добивач помер два
 * тижні тому» не помітив би ніхто, а позначені акаунти висіли б далі. Це
 * названо окремим ризиком у спеці, тож пункт не косметичний.
 *
 * `errorCode`, а не текст помилки: роут анонімний і без rate-limit, а `pg`
 * кладе у `message` імʼя DB-користувача і внутрішній хост
 * (`obs/errorCode.ts`).
 */
export interface AccountDeletionWorkerStatus {
  enabled: boolean;
  intervalMs: number;
  graceDays: number;
  lastRunAt: string | null;
  pending: {
    /** Позначені акаунти, у яких вікно ще триває. */
    waiting: number;
    /** Дозрілі: вікно минуло, а акаунт досі тут. Стабільно більше нуля означає, що добивач стоїть. */
    overdue: number;
  } | null;
  errorCode?: string;
}

export async function getAccountDeletionWorkerStatus(
  pool: Pick<Pool, "query">,
  intervalMs: number,
): Promise<AccountDeletionWorkerStatus> {
  const enabled = intervalMs > 0;
  try {
    const { rows } = await pool.query<{
      waiting: number | string;
      overdue: number | string;
    }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE deletion_requested_at >= NOW() - ($1 || ' days')::interval
         )::bigint AS waiting,
         COUNT(*) FILTER (
           WHERE deletion_requested_at < NOW() - ($1 || ' days')::interval
         )::bigint AS overdue
       FROM "user"
      WHERE deletion_requested_at IS NOT NULL`,
      [String(ACCOUNT_DELETION_GRACE_DAYS)],
    );
    const row = rows[0];
    return {
      enabled,
      intervalMs,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      lastRunAt: lastRunAtIso,
      pending: {
        // Hard Rule #1: pg віддає bigint як string, коерсимо в number.
        waiting: Number(row?.waiting ?? 0) || 0,
        overdue: Number(row?.overdue ?? 0) || 0,
      },
    };
  } catch (err) {
    logger.error({
      msg: "account_deletion_status_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      enabled,
      intervalMs,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      lastRunAt: lastRunAtIso,
      pending: null,
      errorCode: toPublicErrorCode(err),
    };
  }
}

/** Для тестів: скидає module-level мітку останнього тику. */
export const __testingResetLastRunAt = (): void => {
  lastRunAtIso = null;
};
