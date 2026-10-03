import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { waitUntilIdle } from "../../lib/pollerDrain.js";
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
 * `docs/work/specs/audits/2026-08-05-orphaned-code-audit.md`: ~20 роутів у репо
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
 * Синкати користувача не частіше, ніж раз на стільки годин.
 *
 * **8, а не 20 (рішення власника, 2026-09-17).** Двадцять годин давали
 * рівно один синк на добу — і це означало, що вечірню покупку полер у той
 * самий вечір не підхоплював НІКОЛИ, за побудовою: якщо попередній тік
 * пройшов зранку, наступний припадає на глибоку ніч. Саме з цього й
 * почалась скарга «синк каже, що знайшов один новий чек, а мого
 * сьогоднішнього вечірнього немає».
 *
 * Вісім годин дають приблизно ранок / день / вечір, тобто вечірній чек
 * приїжджає за 1-8 год без жодного тапу. Ціна — ×2.5 запитів до Сільпо:
 * `client_id` там ОДИН на весь деплой (DCR-реєстрація застосунку, не
 * користувача), тож ліміти й circuit breaker у `mcpClient.ts` спільні на
 * всіх. Тому поріг — свідомий компроміс, а не «щоб частіше»: 4 години
 * розглядались і відкинуті саме через цей спільний бюджет.
 *
 * І далі не 24 і не 8 рівно з тієї ж причини, що й раніше: при годинному
 * тику поріг, кратний очікуваній паузі, плавно зʼїжджав би вперед, і синк
 * дрейфував би по колу доби. Вісім тут — стеля «не частіше ніж», а не
 * розклад.
 */
const DEFAULT_MIN_AGE_HOURS = 8;

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
    // Стеля замість безкінечного busy-wait-у: tick ходить у Postgres (а в
    // частині полерів — і в зовнішній API), тож «чекати, поки завершиться»
    // без межі означало б, що зависла залежність тримає весь shutdown.
    // Після спливу лишаємо tick дограти у фоні — він ідемпотентний, а пул
    // йому вже може й не відповісти; це кращий зі станів, ніж SIGKILL
    // посеред graceful-шляху.
    const drain = await waitUntilIdle(() => this.running);
    this.stopping = false;
    if (!drain.idle) {
      logger.warn({
        msg: "silpo_sync_poller_stop_timeout",
        waitedMs: drain.waitedMs,
      });
    }
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
