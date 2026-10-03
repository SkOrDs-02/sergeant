/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Людські підписи для день-ключів `YYYY-MM-DD` у текстах чату.
 *
 * WHY. Виконавці інструментів (`chatActions/query*`) віддають ISO-рядки прямо
 * в текст, який бачить користувач: «Прийомів їжі за 2026-08-06 — 2026-08-06 не
 * знайдено», «Дні без жодного виконання: 2026-08-06, 2026-08-05, …». Це не
 * лише негарно — у картці `DataResultCard` такий список ще й найдовше
 * значення, тобто саме він ламав верстку.
 *
 * AI-DANGER: НЕ парсимо через `new Date(dayKey)`. День-ключ — це календарна
 * дата без часу, а `new Date("2026-08-06")` дає UTC-північ, яку будь-який
 * відʼємний зсув пересуває на попередній день. Класичний off-by-one, через
 * який «сьогодні» стає «вчора» на пів планети. Розбираємо покомпонентно —
 * жодного часового поясу тут не потрібно й не має бути.
 */

const MONTHS_SHORT_UK = [
  "січ",
  "лют",
  "бер",
  "кві",
  "тра",
  "чер",
  "лип",
  "серп",
  "вер",
  "жов",
  "лис",
  "гру",
] as const;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DayParts {
  year: number;
  month: number;
  day: number;
}

function parseDayKey(dayKey: string): DayParts | null {
  const m = DAY_KEY_RE.exec(dayKey);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Різниця в календарних днях `a − b`; обидва ключі вже провалідовані. */
function daysBetween(a: DayParts, b: DayParts): number {
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msA - msB) / 86_400_000);
}

export interface DayKeyLabelOptions {
  /** Сьогоднішній день-ключ. Без нього «сьогодні»/«вчора» не вживаються. */
  todayKey?: string | undefined;
  /** Дозволити відносні підписи. Вимикай там, де потрібна саме дата. */
  relative?: boolean;
}

/**
 * `2026-08-06` → `сьогодні` / `вчора` / `6 серп` / `6 серп 2025`.
 *
 * Рік дописується лише коли він відрізняється від року `todayKey` (або коли
 * `todayKey` не передали) — інакше кожен рядок тягне зайві пʼять символів у
 * вузьку картку без жодної нової інформації.
 *
 * Нерозпізнаний вхід повертається як є: краще показати сирий рядок, ніж
 * підмінити його вигаданою датою.
 */
export function formatDayKeyUk(
  dayKey: string,
  options: DayKeyLabelOptions = {},
): string {
  const parts = parseDayKey(dayKey);
  if (!parts) return dayKey;

  const { todayKey, relative = true } = options;
  const today = todayKey ? parseDayKey(todayKey) : null;

  if (relative && today) {
    const diff = daysBetween(parts, today);
    if (diff === 0) return "сьогодні";
    if (diff === -1) return "вчора";
    if (diff === 1) return "завтра";
  }

  const month = MONTHS_SHORT_UK[parts.month - 1] ?? "";
  const base = `${parts.day} ${month}`;
  return !today || today.year !== parts.year ? `${base} ${parts.year}` : base;
}

/**
 * Діапазон двох день-ключів одним підписом.
 *
 * Однаковий from/to — це один день, і писати «за 6 серп — 6 серп» безглуздо:
 * саме так виглядав рядок «Прийомів їжі за 2026-08-06 — 2026-08-06 не
 * знайдено» на скріні.
 */
export function formatDayRangeUk(
  from: string,
  to: string,
  options: DayKeyLabelOptions = {},
): string {
  if (from === to) return formatDayKeyUk(from, options);

  const a = parseDayKey(from);
  const b = parseDayKey(to);
  if (!a || !b) return `${from} – ${to}`;

  // Той самий місяць і рік — місяць пишемо один раз: «1–6 серп».
  if (a.year === b.year && a.month === b.month) {
    const suffix = formatDayKeyUk(to, { ...options, relative: false });
    return `${a.day}–${suffix}`;
  }
  const left = formatDayKeyUk(from, { ...options, relative: false });
  const right = formatDayKeyUk(to, { ...options, relative: false });
  return `${left} – ${right}`;
}
