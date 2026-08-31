/**
 * Format a Date as `YYYY-MM-DD` in the **Europe/Kyiv** timezone.
 *
 * Це КИЇВСЬКА доба, не доба пристрою. За [ADR-0078](../../../../docs/04-governance/adr/0078-day-boundary-device-local.md)
 * межа розділена: Київ — для показу часу, серверних звітів і фінансових
 * періодів, а день-ключ відмітки звички, логу їжі й денного запису визначає
 * годинник ПРИСТРОЮ — там ця функція не підходить.
 */
export function toKyivISODate(d: Date | number | string = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "1970-01-01";
  // en-CA gives YYYY-MM-DD; `timeZone` forces Europe/Kyiv regardless of
  // the runtime environment (server UTC, browser in another tz, etc.).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(
    dt,
  );
}

/**
 * @deprecated Імʼя бреше: читається як «доба пристрою», хоча форсує
 * Europe/Kyiv. Використовуй {@link toKyivISODate}. Аліас лишено заради 150+
 * викликів по монорепо — прибрати після міграції call-сайтів.
 *
 * AI-LEGACY: expires 2026-11-07 — прибрати цей аліас і перевести залишкові
 * виклики на `toKyivISODate` напряму.
 */
export const toLocalISODate = toKyivISODate;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** UTC midnight (ms) of the calendar date named by a `YYYY-MM-DD` key. */
function dayKeyToUtcMidnight(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * The UTC instant (ms) when the Kyiv calendar day `dayKey` begins.
 *
 * Kyiv is UTC+2 (winter) or UTC+3 (summer); Ukraine switches at 03:00
 * local, so midnight always exists and carries the pre-transition offset.
 * Probes the +3 candidate first and falls back to +2 — no DST tables.
 */
export function kyivDayStartMs(dayKey: string): number {
  const utcMidnight = dayKeyToUtcMidnight(dayKey);
  const summer = utcMidnight - 3 * HOUR_MS;
  return toKyivISODate(summer) === dayKey ? summer : utcMidnight - 2 * HOUR_MS;
}

/**
 * The last millisecond of the Kyiv calendar day `dayKey` (23:59:59.999
 * Kyiv local). DST-safe: derived from the start of the *next* Kyiv day,
 * so 23- and 25-hour transition days resolve correctly.
 */
export function kyivDayEndMs(dayKey: string): number {
  // +26h from day start always lands inside the next Kyiv day, whatever
  // the current day's length (23/24/25h).
  const nextKey = toKyivISODate(kyivDayStartMs(dayKey) + 26 * HOUR_MS);
  return kyivDayStartMs(nextKey) - 1;
}

/**
 * Whole Kyiv **calendar days** between two instants (`a - b`), signed.
 *
 * Unlike `floor(elapsedMs / DAY)`, this counts midnights crossed in
 * Europe/Kyiv: an event yesterday at 23:00 is 1 day ago at 09:00 today,
 * even though only 10 hours elapsed. Domain invariant (AGENTS.md): day
 * boundaries are Kyiv local, never raw 24-hour windows.
 */
export function kyivCalendarDaysBetween(aMs: number, bMs: number): number {
  const a = dayKeyToUtcMidnight(toKyivISODate(aMs));
  const b = dayKeyToUtcMidnight(toKyivISODate(bMs));
  return Math.round((a - b) / DAY_MS);
}

const KYIV_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Kyiv",
  weekday: "short",
});

const MONDAY_FIRST_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * Start of the ISO week (Monday 00:00 **Europe/Kyiv**) containing the given
 * instant, as a Unix-epoch millisecond timestamp.
 *
 * Single source of truth for "this week" bucketing per the domain invariant
 * (AGENTS.md § Domain invariants): week boundaries are Kyiv-anchored and
 * Monday-first, never the runtime timezone. DST-safe — stepping back to
 * Monday goes through that day's local noon, which is immune to the ±1h
 * wobble of 23/25-hour DST days. Returns `NaN` for unparseable input.
 */
export function kyivMondayStartMs(
  d: Date | number | string = Date.now(),
): number {
  const ms = (d instanceof Date ? d : new Date(d)).getTime();
  if (Number.isNaN(ms)) return NaN;
  const dayStart = kyivDayStartMs(toKyivISODate(ms));
  const mondayIndex =
    MONDAY_FIRST_INDEX[KYIV_WEEKDAY_FORMATTER.format(ms)] ?? 0;
  if (mondayIndex === 0) return dayStart;
  const approxMondayNoon = dayStart - mondayIndex * DAY_MS + DAY_MS / 2;
  return kyivDayStartMs(toKyivISODate(approxMondayNoon));
}

/**
 * Format a Date as `YYYY-MM-DD` in the DEVICE's local timezone.
 *
 * За [ADR-0078](../../../../docs/04-governance/adr/0078-day-boundary-device-local.md)
 * день-ключ відмітки звички, логу їжі й денного запису визначає годинник
 * ПРИСТРОЮ, не Києва — на відміну від {@link toKyivISODate}. Канон для
 * восьми байт-ідентичних копій цього форматера
 * (`docs/90-work/audits/unification-modules.md` §2.1).
 */
export function deviceDayKey(d: Date | number = new Date()): string {
  const date = typeof d === "number" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Start of the ISO week (Monday 00:00, DEVICE local time) containing the
 * given instant, as a Unix-epoch millisecond timestamp.
 *
 * Пара до {@link kyivMondayStartMs}: та функція — для фінансів і звітів, ця —
 * для персональних сутностей (звички, тренування) за ADR-0078. Назви
 * навмисно розрізняють годинник (`docs/90-work/audits/unification-modules.md`
 * §1.2), інакше наступний виклик знову вибере навмання. Returns `NaN` for
 * unparseable input.
 */
export function deviceMondayStart(
  d: Date | number | string = Date.now(),
): number {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return NaN;
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}
