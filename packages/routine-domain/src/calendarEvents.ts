/**
 * Pure Hub-calendar event builder.
 *
 * Aggregates routine habits (and optionally Fizruk plan entries +
 * Finyk subscription charges) into a flat list of `HubCalendarEvent`s
 * for rendering. All storage I/O is pushed to the caller — this module
 * is DOM-/RN-/browser-free and works under Node, jsdom, or RN runtimes.
 *
 * Extracted from `apps/web/src/modules/routine/lib/hubCalendarAggregate.ts`
 * and `finykSubscriptionCalendar.ts` (Phase 5 / PR 2). The web wrappers
 * now inject their localStorage-backed readers when calling these.
 */

import { enumerateDateKeys, parseDateKey } from "./dateKeys.js";
import { habitScheduledOnDate } from "./schedule.js";
import {
  isFlexibleHabit,
  weekDoneCountExcludingDate,
  weeklyTargetForDate,
} from "./weeklyTarget.js";
import { sortHabitsByOrder } from "./habitOrder.js";
import { completionNoteKey } from "./completionNoteKey.js";
import type {
  CalendarRange,
  Habit,
  HubCalendarEvent,
  RoutineState,
} from "./types.js";

/**
 * Підпис події звички. Для гнучкої звички несе прогрес тижня: без нього
 * «Звичка» в списку не відповідає на єдине питання, яке в цьому режимі має
 * сенс — скільки ще лишилось.
 *
 * Показане число ВКЛЮЧАЄ цей день, якщо його відмічено: людина читає «2 з 3»
 * як «вже двічі». Гейт видимості натомість рахує без нього, і це навмисна
 * різниця — див. докстрінг `weekDoneCountExcludingDate`.
 */
function habitSubtitle(
  habit: Habit,
  dateKey: string,
  completed: boolean,
  timePart: string,
  weekDoneCount: number | undefined,
): string {
  const base = completed ? `Зроблено${timePart}` : `Звичка${timePart}`;
  if (weekDoneCount === undefined) return base;
  const done = weekDoneCount + (completed ? 1 : 0);
  return `${base} · ${done} з ${weeklyTargetForDate(habit, dateKey)}`;
}

/**
 * Число з розрядами під uk-UA. Дублює `formatNumberUk` із `@sergeant/shared`
 * (U+00A0 замість вузького U+202F, який Intl дає для цієї локалі й який майже
 * не видно). Саме дублює, а не імпортує: цей пакет навмисно тримається без
 * рантайм-залежностей, і одне форматування суми того не варте.
 */
function formatGroupedUk(value: number): string {
  return value
    .toLocaleString("uk-UA", { maximumFractionDigits: 2 })
    .replace(/\u202f/g, "\u00a0");
}

export const FIZRUK_GROUP_LABEL = "Фізрук";
export const FINYK_SUB_GROUP_LABEL = "Фінік · підписки";

export interface FizrukPlanDay {
  templateId?: string;
}

export interface FinykSubscriptionLike {
  id: string;
  name?: string;
  emoji?: string;
  billingDay: number | string;
  /** Optional fields used by the amount-lookup in the web adapter. */
  linkedTxId?: string;
  keyword?: string;
  currency?: string;
}

export interface FinykSubscriptionAmountLookup {
  (sub: FinykSubscriptionLike): {
    amount: number | null | undefined;
    currency?: string;
  };
}

export interface BuildHubCalendarEventsDeps {
  /** Опціонально: Fizruk-план на місяць (dateKey → { templateId }). */
  fizrukPlanDays?: Record<string, FizrukPlanDay> | undefined;
  /** Опціонально: templateId → назва шаблону. */
  fizrukTemplateNames?: Map<string, string> | undefined;
  /** Опціонально: події підписок Фініка (побудовані заздалегідь). */
  finykSubscriptionEvents?: HubCalendarEvent[] | undefined;
}

export interface BuildHubCalendarEventsOptions {
  showFizruk?: boolean;
  showFinykSubs?: boolean;
}

function tagLabelsForHabit(
  state: RoutineState,
  habit: RoutineState["habits"][number],
): string[] {
  const ids = habit.tagIds || [];
  const labels = ids
    .map((id) => state.tags.find((t) => t.id === id)?.name)
    .filter((x): x is string => Boolean(x));
  if (habit.categoryId) {
    const c = state.categories.find((x) => x.id === habit.categoryId);
    if (c?.name) labels.push(c.name);
  }
  return labels.length ? labels : ["Без тегу"];
}

/**
 * Pure aggregator. Produces a flat, sorted list of hub-calendar events
 * for the given date range from `state` plus any injected Fizruk /
 * Finyk decorators.
 */
export function buildHubCalendarEvents(
  state: RoutineState,
  range: CalendarRange,
  options: BuildHubCalendarEventsOptions = {},
  deps: BuildHubCalendarEventsDeps = {},
): HubCalendarEvent[] {
  const { showFizruk = true, showFinykSubs = true } = options;
  const {
    fizrukPlanDays = {},
    fizrukTemplateNames,
    finykSubscriptionEvents,
  } = deps;

  const events: HubCalendarEvent[] = [];
  const { startKey, endKey } = range;
  const days = enumerateDateKeys(startKey, endKey);

  if (showFizruk) {
    for (const date of days) {
      const tid = fizrukPlanDays[date]?.templateId;
      if (!tid) continue;
      const title = fizrukTemplateNames?.get(tid) || "Тренування за планом";
      events.push({
        id: `fizruk_${date}_${tid}`,
        source: "fizruk_plan",
        date,
        title,
        subtitle: "План Фізрука",
        tagLabels: [FIZRUK_GROUP_LABEL],
        sortKey: `${date} 0 fizruk`,
        fizruk: true,
        sourceKind: "fizruk",
      });
    }
  }

  const notes =
    state.completionNotes && typeof state.completionNotes === "object"
      ? state.completionNotes
      : {};
  const activeHabits = sortHabitsByOrder(
    state.habits.filter((h) => !h.archived),
    state.habitOrder || [],
  );
  for (const date of days) {
    for (const h of activeHabits) {
      const completions = state.completions[h.id] || [];
      // Гнучка звичка зникає зі списку, щойно тиждень добрано. Лічильник
      // виключає сам цей день — інакше закритий тиждень 3/3 стер би з
      // календаря всі три відмітки (див. докстрінг у `weeklyTarget.ts`).
      const weekDoneCount = isFlexibleHabit(h)
        ? weekDoneCountExcludingDate(completions, date)
        : undefined;
      if (!habitScheduledOnDate(h, date, { weekDoneCount })) continue;
      const completed = completions.includes(date);
      const tagLabels = tagLabelsForHabit(state, h);
      const t = h.timeOfDay ? String(h.timeOfDay).trim() : "";
      const timePart = t ? ` · ${t}` : "";
      const nk = completionNoteKey(h.id, date);
      const note = notes[nk] ? String(notes[nk]) : "";
      events.push({
        id: `habit_${h.id}_${date}`,
        source: "routine_habit",
        date,
        // Гліф звички НЕ префіксує заголовок — той самий фікс, що вже
        // застосований до нагадувань (`reminders.ts`, 2026-08-03): у полі
        // `emoji` з того дня лежить icon-slug із `glyphs.ts`, а не емодзі,
        // тож склейка давала видимий «check Ранкова зарядка» у стрічці й у
        // `aria-label` кнопки «Деталі» (аудит 2026-08-04, знахідка 12).
        // Іконку малює UI (`HabitGlyph`), подія несе саму назву.
        title: h.name,
        subtitle: habitSubtitle(h, date, completed, timePart, weekDoneCount),
        tagLabels,
        sortKey: `${date} 1 ${h.name}`,
        habitId: h.id,
        completed,
        note,
        sourceKind: "habit",
        timeOfDay: t,
      });
    }
  }

  if (
    showFinykSubs &&
    state.prefs?.showFinykSubscriptionsInCalendar !== false &&
    finykSubscriptionEvents
  ) {
    events.push(...finykSubscriptionEvents);
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "uk"));
  return events;
}

/** Підрахунок кількості подій по днях — для month-heatmap dots. */
export function countEventsByDate(
  events: HubCalendarEvent[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) {
    map.set(e.date, (map.get(e.date) || 0) + 1);
  }
  return map;
}

// ── Finyk subscription calendar — pure ────────────────────────────────

function scheduledBillingDom(
  year: number,
  monthIndex: number,
  billingDay: number,
): number {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Number(billingDay) || 1, dim);
}

function isBillingDateKey(dateKey: string, billingDay: number): boolean {
  const d = parseDateKey(dateKey);
  const dom = scheduledBillingDom(d.getFullYear(), d.getMonth(), billingDay);
  return d.getDate() === dom;
}

/**
 * Pure builder for Finyk subscription events in the Hub calendar.
 * Takes the subscription list and an amount-lookup (usually wrapping
 * the Monobank transaction cache) from the caller.
 */
export function buildFinykSubscriptionEvents(
  range: CalendarRange,
  subs: FinykSubscriptionLike[],
  getAmount: FinykSubscriptionAmountLookup,
): HubCalendarEvent[] {
  const { startKey, endKey } = range;
  const days = enumerateDateKeys(startKey, endKey);
  const out: HubCalendarEvent[] = [];

  for (const sub of subs) {
    const bd = Number(sub.billingDay);
    if (!Number.isFinite(bd) || bd < 1 || bd > 31) continue;
    const { amount, currency } = getAmount(sub);
    // До 2026-08-21 сюди клеївся `sub.emoji` (з дефолтом «📱»). Поле не
    // редагується користувачем — форма підписки не має для нього вводу, —
    // тож це був хардкод емодзі в даних. Назви достатньо.
    const subTitle = sub.name || "Підписка";
    for (const date of days) {
      if (!isBillingDateKey(date, bd)) continue;
      const amtStr =
        amount != null
          ? `~${formatGroupedUk(amount)} ${currency ?? ""}`.trim()
          : "сума з транзакції або вручну у Фініку";
      out.push({
        id: `finyk_sub_${sub.id}_${date}`,
        source: "finyk_subscription",
        date,
        title: subTitle,
        subtitle: `Планове списання · ${amtStr}`,
        tagLabels: [FINYK_SUB_GROUP_LABEL],
        sortKey: `${date} 0b finyk_${sub.id}`,
        fizruk: false,
        finykSub: true,
        sourceKind: "finyk_sub",
      });
    }
  }
  return out;
}
