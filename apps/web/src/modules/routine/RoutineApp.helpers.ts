/**
 * Pure helpers for the RoutineApp composition root.
 *
 * Split out as part of the Phase 2 decomposition (initiative 0001) so
 * the composition root in `RoutineApp.tsx` stays under the 600-LOC
 * lint guard. Nothing here depends on React — these are date math,
 * grouping, and constant utilities that can be unit-tested without
 * mounting a component tree.
 *
 * The calendar-grid math (`monthBounds`/`monthGrid`/`timeOfDayBucket`/
 * `groupEventsForList`/`HABIT_TIME_GROUPS`/`GROUP_ORDER`) is a re-export of
 * `@sergeant/routine-domain`'s `calendarGrid.ts` — that copy is also
 * consumed by `apps/mobile`, and the two used to drift byte-for-byte
 * (unification audit 2026-08-31, finding 2.4). `todayDate` stays local and
 * is NOT re-exported from the package: historically it was the one function
 * web and mobile deliberately disagreed on (web read Kyiv via
 * `lib/dayAnchor.ts`, mobile/package read device-local). Since the
 * 2026-09-01 cutover (LOG-3, ADR-0078) both compute the same device-local
 * "today" — the split stays only because `lib/dayAnchor.ts` must remain the
 * single place pairing the key generator with `ROUTINE_DAY_ANCHOR` (див.
 * застереження в його докстрінгу).
 */

import { anchoredTodayDate } from "./lib/dayAnchor";
import {
  GROUP_ORDER,
  HABIT_TIME_GROUPS,
  groupEventsForList,
  monthBounds,
  monthGrid,
  timeOfDayBucket,
  type CalendarRange,
} from "@sergeant/routine-domain";

export {
  GROUP_ORDER,
  HABIT_TIME_GROUPS,
  groupEventsForList,
  monthBounds,
  monthGrid,
  timeOfDayBucket,
};
export type DateRange = CalendarRange;

export interface MonthCursor {
  y: number;
  m: number;
}

export const FIZRUK_PLAN_SYNC = "fizruk-storage-monthly-plan";

export function todayDate(): Date {
  // Делегат: анкер доби web-routine живе в одному місці разом зі своєю
  // міткою `ROUTINE_DAY_ANCHOR` (`lib/dayAnchor.ts`) — інакше журнал
  // відміток знову почне звітувати не той анкер, яким порахований ключ.
  return anchoredTodayDate();
}
