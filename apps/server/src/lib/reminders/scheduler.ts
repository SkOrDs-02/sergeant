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
import { runSergeantNudgeSweep } from "./nudge.js";
import { pruneReminderLog, runReminderSweep } from "./sweep.js";

export interface StartedReminderScheduler {
  stop(): void;
}

/** Година за Києвом, коли робимо добове прибирання журналу. */
const PRUNE_AT_HM = "03:07";

/**
 * Слот проактивного підштовхування Сержанта, 09:00 Europe/Kyiv (спека D5).
 *
 * Той самий хвилинний таймер, що й нагадування: добова робота — це просто
 * умова на `hm` плюс памʼять про вже відпрацьовану добу. Окремої черги під
 * одну задачу на добу не заводимо (чому саме — див. шапку `./nudge.ts`).
 */
const NUDGE_AT_HM = "09:00";

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
  let lastNudgeDayKey: string | null = null;

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
      // `lastNudgeDayKey` страхує від подвійного проходу в межах однієї
      // хвилини (перезапуск процесу о 09:00). Дедуп у БД усе одно не дав би
      // другого пуша, але зайвий скан таблиці ні до чого.
      if (result.hm === NUDGE_AT_HM && lastNudgeDayKey !== result.dayKey) {
        lastNudgeDayKey = result.dayKey;
        await runSergeantNudgeSweep(pool);
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
