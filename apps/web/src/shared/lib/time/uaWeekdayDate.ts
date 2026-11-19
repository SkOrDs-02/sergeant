/**
 * Last validated: 2026-09-02
 * Status: Active
 *
 * Дата з назвою дня тижня в НАЗИВНОМУ відмінку: «середа, 2 вересня».
 *
 * WHY. `toLocaleDateString("uk-UA", { weekday: "long", day: "numeric",
 * month: "long" })` повертає різне в різних рушіях: Node віддає «середа»,
 * а Chromium — «середу». Тобто помилку видно тільки в браузері, а юніт-тести
 * в Node чи jsdom її не ловлять у принципі. Саме так «середу, 2 вересня»
 * доїхало до геро-блока Рутини й до ранкового брифінгу.
 *
 * Причина в CLDR: для української там дві форми назви дня — `format`
 * (відмінювана, під шаблон «у середу») і `stand-alone` (називний). Коли в
 * опціях є ще й день з місяцем, ICU вважає, що будує фразу, і бере
 * відмінювану форму. Коли просимо САМ день тижня — віддає називну.
 *
 * Звідси прийом: форматуємо день тижня окремо, дату окремо, склеюємо самі.
 * Місяць у родовому («вересня») стабільний в обох рушіях, тож його чіпати
 * не треба. Той самий прийом уже стояв у двох місцях —
 * `finyk/pages/transactions/transactionsLib.ts` (власний масив назв) і
 * `shared/lib/time/greeting.ts` (`formatKyivNominativeDate`), — але не був
 * зведений в один хелпер, тож решта call-site-ів лишалась із помилкою.
 *
 * AI-DANGER: не «спрощуй» це назад в один `toLocaleDateString` з повним
 * набором опцій. Воно виглядатиме правильно в тестах і буде хибним на екрані.
 */

export interface UaWeekdayDateOptions {
  /** IANA-зона для форматування. Без неї — локальна зона пристрою. */
  timeZone?: string | undefined;
  /** Дописати рік («середа, 2 вересня 2026 р.»). За замовчуванням ні. */
  withYear?: boolean;
  /** Велика перша літера. За замовчуванням ні. */
  capitalize?: boolean;
}

/**
 * `new Date(2026, 8, 2)` → `середа, 2 вересня`.
 *
 * Порожній рядок на невалідній даті: підпис із «Invalid Date» гірший за
 * відсутній.
 */
export function formatUaWeekdayDate(
  date: Date,
  options: UaWeekdayDateOptions = {},
): string {
  if (Number.isNaN(date.getTime())) return "";
  const { timeZone, withYear = false, capitalize = false } = options;
  try {
    const weekday = new Intl.DateTimeFormat("uk-UA", {
      weekday: "long",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
    const rest = new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" as const } : {}),
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
    const label = `${weekday}, ${rest}`;
    if (!capitalize) return label;
    const [first] = label;
    return first
      ? `${first.toLocaleUpperCase("uk-UA")}${label.slice(first.length)}`
      : label;
  } catch {
    return "";
  }
}

// 2024-01-01 — понеділок: від нього рахуємо день тижня за індексом.
const WEEKDAY_NAME_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  weekday: "long",
  timeZone: "UTC",
});

/**
 * Назва дня тижня в називному відмінку за індексом від понеділка
 * (`0` → «понеділок», `6` → «неділя»). Окремий виклик лише з `weekday`, без
 * решти полів дати, тому відмінок не псується (див. WHY у шапці файла).
 * Індекс поза 0..6 загортається по модулю 7.
 */
export function uaWeekdayName(mondayIndex: number): string {
  const idx = ((Math.trunc(mondayIndex) % 7) + 7) % 7;
  return WEEKDAY_NAME_FORMAT.format(new Date(Date.UTC(2024, 0, 1 + idx)));
}
