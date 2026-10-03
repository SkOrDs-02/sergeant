/**
 * Pure "next planned session" resolver for the Fizruk Dashboard.
 *
 * Walks the monthly-plan state forward from today up to
 * `lookaheadDays` and returns the first date whose `templateId` is
 * known in the supplied templates catalogue. Returns `null` when no
 * template is scheduled in the window.
 *
 * The resolver is clock-aware via a `now` seam so tests can freeze
 * time (`new Date("2026-04-20T12:00:00Z")`) without stubbing globals.
 */

import {
  dateKeyFromDate,
  parseDateKey,
  todayDateKey,
} from "../plan/calendar.js";
import { getTemplateForDate } from "../plan/selectors.js";
import type { MonthlyPlanState } from "../plan/types.js";

import type { DashboardNextSession, DashboardTemplateLike } from "./types.js";

/** Default scan window. Two weeks covers any reasonable "what's next" slot. */
export const DEFAULT_LOOKAHEAD_DAYS = 14;

export interface GetNextPlanSessionOptions {
  readonly plan: MonthlyPlanState;
  readonly templatesById: readonly DashboardTemplateLike[];
  readonly now?: Date;
  readonly lookaheadDays?: number;
}

function resolveTemplate(
  id: string,
  catalogue: readonly DashboardTemplateLike[],
): DashboardTemplateLike | null {
  if (!id) return null;
  return catalogue.find((t) => t?.id === id) ?? null;
}

/**
 * First date in `[today, today + lookaheadDays]` that has a template
 * assigned in `plan.days`. When `plan` has a template for today, the
 * resolver short-circuits and returns today.
 *
 * The returned `exerciseCount` is `null` when the template id is
 * scheduled but the catalogue does not know about it (e.g. template
 * was deleted after being scheduled) — callers can still surface the
 * date + name and fall back gracefully.
 */
export function getNextPlanSession(
  options: GetNextPlanSessionOptions,
): DashboardNextSession | null {
  const {
    plan,
    templatesById,
    now = new Date(),
    lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
  } = options;

  if (!plan || lookaheadDays < 0) return null;

  const todayKey = todayDateKey(now);
  const todayBase = parseDateKey(todayKey);

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const probe = new Date(todayBase);
    probe.setDate(probe.getDate() + offset);
    const dateKey = dateKeyFromDate(probe);
    const templateId = getTemplateForDate(plan, dateKey);
    if (!templateId) continue;

    const tpl = resolveTemplate(templateId, templatesById);
    const name =
      tpl && typeof tpl.name === "string" && tpl.name.trim().length > 0
        ? tpl.name
        : "Тренування";
    const exerciseCount = tpl?.exerciseIds
      ? tpl.exerciseIds.length
      : tpl
        ? 0
        : null;

    return {
      dateKey,
      daysFromNow: offset,
      isToday: offset === 0,
      templateId,
      templateName: name,
      exerciseCount,
    };
  }

  return null;
}
