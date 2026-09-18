/**
 * Sergeant Finyk — TransactionsPage pure helpers.
 *
 * Date / month formatters and the day-collapse persistence read/write
 * primitives. Pure functions so they can be unit-tested in isolation
 * and reused across the hook + view layer of the screen.
 */
import { safeReadLS } from "@/lib/storage";

import { DAY_COLLAPSE_KEY, type DayCollapseMap } from "./types";

export function readDayCollapse(): DayCollapseMap {
  const v = safeReadLS<DayCollapseMap | null>(DAY_COLLAPSE_KEY, null);
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return {};
}

export function isDayExpanded(
  overrides: DayCollapseMap,
  key: string,
  todayKey: string,
): boolean {
  const o = overrides[key];
  return o === undefined ? key === todayKey : !!o;
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });
}

export function getMonthBounds(
  year: number,
  month: number,
): { start: number; end: number } {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return { start, end };
}

export function dayKeyFromTime(timeSec: number): string {
  const d = new Date(timeSec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDayLabel(key: string, now: Date): string {
  const [y, m, da] = key.split("-").map(Number);
  const d = new Date(y!, (m ?? 1) - 1, da);
  const t0 = new Date(now);
  t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t0.getTime() - d0.getTime()) / 86400000);
  if (diffDays === 0) return "Сьогодні";
  if (diffDays === 1) return "Вчора";
  return d.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
