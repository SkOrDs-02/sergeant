/**
 * Ретрай-полер скасування замінених рекуренток (рев'ю 2026-10-10, data-21).
 *
 * Скасування старої підписки йде ПІСЛЯ COMMIT активації нової і не відкочує її
 * (див. `supersede.ts`). Невдачі (провайдер 5xx, креш між COMMIT і викликом,
 * тимчасово нема ключів) лишаються відкритими рядками
 * `billing_pending_cancellation`; цей полер раз на годину добиває їх.
 *
 * Не залежить від прапорців провайдерів: на порожній черзі тік - один дешевий
 * SELECT, а рядки зʼявляються лише там, де провайдер вже працював. Той самий
 * Tier-A in-process патерн, що `PlataSyncPoller` / `GdprCleanupPoller`
 * (ADR-0089): idempotent `start`/`stop`, `unref()`, стартовий тік із jitter.
 */
import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import {
  resolveStartupDelayMs,
  scheduleStartupTick,
} from "../../lib/pollerStartupTick.js";
import { retryPendingCancellations } from "./supersede.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export interface SupersedeRetryPollerOptions {
  pool: Pool;
  /** Інтервал тіку (мс). Default 1 год; 0 або менше вимикає полер. */
  intervalMs?: number | undefined;
  /** Затримка стартового тіку (мс); `0` вимикає, default - jitter 30-90 с. */
  startDelayMs?: number | undefined;
}

export class SupersedeRetryPoller {
  private readonly pool: Pool;
  private readonly intervalMs: number;
  private readonly startDelayMs: number;
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: SupersedeRetryPollerOptions) {
    this.pool = options.pool;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.startDelayMs = resolveStartupDelayMs(options.startDelayMs);
  }

  start(): void {
    if (this.timer) return;
    if (this.intervalMs <= 0) {
      logger.info({ msg: "billing_supersede_retry_poller_disabled" });
      return;
    }
    logger.info({
      msg: "billing_supersede_retry_poller_started",
      intervalMs: this.intervalMs,
    });
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    this.timer.unref?.();
    this.startTimer = scheduleStartupTick(
      this.startDelayMs,
      () => this.runOnce(),
      (err) => {
        logger.error({
          msg: "billing_supersede_retry_startup_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }

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
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "billing_supersede_retry_poller_stopped" });
  }

  /** Один тік. Ніколи не кидає. */
  async runOnce(): Promise<{ processed: number }> {
    if (this.running || this.stopping) return { processed: 0 };
    this.running = true;
    try {
      return await retryPendingCancellations(this.pool);
    } catch (err) {
      logger.error({
        msg: "billing_supersede_retry_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return { processed: 0 };
    } finally {
      this.running = false;
    }
  }
}
