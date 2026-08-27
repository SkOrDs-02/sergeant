import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { syncAllConnectedUsers, type SyncAllResult } from "./syncAll.js";

/**
 * Фоновий синк чеків Сільпо — in-process poller.
 *
 * Патерн узятий з `modules/billing/plataScheduler.ts` (`PlataRecurringPoller`):
 * `setInterval` + `unref()`, idempotent `start()`/`stop()`, tick ніколи не
 * накладається сам на себе. Та сама причина, що й там, дослівно з її
 * коментаря — **n8n paused у проді**, тож зовнішній крон нікого не збудить.
 *
 * Перша версія цього синку саме на n8n і спиралась (WF-11, cron 07:30). Це
 * була помилка того ж класу, що описана в
 * `docs/90-work/audits/2026-08-05-orphaned-code-audit.md`: ~20 роутів у репо
 * вже чекають на воркфлоу, яких ніхто не створив, і аудит називає це
 * кореневою причиною мертвого коду. Ендпоїнт без викликача виглядає як
 * робоча фіча рівно доти, доки хтось не спитає, хто його смикає.
 *
 * Чому не «о 07:30», а «кожні N годин»: контейнер рестартує на кожен
 * деплой, і крон стінного годинника такі рестарти пропускав би мовчки.
 * Замість цього tick питає «кому вже час» через `last_sync_at`
 * (`minAgeHours`), тож розклад самовідновлюється: пропущений через
 * рестарт користувач просто підхопиться наступним тиком.
 */

/** Як часто перевіряти, кому час. Не те саме, що частота синку. */
const DEFAULT_TICK_MS = 60 * 60 * 1000; // година

/**
 * Синкати користувача не частіше, ніж раз на стільки годин. 20, а не 24 —
 * інакше при годинному тику «раз на добу» плавно зʼїжджало б на добу з
 * гаком, і синк дрейфував би по колу доби.
 */
const DEFAULT_MIN_AGE_HOURS = 20;

/**
 * Затримка першого тика після старту процесу. Деплой не має одразу бити
 * спільний `client_id` Сільпо — особливо при швидкій серії передеплоїв.
 */
const DEFAULT_START_DELAY_MS = 5 * 60 * 1000; // 5 хвилин

export interface SilpoSyncPollerOptions {
  tickMs?: number | undefined;
  minAgeHours?: number | undefined;
  startDelayMs?: number | undefined;
  enabled?: boolean | undefined;
  /** Інʼєкція для тестів — реальний прогін бʼє в мережу. */
  run?: ((opts: { minAgeHours: number }) => Promise<SyncAllResult>) | undefined;
}

export class SilpoSyncPoller {
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private readonly tickMs: number;
  private readonly minAgeHours: number;
  private readonly startDelayMs: number;
  private readonly enabled: boolean;
  private readonly run: (opts: {
    minAgeHours: number;
  }) => Promise<SyncAllResult>;

  constructor(options: SilpoSyncPollerOptions = {}) {
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.minAgeHours = options.minAgeHours ?? DEFAULT_MIN_AGE_HOURS;
    this.startDelayMs = options.startDelayMs ?? DEFAULT_START_DELAY_MS;
    this.enabled = options.enabled ?? env.SILPO_ENABLED;
    this.run =
      options.run ??
      ((opts) => syncAllConnectedUsers({ minAgeHours: opts.minAgeHours }));
  }

  start(): void {
    if (this.timer || this.startTimer) return;
    if (!this.enabled || this.tickMs <= 0) {
      logger.info({
        msg: "silpo_sync_poller_disabled",
        enabled: this.enabled,
        tickMs: this.tickMs,
      });
      return;
    }
    logger.info({
      msg: "silpo_sync_poller_started",
      tickMs: this.tickMs,
      minAgeHours: this.minAgeHours,
    });
    const beginTicking = (): void => {
      this.startTimer = null;
      void this.tick();
      this.timer = setInterval(() => void this.tick(), this.tickMs);
      this.timer.unref?.();
    };
    if (this.startDelayMs > 0) {
      this.startTimer = setTimeout(beginTicking, this.startDelayMs);
      this.startTimer.unref?.();
    } else {
      beginTicking();
    }
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
    logger.info({ msg: "silpo_sync_poller_stopped" });
  }

  /** Один прохід. Ніколи не кидає — впалий tick не має валити процес. */
  async tick(): Promise<SyncAllResult | null> {
    if (this.running || this.stopping) return null;
    this.running = true;
    try {
      return await this.run({ minAgeHours: this.minAgeHours });
    } catch (err) {
      logger.error({
        msg: "silpo_sync_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      this.running = false;
    }
  }
}
