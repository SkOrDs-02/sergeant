/**
 * Shared time-of-day greeting and Kyiv-local date formatter.
 *
 * Extracted from HubHeader so module pages (Fizruk dashboard, etc.)
 * can display the same greeting bucket and nominative date without
 * duplicating the Kyiv-anchor logic.
 *
 * Last validated: 2026-06-12
 * Status: Active
 */

import { getKyivDateParts } from "./kyivTime";

const GREETINGS = {
  morning: "Доброго ранку",
  afternoon: "Доброго дня",
  evening: "Доброго вечора",
  night: "Доброї ночі",
} as const;

export type TimeOfDay = keyof typeof GREETINGS;

/**
 * Returns the time-of-day bucket based on the Kyiv-local hour.
 * Thresholds: night 22–5, morning 5–12, afternoon 12–17, evening 17–22.
 */
export function getKyivTimeOfDay(): TimeOfDay {
  const { hour: h } = getKyivDateParts();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

/**
 * Returns the greeting string for the current Kyiv-local time of day.
 */
export function getKyivGreeting(): string {
  return GREETINGS[getKyivTimeOfDay()];
}

/**
 * Formats today's Kyiv-local date as a nominative, capitalized weekday +
 * day + month string, e.g. "Пʼятниця, 12 червня".
 *
 * Uses the same technique as HubHeader: reconstruct a UTC instant at
 * Kyiv midday so Intl formats the correct calendar date regardless of
 * the host timezone, then formats weekday and day/month separately so
 * the weekday arrives in nominative case (Ukrainian `Intl` returns
 * nominative when formatting weekday-only without the full date context
 * that triggers accusative agreement).
 */
export function formatKyivNominativeDate(): string {
  const { year, month, day } = getKyivDateParts();
  try {
    const inst = new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
    const weekdayStr = inst.toLocaleDateString("uk-UA", {
      weekday: "long",
      timeZone: "Europe/Kyiv",
    });
    const rest = inst.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Kyiv",
    });
    return `${weekdayStr.charAt(0).toUpperCase()}${weekdayStr.slice(1)}, ${rest}`;
  } catch {
    return "";
  }
}
