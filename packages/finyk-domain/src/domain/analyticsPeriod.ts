// Періоди Аналітики (фаза 2 спеки аналітики v3, Р5): тиждень, місяць, рік і
// довільний діапазон. Період задано київськими днями `YYYY-MM-DD` з обома
// краями включно, а вікно для транзакцій дає `periodWindow` як `[start, end)`
// у мілісекундах. Межі тут чисто календарні, гроші до дня відносить
// київський день транзакції (`AGENTS.md § Domain invariants`).
//
// Порівняння (Р5.3, Р5.4): тиждень, місяць і рік стоять проти попереднього
// такого самого періоду, діапазон проти попередніх днів тієї ж довжини, що
// закінчуються за день до «від». Незавершений календарний період (у ньому є
// сьогоднішній день) міряється тими ж днями попереднього: на 15 червня це
// 1-15 травня, а не весь травень. Це та сама семантика «за ті ж дні», що
// Аналітика мала для місяця з v2, поширена на тиждень і рік.
import { kyivDayStartMs } from "@sergeant/shared";
import { shiftDayKey } from "./weekSlices";

export type AnalyticsPeriodKind = "week" | "month" | "year" | "range";
export type CalendarPeriodKind = Exclude<AnalyticsPeriodKind, "range">;

export interface AnalyticsPeriod {
  kind: AnalyticsPeriodKind;
  /** Перший день, включно. */
  fromKey: string;
  /** Останній день, включно. */
  toKey: string;
}

export interface PeriodWindow {
  fromKey: string;
  toKey: string;
  /** Київська 00:00 першого дня. */
  startMs: number;
  /** Київська 00:00 дня після останнього, виключно. */
  endMs: number;
}

export interface ComparisonWindow extends PeriodWindow {
  /** Обрізано до тих самих днів, бо поточний період ще не скінчився. */
  partial: boolean;
}

function dayIndex(key: string): number {
  return Math.round(Date.parse(`${key}T12:00:00Z`) / 86_400_000);
}

/** Скільки днів у періоді, обидва краї включно. */
export function periodDays(p: Pick<AnalyticsPeriod, "fromKey" | "toKey">) {
  return dayIndex(p.toKey) - dayIndex(p.fromKey) + 1;
}

function monthStart(key: string, deltaMonths = 0): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + deltaMonths;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

/** Календарний період, що містить день `dayKey`. Тиждень з понеділка. */
export function periodOf(
  kind: CalendarPeriodKind,
  dayKey: string,
): AnalyticsPeriod {
  if (kind === "week") {
    // 0 = неділя; ключ без зони, тож день тижня з UTC-полудня.
    const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
    const fromKey = shiftDayKey(dayKey, -((weekday + 6) % 7));
    return { kind, fromKey, toKey: shiftDayKey(fromKey, 6) };
  }
  if (kind === "month") {
    const fromKey = monthStart(dayKey);
    return { kind, fromKey, toKey: shiftDayKey(monthStart(dayKey, 1), -1) };
  }
  const year = dayKey.slice(0, 4);
  return { kind, fromKey: `${year}-01-01`, toKey: `${year}-12-31` };
}

/** Довільний діапазон; переплутані краї міняються місцями. */
export function rangePeriod(aKey: string, bKey: string): AnalyticsPeriod {
  return aKey <= bKey
    ? { kind: "range", fromKey: aKey, toKey: bKey }
    : { kind: "range", fromKey: bKey, toKey: aKey };
}

/** Сусідній період на `steps` кроків уперед (додатні) чи назад (відʼємні). */
export function shiftPeriod(
  p: AnalyticsPeriod,
  steps: number,
): AnalyticsPeriod {
  if (p.kind === "range") {
    const len = periodDays(p) * steps;
    return {
      kind: "range",
      fromKey: shiftDayKey(p.fromKey, len),
      toKey: shiftDayKey(p.toKey, len),
    };
  }
  if (p.kind === "week")
    return periodOf("week", shiftDayKey(p.fromKey, 7 * steps));
  if (p.kind === "month")
    return periodOf("month", monthStart(p.fromKey, steps));
  return periodOf("year", `${Number(p.fromKey.slice(0, 4)) + steps}-01-01`);
}

export function periodWindow(
  p: Pick<AnalyticsPeriod, "fromKey" | "toKey">,
): PeriodWindow {
  return {
    fromKey: p.fromKey,
    toKey: p.toKey,
    startMs: kyivDayStartMs(p.fromKey),
    endMs: kyivDayStartMs(shiftDayKey(p.toKey, 1)),
  };
}

/** Вікно, з яким порівнюється період (див. шапку модуля). */
export function comparisonWindow(
  p: AnalyticsPeriod,
  todayKey: string,
): ComparisonWindow {
  const prev = shiftPeriod(p, -1);
  const partial =
    p.kind !== "range" && p.fromKey <= todayKey && todayKey < p.toKey;
  if (!partial) return { ...periodWindow(prev), partial };
  const elapsed = periodDays({ fromKey: p.fromKey, toKey: todayKey });
  const sameDays = shiftDayKey(prev.fromKey, elapsed - 1);
  const toKey = sameDays < prev.toKey ? sameDays : prev.toKey;
  return { ...periodWindow({ fromKey: prev.fromKey, toKey }), partial };
}

/**
 * Далі гортати нікуди: наступний календарний період почнеться після
 * сьогодні, а наступний діапазон залізе в майбутнє.
 */
export function isLatestPeriod(p: AnalyticsPeriod, todayKey: string): boolean {
  const next = shiftPeriod(p, 1);
  return (p.kind === "range" ? next.toKey : next.fromKey) > todayKey;
}

/** Місяці `YYYY-MM`, які зачіпає відрізок днів, від давнього до нового. */
export function monthKeysOf(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(fromKey); m <= toKey; m = monthStart(m, 1)) {
    out.push(m.slice(0, 7));
  }
  return out;
}
