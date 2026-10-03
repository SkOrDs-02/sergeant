/**
 * Хвилинний драйвер reminder-sweep-у.
 *
 * Не BullMQ навмисно — обґрунтування у шапці `./sweep.ts` (коротко: дедуп
 * уже в Postgres, а робота тут — періодичний скан, не дискретні задачі).
 *
 * Вирівнювання по межі хвилини. Нагадування задаються з точністю до хвилини
 * (`HH:MM`), тому прохід має траплятися РІВНО один раз на кожну хвилину
 * стінного годинника. Голий `setInterval(60_000)` дрейфує: затримка
 * event-loop-у поступово зсуває момент спрацювання, і рано чи пізно одна
 * хвилина пропускається цілком (два проходи поспіль бачать той самий `HH:MM`,
 * а наступний — уже інший). Тому щоразу перераховуємо час до наступної межі
 * і додаємо +2 с запасу, щоб не спіймати попередню хвилину через дрібну
 * похибку таймера. Дедуп у Postgres усе одно робить повторний прохід
 * нешкідливим — вирівнювання лише береже від ПРОПУЩЕНОЇ хвилини, яку дедуп
 * не полагодить.
 */

import type { Pool } from "pg";

import { logger, serializeError } from "../../obs/logger.js";
import { pruneReminderLog, runReminderSweep } from "./sweep.js";

export interface StartedReminderScheduler {
  /**
   * Зупинити планувальник і дочекатись поточного проходу.
   *
   * Повертає Promise навмисно. Раніше `stop()` був синхронним
   * `clearTimeout`, і shutdown ішов далі, поки `runReminderSweep` ще
   * працював — а наступним кроком закривався pg-пул. Наслідок видно лише
   * людині: рядок у `push_reminder_log` уже застовплено (дедуп спрацював),
   * а пуш не пішов, тож нагадування не приходить ВЗАГАЛІ — ні зараз, ні
   * наступною хвилиною.
   */
  stop(): Promise<void>;
}

/** Година за Києвом, коли робимо добове прибирання журналу. */
const PRUNE_AT_HM = "03:07";

/**
 * Стеля очікування поточного проходу в `stop()`. Один прохід — це кілька
 * SELECT-ів і fan-out пушів; секунди вистачає на звичайний випадок, а на
 * зависанні shutdown має йти далі, а не чекати на впалий апстрім.
 */
const STOP_DRAIN_MS = 1_000;

function msToNextMinute(now: Date): number {
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 2_000;
}

/**
 * Запустити планувальник. Повертає handle зі `stop()` для graceful shutdown.
 *
 * Помилка окремого проходу лише логується: наступна хвилина спробує знову.
 * Кидати звідси не можна — незловлений reject у таймері вбиває процес.
 */
export function startReminderScheduler(pool: Pool): StartedReminderScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  /** Поточний прохід, якщо він саме виконується. `null` між проходами. */
  let inFlight: Promise<void> | null = null;
  let lastPruneDayKey: string | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const result = await runReminderSweep(pool);
      // Прибирання привʼязане до київської години, а не до інтервалу: так
      // воно трапляється рівно раз на добу незалежно від рестартів.
      if (result.hm === PRUNE_AT_HM && lastPruneDayKey !== result.dayKey) {
        lastPruneDayKey = result.dayKey;
        const removed = await pruneReminderLog(pool);
        if (removed > 0) {
          logger.info({ msg: "reminder_log_pruned", removed });
        }
      }
    } catch (err) {
      logger.warn({
        msg: "reminder_sweep_failed",
        err: serializeError(err, { includeStack: false }),
      });
    } finally {
      inFlight = null;
      schedule();
    }
  };

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      // Тримаємо посилання на поточний прохід, щоб `stop()` мав що
      // дочекатись. `finally` у `tick` знімає його назад у `null`.
      inFlight = tick();
      void inFlight;
    }, msToNextMinute(new Date()));
    // `unref` — таймер не має тримати процес живим під час shutdown-у.
    if (typeof timer.unref === "function") timer.unref();
  };

  schedule();
  logger.info({ msg: "reminder_scheduler_started" });

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      // Власна стеля, незалежна від caller-а: прохід ходить у Postgres і в
      // push-апстріми, тож «дочекатись» без верхньої межі означало б, що
      // зависла БД тримає весь shutdown. Після спливу лишаємо прохід
      // дограти у фоні — дедуп у `push_reminder_log` робить повторний
      // прохід після рестарту нешкідливим.
      if (!inFlight) return;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<"timeout">((resolve) => {
        timeoutTimer = setTimeout(() => resolve("timeout"), STOP_DRAIN_MS);
        timeoutTimer.unref?.();
      });
      try {
        const outcome = await Promise.race([
          inFlight.then(() => "done" as const),
          expired,
        ]);
        if (outcome === "timeout") {
          logger.warn({
            msg: "reminder_scheduler_stop_timeout",
            timeoutMs: STOP_DRAIN_MS,
          });
        }
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
      }
    },
  };
}
