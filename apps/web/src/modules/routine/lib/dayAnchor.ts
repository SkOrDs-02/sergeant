/**
 * Last validated: 2026-09-01
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
 * **Cutover 2026-09-01 (продуктовий аудит LOG-3, founder-рішення):**
 * ROUTINE_DAY_ANCHOR перемкнуто `kyiv` → `device-local` за ADR-0078
 * (`docs/04-governance/adr/0078-day-boundary-device-local.md`). До цієї
 * дати web-routine був київський НАСКРІЗЬ, і саме тому досить було
 * перемкнути лише цей файл: `RoutineStatsPanel`, `HabitHeatmap`,
 * `HabitRangeGrid`, `HabitLeadersBlock`, `HabitDetailSheet`,
 * `useDayRollover`, `useTodoEveningInsight`, `useStreakRecordPendingInsight`,
 * `useRoutineQuickStatsWriter` усі читають «сьогодні» через
 * `anchoredTodayDate`/`anchoredTodayKey` (прямо чи через `RoutineApp.helpers.todayDate`)
 * — жодного з них не довелось чіпати окремо, крім трьох місць, де «сьогодні»
 * рахувалось Kyiv-хелпером НАПРЯМУ, в обхід цього файлу (перемкнуті тим
 * самим PR): `useDayRollover` (київська північ → девайсова), `HabitHeatmap`
 * (місячні мітки хітмапу рахувались через `getKyivDateParts` на вже
 * локально-побудованій даті — тепер просто локальні геттери),
 * `HabitLeadersBlock` (початок 30-денного вікна лідерів), `HabitDetailSheet`
 * (курсор місяця календаря) і `useTodoEveningInsight` (поріг «після 20:00» —
 * тепер 20:00 за годинником пристрою, не Києва).
 *
 * Реміндери (`useRoutineReminders`) НЕ перемкнуті цим PR: вони йдуть через
 * спільний Hub-механізм engagement (`useModuleReminder`, ADR-0067),
 * який ділять routine/fizruk/nutrition — зміна його доктрини часу зачепила
 * б інші модулі і виходить за межі цього PR.
 *
 * **Історія не переанкорюється (ADR-0078 §4).** Рядки, записані ДО
 * 2026-09-01, стоять із `day_anchor = 'kyiv'` (а рядки ДО 2026-08-24 — з
 * `day_anchor = 'device-local'`, хоча тодішній ключ був київський, див. git
 * history цього файлу) — жодного з цих станів не бекфілиться заднім числом.
 * Читачі журналу (стріки, heatmap, статистика) не звертаються до
 * `day_anchor` для розрахунків — вони довіряють уже записаному `date_key`
 * як є, тож мішана історія (частина рядків kyiv, частина device-local)
 * коректно читається без спеціальної гілки: колонка `day_anchor` — метадані
 * для майбутньої аналітики/міграції, а не вхід поточних агрегаторів.
 */
import { dateKeyFromDate } from "@sergeant/routine-domain";

/**
 * Значення для `routine_completion_events.day_anchor`. Словник колонки —
 * `device-local | kyiv | unknown`.
 */
export const ROUTINE_DAY_ANCHOR = "device-local";

/**
 * «Сьогодні» web-routine як `Date`, виставлений на локальний (пристрою)
 * полудень.
 *
 * Полудень тут не косметика: снапить дату на середину доби, щоб DST-зсув
 * годинника не перекинув її межу через північ під час подальшого
 * date-math (`addDays`/`dateKeyMinusDays` тощо, які теж снапляться на
 * 12:00 у `@sergeant/routine-domain`).
 */
export function anchoredTodayDate(): Date {
  // ADR-0078: межа доби routine — годинник ПРИСТРОЮ, а не Києва; це єдине
  // легітимне місце web-routine, де «сьогодні» читає host-local `new Date()`
  // і його рік/місяць/день напряму.
  // eslint-disable-next-line no-restricted-syntax -- див. коментар вище
  const now = new Date();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- див. коментар вище
  const year = now.getFullYear();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const month = now.getMonth();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const day = now.getDate();
  return new Date(year, month, day, 12, 0, 0, 0);
}

/** «Сьогодні» web-routine як `YYYY-MM-DD`. Анкер — `ROUTINE_DAY_ANCHOR`. */
export function anchoredTodayKey(): string {
  return dateKeyFromDate(anchoredTodayDate());
}
