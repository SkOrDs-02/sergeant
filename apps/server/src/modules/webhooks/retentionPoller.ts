/**
 * PR-28 — in-process retention cron для `n8n_webhook_events`.
 *
 * Періодично `DELETE`-ить рядки старші за `WEBHOOK_EVENTS_RETENTION_DAYS`
 * (default 30). Лежить в тому самому Node-процесі що `apps/server`
 * (Tier-A архітектура з migration plan §C1b) — не потребує BullMQ-черги,
 * не потребує externalsdeps, idempotent (можна викликати кілька разів —
 * другий tick просто видалить 0 рядків).
 *
 * Дизайн-вибори:
 *   * Інтервал за замовчуванням — 1 година. WEBHOOK_EVENTS_RETENTION_DAYS
 *     має сенс міряти у днях, тож годинна гранулярність — дешева оверкіл,
 *     яка дає monitoring-граф «що працює» без чекання на full день.
 *   * Idempotent start/stop, як у `ReminderPoller`. `runOnce` — public для
 *     тестів і для admin-endpoint-у в майбутньому.
 *   * `timer.unref()` — не блокує graceful shutdown.
 *   * Failure of one tick → лог + продовжуємо. Помилка `DELETE`-у (на
 *     replica? lock? `statement_timeout`?) не повинна впливати на server
 *     uptime — наступний tick спробує знову.
 */

import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";

export interface RetentionPollerOptions {
  pool: Pool;
  /** Скільки днів зберігати webhook-події. 0 → off (poller не запускається). */
  retentionDays: number;
  /** Інтервал в мілісекундах. Default 1 год. 0 → off. */
  intervalMs?: number;
}

export interface RetentionTickResult {
  /** Кількість рядків, які видалено (DELETE … RETURNING 1 count). */
  deleted: number;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export class WebhookEventsRetentionPoller {
  private readonly pool: Pool;
  private readonly retentionDays: number;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: RetentionPollerOptions) {
    this.pool = options.pool;
    this.retentionDays = options.retentionDays;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** Запускає cron-loop. Idempotent — повторні start-и не дублюють timer. */
  start(): void {
    if (this.timer) return;
    if (this.intervalMs <= 0 || this.retentionDays <= 0) {
      logger.info({
        msg: "webhook_events_retention_poller_disabled",
        reason: this.intervalMs <= 0 ? "interval_zero" : "retention_zero",
        retentionDays: this.retentionDays,
        intervalMs: this.intervalMs,
      });
      return;
    }
    logger.info({
      msg: "webhook_events_retention_poller_started",
      retentionDays: this.retentionDays,
      intervalMs: this.intervalMs,
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => {
        logger.error({
          msg: "webhook_events_retention_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  /** Зупиняє loop. Idempotent; чекає поки in-flight tick завершиться. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "webhook_events_retention_poller_stopped" });
  }

  /**
   * Виконати один cleanup-tick. Експортується для тестів і для
   * admin-endpoint-у. Повертає кількість видалених рядків.
   *
   * Re-entrancy: якщо tick уже запущений (long DELETE на великій таблиці),
   * повторний виклик повертає `{ deleted: 0 }` без блокування.
   */
  async runOnce(): Promise<RetentionTickResult> {
    if (this.running || this.stopping) {
      return { deleted: 0 };
    }
    if (this.retentionDays <= 0) {
      return { deleted: 0 };
    }
    this.running = true;
    try {
      // `received_at < now() - interval '<N> days'`. Передаємо `retentionDays`
      // через bind-param щоб не conkat-увати число у текст SQL-у (хоч то
      // server-controlled значення, але звичка — Hard Rule #4 spirit).
      const result = await this.pool.query<{ id: string }>(
        `DELETE FROM n8n_webhook_events
          WHERE received_at < now() - ($1::int * INTERVAL '1 day')
       RETURNING id`,
        [this.retentionDays],
      );
      const deleted = result.rowCount ?? result.rows.length;
      if (deleted > 0) {
        logger.info({
          msg: "webhook_events_retention_tick",
          deleted,
          retentionDays: this.retentionDays,
        });
      }
      return { deleted };
    } finally {
      this.running = false;
    }
  }
}
