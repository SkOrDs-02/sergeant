/**
 * Хвилинний драйвер reminder-sweep-у.
 *
 * Не BullMQ навмисно — див. шапку `./sweep.ts`: черга без `REDIS_URL` не
 * стартує, а `REDIS_URL` у проді не заданий, тож канал мовчав би далі.
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
  stop(): void;
}

/** Година за Києвом, коли робимо добове прибирання журналу. */
const PRUNE_AT_HM = "03:07";

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
  let lastPruneDayKey: string | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const result = await runReminderSweep(pool);
      // Прибирання прив'язане до київської години, а не до інтервалу: так
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
      schedule();
    }
  };

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), msToNextMinute(new Date()));
    // `unref` — таймер не має тримати процес живим під час shutdown-у.
    if (typeof timer.unref === "function") timer.unref();
  };

  schedule();
  logger.info({ msg: "reminder_scheduler_started" });

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
