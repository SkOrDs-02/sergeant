// Календарний тиждень для сигналів про витрати: пн–нд за Києвом (рішення
// власника 2026-10-01, f1 «Одна правда про витрати»).
//
// До цього «тиждень» у чотирьох сигналах хабу означав чотири різні вікна:
// календарний (картка «вище ніж минулого тижня»), попередні 7 днів («Сьогодні
// вище середнього»), ковзні 7 днів («Тиждень у цифрах») і пн–нд за годинником
// телефона (дайджест). Тут живе ОДНЕ визначення для двох перших споживачів:
// правила `spending_velocity_*` і локального звіту тижня.
//
// Порівнюються однакові відрізки: на початку тижня пн–ср цього тижня стоять
// проти пн–ср минулого, а не неповний тиждень проти повного. Межі — київські
// доби (гроші, `AGENTS.md § Domain invariants`), без власної арифметики дат:
// понеділок дає `kyivMondayStartMs`, початок доби — `kyivDayStartMs`.
import {
  kyivDayStartMs,
  kyivMondayStartMs,
  toKyivISODate,
} from "@sergeant/shared";

const DAY_MS = 86_400_000;

export interface WeekSliceRange {
  /** Початок вікна (мс), включно: київська 00:00 дня. */
  startMs: number;
  /** Кінець вікна (мс), виключно: київська 00:00 наступного дня. */
  endMs: number;
}

export interface WeekSliceWindows {
  /** Сьогоднішній київський день-ключ. */
  todayKey: string;
  /** Скільки днів тижня минуло, включно із сьогоднішнім: пн = 1 … нд = 7. */
  daysElapsed: number;
  /** Цей тиждень від понеділка до кінця сьогоднішньої київської доби. */
  current: WeekSliceRange;
  /** Той самий відрізок минулого тижня: ті самі `daysElapsed` днів від його понеділка. */
  previous: WeekSliceRange;
}

/**
 * Зсув ключа дня `YYYY-MM-DD` на N календарних днів. Ключ — календарна дата
 * без зони, тож крок іде через UTC-полудень: UTC не має переходів, і доба
 * завжди рівно доба (на відміну від додавання мілісекунд у київській зоні).
 */
function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Вікна «цей тиждень до сьогодні» і «той самий відрізок минулого тижня».
 * `now` — момент, від якого рахується «сьогодні»; ні від годинника
 * пристрою, ні від його часового поясу результат не залежить.
 */
export function weekSliceWindows(now: Date | number): WeekSliceWindows {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const todayKey = toKyivISODate(nowMs);
  const mondayKey = toKyivISODate(kyivMondayStartMs(nowMs));
  const daysElapsed =
    Math.round(
      (Date.parse(`${todayKey}T12:00:00Z`) -
        Date.parse(`${mondayKey}T12:00:00Z`)) /
        DAY_MS,
    ) + 1;
  const prevMondayKey = shiftDayKey(mondayKey, -7);
  return {
    todayKey,
    daysElapsed,
    current: {
      startMs: kyivDayStartMs(mondayKey),
      endMs: kyivDayStartMs(shiftDayKey(mondayKey, daysElapsed)),
    },
    previous: {
      startMs: kyivDayStartMs(prevMondayKey),
      endMs: kyivDayStartMs(shiftDayKey(prevMondayKey, daysElapsed)),
    },
  };
}
