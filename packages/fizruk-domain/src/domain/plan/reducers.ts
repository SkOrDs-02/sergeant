/**
 * Pure reducers for `MonthlyPlanState` mutations.
 *
 * All reducers are structurally-stable: if the mutation would be a
 * no-op they return the *same* state reference so React hooks can
 * short-circuit the persist round-trip.
 */

import type { MonthlyPlanState } from "./types.js";

/** Set (or clear, when `templateId` is `null`/`""`) the template for a date. */
export function applySetDayTemplate(
  state: MonthlyPlanState,
  dateKey: string,
  templateId: string | null | undefined,
): MonthlyPlanState {
  const cleared = templateId == null || templateId === "";
  const existing = state.days[dateKey];

  if (cleared) {
    if (!existing) return state;
    const nextDays = { ...state.days };
    delete nextDays[dateKey];
    return { ...state, days: nextDays };
  }

  if (existing && existing.templateId === templateId) return state;
  return {
    ...state,
    days: { ...state.days, [dateKey]: { templateId } },
  };
}

/** Update reminder time (hour / minute). Clamps out-of-range values. */
export function applySetReminder(
  state: MonthlyPlanState,
  hour: number,
  minute: number,
): MonthlyPlanState {
  const nextHour = Math.max(0, Math.min(23, Math.trunc(hour)));
  const nextMinute = Math.max(0, Math.min(59, Math.trunc(minute)));
  if (state.reminderHour === nextHour && state.reminderMinute === nextMinute) {
    return state;
  }
  return { ...state, reminderHour: nextHour, reminderMinute: nextMinute };
}

/** Toggle the reminder on/off. Coerces truthy/falsy values to a bool. */
export function applySetReminderEnabled(
  state: MonthlyPlanState,
  enabled: boolean,
): MonthlyPlanState {
  const next = !!enabled;
  if (state.reminderEnabled === next) return state;
  return { ...state, reminderEnabled: next };
}
