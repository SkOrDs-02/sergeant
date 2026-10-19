import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  dateKeyFromDate,
  enumerateDateKeys,
  habitScheduledOnDate,
  parseDateKey,
  buildHubCalendarEvents as buildHubCalendarEventsPure,
  countEventsByDate,
  FIZRUK_GROUP_LABEL,
  type BuildHubCalendarEventsOptions,
  type CalendarRange,
  type HubCalendarEvent,
  type RoutineState,
} from "@sergeant/routine-domain";
import { buildFinykSubscriptionEvents } from "./finykSubscriptionCalendar";

// Re-export pure helpers under their historical names so the web
// call-sites that `import { dateKeyFromDate } from "./hubCalendarAggregate"`
// keep compiling unchanged after the Phase 5 / PR 2 extraction.
export {
  dateKeyFromDate,
  parseDateKey,
  enumerateDateKeys,
  habitScheduledOnDate,
  countEventsByDate,
  FIZRUK_GROUP_LABEL,
};

// Писачі Фізрука (useMonthlyPlan, useWorkoutTemplates) пишуть лише в SQLite
// через dual-write, LS-дзеркала прибрані (teardown Phase 3), тож читаємо
// знімок із SQLite-кешу. Порожній (ще не прогрітий) кеш дає порожній план;
// календар перемальовується по `useFizrukSqliteReadTick` (див.
// `useRoutineDerivedData`).
export function loadMonthlyPlanDays(): Record<string, { templateId?: string }> {
  const days = getCachedFizrukSqliteState().monthlyPlan?.days;
  return typeof days === "object" && days ? days : {};
}

export function loadTemplateNameById() {
  const map = new Map<string, string>();
  for (const t of getCachedFizrukSqliteState().workoutTemplates) {
    if (t?.id && t?.name) map.set(t.id, String(t.name));
  }
  return map;
}

/**
 * Тонкий web-адаптер над pure `buildHubCalendarEvents` з
 * `@sergeant/routine-domain`: підтягує з SQLite-кешу Fizruk-план,
 * імена шаблонів тренувань і події підписок Фініка, решту роботи
 * робить pure-builder.
 */
export function buildHubCalendarEvents(
  state: RoutineState,
  range: CalendarRange,
  {
    showFizruk = true,
    showFinykSubs = true,
  }: BuildHubCalendarEventsOptions = {},
): HubCalendarEvent[] {
  const fizrukPlanDays = showFizruk ? loadMonthlyPlanDays() : undefined;
  const fizrukTemplateNames = showFizruk ? loadTemplateNameById() : undefined;
  const finykSubscriptionEvents =
    showFinykSubs && state.prefs?.showFinykSubscriptionsInCalendar !== false
      ? buildFinykSubscriptionEvents(range)
      : undefined;
  return buildHubCalendarEventsPure(
    state,
    range,
    { showFizruk, showFinykSubs },
    { fizrukPlanDays, fizrukTemplateNames, finykSubscriptionEvents },
  );
}
