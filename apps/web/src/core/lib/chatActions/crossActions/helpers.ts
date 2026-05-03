import { getWeekKey } from "../../../insights/useWeeklyDigest";

/**
 * Convert an ISO-8601 week label `YYYY-Www` (e.g. `2026-W17`) to the
 * `YYYY-MM-DD` of that week's Monday — the format `aggregate*` functions
 * expect. Also accepts a bare `YYYY-MM-DD` for resilience: when the model
 * "guesses" today's day key instead of the week key, we still do the right
 * thing by snapping to that week's Monday.
 *
 * Returns `null` if the input cannot be parsed.
 */
export function weekLabelToMondayKey(input: string): string | null {
  const wwwMatch = /^(\d{4})-W(\d{1,2})$/.exec(input.trim());
  if (wwwMatch) {
    const year = Number(wwwMatch[1]);
    const week = Number(wwwMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
    if (week < 1 || week > 53) return null;
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
    const target = new Date(week1Monday);
    target.setDate(week1Monday.getDate() + (week - 1) * 7);
    return [
      target.getFullYear(),
      String(target.getMonth() + 1).padStart(2, "0"),
      String(target.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (dayMatch) {
    const d = new Date(`${input.trim()}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return getWeekKey(d);
  }
  return null;
}

export function previousWeekKey(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  monday.setDate(monday.getDate() - 7);
  return [
    monday.getFullYear(),
    String(monday.getMonth() + 1).padStart(2, "0"),
    String(monday.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatWeekRangeLabel(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function diffLine(
  label: string,
  a: number,
  b: number,
  unit: string,
): string {
  const delta = a - b;
  const sign = delta > 0 ? "+" : "";
  return `${label}: ${a}${unit} vs ${b}${unit} (${sign}${delta}${unit})`;
}
