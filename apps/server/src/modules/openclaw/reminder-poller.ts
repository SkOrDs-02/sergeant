/**
 * In-process reminder cron-poller (PR-C1b).
 *
 * Architecture (per migration-plan §C1b):
 *
 *   Тікер (default 60s) -> claimDueReminders() (atomic, FOR UPDATE SKIP LOCKED)
 *                       -> для кожної: dispatch(reminder)
 *                          - success → markReminderSent
 *                          - failure → if attempts >= max → markReminderFailed
 *                                       else залишити в pending (наступний poll
 *                                       спробує знову)
 *
 * Дизайн-вибори:
 *   1) Cron-trigger у тому самому Node-процесі що `apps/server`. Це Tier-A
 *      (Mid-term plan переноситься в n8n workflow коли C1c-tools дозрівають;
 *      контракт `/api/internal/openclaw/reminders/list-due` стабільний — n8n
 *      зможе підключитися без міграції БД).
 *   2) `dispatcher` injectable. Defaults to `logOnlyDispatcher` — нічого
 *      не надсилає, тільки логує. Production wires Telegram bot dispatcher
 *      у `apps/server/src/index.ts` (поза скоупом цього PR).
 *   3) `start/stop` lifecycle, ідемпотентний; тести викликають `runOnce`
 *      для deterministic-у.
 */

import type { Pool } from "pg";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import {
  claimDueReminders,
  markReminderFailed,
  markReminderSent,
} from "./reminders.js";
import type { ReminderRecord } from "./reminders.js";

export type ReminderDispatcher = (
  reminder: ReminderRecord,
) => Promise<void> | void;

export interface ReminderPollerOptions {
  pool: Pool;
  /** Poll interval (ms). 0 → disable. */
  intervalMs?: number;
  /** Hard cap на attempts перед `failed`. */
  maxAttempts?: number;
  /** Batch size per poll. */
  batchSize?: number;
  /**
   * Hook: викликається на кожен claimed reminder. Має кинути для невдачі.
   * Default — лог + no-op (Telegram dispatcher attaches у production wiring).
   */
  dispatcher?: ReminderDispatcher;
  /** Test-only override of `now`. */
  nowIso?: string;
}

export class ReminderPoller {
  private pool: Pool;
  private intervalMs: number;
  private maxAttempts: number;
  private batchSize: number;
  private dispatcher: ReminderDispatcher;
  private nowIso: string | undefined;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: ReminderPollerOptions) {
    this.pool = options.pool;
    this.intervalMs =
      options.intervalMs ?? env.OPENCLAW_REMINDER_POLL_INTERVAL_MS;
    this.maxAttempts =
      options.maxAttempts ?? env.OPENCLAW_REMINDER_MAX_ATTEMPTS;
    this.batchSize = options.batchSize ?? env.OPENCLAW_REMINDER_POLL_BATCH;
    this.dispatcher = options.dispatcher ?? logOnlyDispatcher;
    this.nowIso = options.nowIso;
  }

  /** Запускає loop. Idempotent — повторні виклики ігноруються. */
  start(): void {
    if (this.timer || this.intervalMs <= 0) {
      if (this.intervalMs <= 0) {
        logger.info({
          msg: "openclaw_reminder_poller_disabled",
          reason: "interval_zero",
        });
      }
      return;
    }
    logger.info({
      msg: "openclaw_reminder_poller_started",
      intervalMs: this.intervalMs,
      maxAttempts: this.maxAttempts,
      batchSize: this.batchSize,
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => {
        logger.error({
          msg: "openclaw_reminder_poller_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    // unref щоб не блокувати graceful shutdown
    this.timer.unref?.();
  }

  /** Зупиняє loop. Idempotent. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Зачекати на in-flight tick, якщо є.
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "openclaw_reminder_poller_stopped" });
  }

  /**
   * Виконати один tick. Експортується для тестів та для admin-endpoint-у
   * (`/reminders/poll-now`, не реалізовано тут — будемо у Phase 2).
   *
   * Повертає stats для observability.
   */
  async runOnce(): Promise<{
    claimed: number;
    sent: number;
    failed: number;
    retried: number;
  }> {
    if (this.running || this.stopping) {
      return { claimed: 0, sent: 0, failed: 0, retried: 0 };
    }
    this.running = true;
    try {
      const claimOpts: { limit?: number; nowIso?: string } = {
        limit: this.batchSize,
      };
      if (this.nowIso !== undefined) {
        claimOpts.nowIso = this.nowIso;
      }
      const claimed = await claimDueReminders(this.pool, claimOpts);
      let sent = 0;
      let failed = 0;
      let retried = 0;

      for (const reminder of claimed) {
        try {
          await this.dispatcher(reminder);
          await markReminderSent(this.pool, reminder.id);
          sent += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          if (reminder.attempts >= this.maxAttempts) {
            await markReminderFailed(this.pool, reminder.id, reason);
            failed += 1;
            logger.error({
              msg: "openclaw_reminder_failed_max_attempts",
              reminderId: reminder.id,
              attempts: reminder.attempts,
              reason,
            });
          } else {
            // Залишаємо у pending; наступний poll спробує знову.
            retried += 1;
            logger.warn({
              msg: "openclaw_reminder_dispatch_failed_will_retry",
              reminderId: reminder.id,
              attempts: reminder.attempts,
              reason,
            });
          }
        }
      }

      if (claimed.length > 0) {
        logger.info({
          msg: "openclaw_reminder_poll_tick",
          claimed: claimed.length,
          sent,
          failed,
          retried,
        });
      }
      return { claimed: claimed.length, sent, failed, retried };
    } finally {
      this.running = false;
    }
  }
}

/**
 * Default dispatcher — no-op. Лог-канал лишається доступним для смоук-тесту
 * "poller does fire" без вимоги реального Telegram bot client.
 */
export const logOnlyDispatcher: ReminderDispatcher = (
  reminder: ReminderRecord,
) => {
  logger.info({
    msg: "openclaw_reminder_dispatch_stub",
    reminderId: reminder.id,
    founderUserId: reminder.founderUserId,
    channel: reminder.channel,
    persona: reminder.persona,
    topic: reminder.topic,
  });
};
