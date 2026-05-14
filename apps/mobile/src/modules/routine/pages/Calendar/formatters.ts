/**
 * Sergeant Routine — Calendar label formatters.
 *
 * Stateless helpers that turn raw date inputs into the UA-locale
 * strings the calendar UI displays. Extracted from the original
 * monolithic `Calendar.tsx` (P2.2b audit item) so they can be
 * unit-tested in isolation.
 */

import { parseDateKey } from "@sergeant/routine-domain";

import { MONTH_NAMES_UK } from "./constants";
import type { MonthCursor } from "./types";

/** Returns `"Травень 2026"`-style title for the month header. */
export function formatMonthTitle(c: MonthCursor): string {
  return `${MONTH_NAMES_UK[c.m]} ${c.y}`;
}

/**
 * Returns a UA locale day headline like
 * `"понеділок, 13 травня"`. Falls back to the raw key when the
 * date is unparseable so the UI never renders blank.
 */
export function formatDayHeadline(dateKey: string): string {
  try {
    return parseDateKey(dateKey).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return dateKey;
  }
}
