/**
 * Last validated: 2026-08-24
 * Status: Active
 *
 * Єдине місце, де web-routine вирішує, ЗА ЯКИМ годинником рахується
 * «сьогодні» — і єдине місце, яке про це чесно звітує.
 *
 * AI-DANGER: `ROUTINE_DAY_ANCHOR` і `anchoredTodayKey()` мають рухатись
 * ЛИШЕ разом. `routine_completion_events.day_anchor` описує, ЯК саме
 * пораховано `date_key` сусідньої колонки (`device-local | kyiv |
 * unknown`, див. `085_routine_completion_events.sql`). Доти, доки
 * константа жила в адаптері окремо від генератора ключа, вона розійшлась
 * із ним і колонка почала брехати: адаптер писав `'device-local'`, а
 * ключ приходив київський. Тому анкер і генератор тепер в одному файлі —
 * перемкнути одне, не помітивши іншого, більше не вийде.
 *
 * **Чому саме `kyiv`, а не `device-local` за ADR-0078.** ADR-0078
 * (`docs/04-governance/adr/0078-day-boundary-device-local.md`) визначає
 * device-local цільовою доктриною для особистого дня, і саме туди цей
 * модуль має приїхати. Але web-routine київський НАСКРІЗЬ — не лише в
 * записі: `RoutineStatsPanel`, `HabitHeatmap`, `HabitRangeGrid`,
 * `HabitLeadersBlock`, `useDayRollover`, `useRoutineReminders`,
 * `useTodoEveningInsight`, `useStreakRecordPendingInsight`,
 * `useRoutineQuickStatsWriter` однаково читають київське «сьогодні».
 * Перемкнути ОДИН лише шлях запису означало б писати відмітку під
 * девайсовий день, а малювати її проти київського — галочка просто не
 * засвітилась би. Тож поки перемикається все разом (окремий крок,
 * W1-TIME-DOCTRINE), колонка мусить казати правду про поточний стан:
 * ключ київський — анкер `kyiv`.
 *
 * Слід за собою: рядки, записані ДО 2026-08-24, стоять із
 * `day_anchor = 'device-local'`, хоча ключ у них київський. Бекфіл тих
 * рядків — окремий пункт, тут його не зробити.
 */
import { dateKeyFromDate } from "@sergeant/routine-domain";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";

/**
 * Значення для `routine_completion_events.day_anchor`. Словник колонки —
 * `device-local | kyiv | unknown`.
 */
export const ROUTINE_DAY_ANCHOR = "kyiv";

/**
 * «Сьогодні» web-routine як `Date`, чиї ЛОКАЛЬНІ year/month/day збігаються
 * з київськими, виставлений на локальний полудень.
 *
 * Полудень тут не косметика: `dateKeyFromDate` за контрактом
 * `routine-domain` читає локальні геттери, тож у пристрою поза Києвом
 * лише опівденний якір гарантує, що вони повернуть саме київську дату.
 */
export function anchoredTodayDate(): Date {
  const { year, month, day } = getKyivDateParts();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** «Сьогодні» web-routine як `YYYY-MM-DD`. Анкер — `ROUTINE_DAY_ANCHOR`. */
export function anchoredTodayKey(): string {
  return dateKeyFromDate(anchoredTodayDate());
}
