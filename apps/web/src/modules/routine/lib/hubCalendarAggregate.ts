import { safeReadLS } from "@shared/lib/storage/storage";
import {
  MONTHLY_PLAN_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY,
} from "@sergeant/fizruk-domain";
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

export function loadMonthlyPlanDays() {
  const p = safeReadLS<{ days?: Record<string, { templateId?: string }> }>(
    MONTHLY_PLAN_STORAGE_KEY,
    {},
  );
  return typeof p?.days === "object" && p.days ? p.days : {};
}

export function loadTemplateNameById() {
  const map = new Map<string, string>();
  const arr = safeReadLS<Array<{ id?: string; name?: string }>>(
    TEMPLATES_STORAGE_KEY,
    [],
  );
  if (Array.isArray(arr)) {
    for (const t of arr) {
      if (t?.id && t?.name) map.set(t.id, String(t.name));
    }
  }
  return map;
}

/**
 * Тонкий web-адаптер над pure `buildHubCalendarEvents` з
 * `@sergeant/routine-domain`: підтягує з localStorage Fizruk-план,
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
