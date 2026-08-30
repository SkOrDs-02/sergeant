/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Плашка «залий документи» — коли людина перестала додавати те, що
 * додавала регулярно (спека
 * `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * AI-CONTEXT: тригер тут навмисно не календарний. Продукт не має розкладу
 * «нагадувати щомісяця» — він порівнює тишу з ВЛАСНИМ ритмом користувача.
 * Наслідок, який легко зламати рефактором: людина, яка тягне виписку раз
 * на три дні, не має бачити плашку ніколи, а людина без жодного імпорту
 * не має бачити її взагалі. Мовчання — це коректна відповідь функції, а
 * не відсутність фічі.
 *
 * AI-CONTEXT: запас фіксований (7 днів), а не множник від інтервалу.
 * Перша редакція спеки ставила `× 1.5` — це помилка масштабування: запас
 * відповідає на питання «наскільки пізно людина ще може бути, щоб це був
 * не пропуск», а відповідь на нього приблизно стала. Множник давав
 * тижневому імпортеру 3 дні запасу (замало) і місячному 15 (пів місяця
 * сліпоти). Не повертай множник.
 */

/** Орієнтир, коли імпорт був лише один і ритму ще не видно. */
export const IMPORT_REMINDER_DEFAULT_INTERVAL_DAYS = 30;

/** Скільки днів запізнення ще не вважається пропуском. */
export const IMPORT_REMINDER_GRACE_DAYS = 7;

/** Раніше цього не нагадуємо навіть при дуже щільному ритмі. */
export const IMPORT_REMINDER_MIN_DAYS = 10;

/** Кламп вивченого інтервалу — знизу. */
export const IMPORT_REMINDER_MIN_INTERVAL_DAYS = 7;

/** Кламп вивченого інтервалу — зверху. */
export const IMPORT_REMINDER_MAX_INTERVAL_DAYS = 45;

/** Тиша перших днів після реєстрації: FTUX і так щільний. */
export const IMPORT_REMINDER_FTUX_QUIET_DAYS = 14;

/** Скільки останніх імпортів беремо для медіани (дає до 4 інтервалів). */
export const IMPORT_REMINDER_HISTORY_SIZE = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ImportReminderSourceInput {
  /** Тип документа з `import_batches.source`. */
  readonly source: string;
  /** ISO-дати останніх успішних батчів; порядок не важливий. */
  readonly recentAt: readonly string[];
}

export interface ImportReminderSourcePrefs {
  /** ISO-дата, до якої плашка прихована кнопкою «Пізніше». */
  readonly snoozedUntil?: string | undefined;
  /** «Не нагадувати» — назавжди, знімається лише руками. */
  readonly muted?: boolean | undefined;
}

export type ImportReminderPrefs = Readonly<
  Record<string, ImportReminderSourcePrefs | undefined>
>;

export interface ImportReminderInput {
  readonly sources: readonly ImportReminderSourceInput[];
  readonly prefs?: ImportReminderPrefs | undefined;
  /** Поточний час. Передається явно, щоб функція лишалась чистою. */
  readonly now: Date;
  /**
   * Коли створено акаунт (ISO). Молодший за
   * {@link IMPORT_REMINDER_FTUX_QUIET_DAYS} — мовчимо. `null`/`undefined`
   * трактується як «давно», бо відсутність дати не привід нагадувати
   * менше, ніж треба.
   */
  readonly accountCreatedAt?: string | null | undefined;
  /** Відкритий незавершений драфт імпорту — мовчимо, він і так у роботі. */
  readonly hasOpenDraft?: boolean | undefined;
}

export interface ImportReminder {
  readonly source: string;
  /** Скільки повних днів від останнього імпорту цього типу. */
  readonly daysSince: number;
  /** Вивчений (або дефолтний) інтервал після клампа. */
  readonly expectedIntervalDays: number;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / MS_PER_DAY));
}

function parseMs(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function clampInterval(days: number): number {
  return Math.min(
    IMPORT_REMINDER_MAX_INTERVAL_DAYS,
    Math.max(IMPORT_REMINDER_MIN_INTERVAL_DAYS, days),
  );
}

/**
 * Верхня медіана відсортованого масиву. Верхня, а не середнє двох
 * середніх: середнє дало б дробове число днів, яке потім довелось би
 * округляти на кожному callsite. Тут потрібна стабільність, не точність
 * до годин.
 */
function upperMedian(sorted: readonly number[]): number {
  return sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? 0;
}

function isSilencedByPrefs(
  prefs: ImportReminderSourcePrefs | undefined,
  nowMs: number,
): boolean {
  if (!prefs) return false;
  if (prefs.muted === true) return true;
  if (!prefs.snoozedUntil) return false;
  const untilMs = parseMs(prefs.snoozedUntil);
  return untilMs !== null && untilMs > nowMs;
}

interface Candidate extends ImportReminder {
  /** На скільки днів перебрано поріг — за цим обираємо переможця. */
  readonly overdueBy: number;
}

function evaluateSource(
  input: ImportReminderSourceInput,
  nowMs: number,
): Candidate | null {
  const stamps = input.recentAt
    .map(parseMs)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => b - a)
    .slice(0, IMPORT_REMINDER_HISTORY_SIZE);

  const newest = stamps[0];
  if (newest === undefined) return null;

  const daysSince = daysBetween(newest, nowMs);

  // Інтервали між сусідніми імпортами. Нульові (два батчі одного дня —
  // виписка й скрін одразу) відкидаємо: вони не є ритмом, а якби
  // потрапили в медіану, то занизили б її до клампа знизу і зробили б
  // плашку значно агресивнішою, ніж людина заслуговує.
  const intervals: number[] = [];
  for (let i = 0; i < stamps.length - 1; i += 1) {
    const gap = daysBetween(stamps[i + 1]!, stamps[i]!);
    if (gap > 0) intervals.push(gap);
  }

  const expectedIntervalDays = clampInterval(
    intervals.length > 0
      ? upperMedian([...intervals].sort((a, b) => a - b))
      : IMPORT_REMINDER_DEFAULT_INTERVAL_DAYS,
  );

  const threshold = expectedIntervalDays + IMPORT_REMINDER_GRACE_DAYS;
  if (daysSince <= threshold) return null;
  if (daysSince < IMPORT_REMINDER_MIN_DAYS) return null;

  return {
    source: input.source,
    daysSince,
    expectedIntervalDays,
    overdueBy: daysSince - threshold,
  };
}

/**
 * Чи є привід просити людину залити документи, і про яке джерело.
 *
 * Повертає `null`, коли приводу немає — і це найчастіший результат за
 * задумом. Показуємо максимум одне джерело: виграє те, що перебрало свій
 * поріг найсильніше (за рівності — стабільно за назвою, щоб плашка не
 * стрибала між типами на кожному тіку годинника).
 */
export function evaluateImportReminder(
  input: ImportReminderInput,
): ImportReminder | null {
  const nowMs = input.now.getTime();
  if (Number.isNaN(nowMs)) return null;
  if (input.hasOpenDraft === true) return null;

  if (input.accountCreatedAt) {
    const createdMs = parseMs(input.accountCreatedAt);
    if (
      createdMs !== null &&
      daysBetween(createdMs, nowMs) < IMPORT_REMINDER_FTUX_QUIET_DAYS
    ) {
      return null;
    }
  }

  const winner = input.sources
    .filter((s) => !isSilencedByPrefs(input.prefs?.[s.source], nowMs))
    .map((s) => evaluateSource(s, nowMs))
    .filter((c): c is Candidate => c !== null)
    .sort(
      (a, b) => b.overdueBy - a.overdueBy || a.source.localeCompare(b.source),
    )[0];

  if (!winner) return null;

  return {
    source: winner.source,
    daysSince: winner.daysSince,
    expectedIntervalDays: winner.expectedIntervalDays,
  };
}

/**
 * До якої дати ховати плашку після «Пізніше»: половина звичного
 * інтервалу, але не менше тижня. Половина, а не повний інтервал: «пізніше»
 * означає «не зараз», а не «почни відлік спочатку».
 */
export function importReminderSnoozeUntil(
  expectedIntervalDays: number,
  now: Date,
): string {
  const days = Math.max(7, Math.round(expectedIntervalDays / 2));
  return new Date(now.getTime() + days * MS_PER_DAY).toISOString();
}
