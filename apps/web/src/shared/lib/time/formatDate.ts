/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Сім іменованих форматів дати — єдине джерело на весь `apps/web`.
 *
 * ЧОМУ ЦЕ ІСНУЄ. Замір 2026-09-16: 66 місць форматували дату **42** різними
 * наборами опцій, тож на одному екрані «13.09.2026», а на сусідньому
 * «13 вер. 2026 р.» — і це бачить користувач (знахідка PR-C3 наскрізного
 * огляду 2026-09-13). Причина не в тому, що хтось наплутав: коли канонічної
 * форми немає, кожен новий виклик копіює найближчий сусідній, і набори
 * розмножуються самі.
 *
 * НАБІР ПОЧИНАВСЯ З ЧОТИРЬОХ базових плюс один для щільних контекстів
 * (рішення власника 2026-09-16). Сім імен тоді відкинули: межа між ними
 * розмивається, і повертається та сама проблема вибору.
 *
 * РІШЕННЯ ПЕРЕГЛЯНУТО 2026-09-15 — але заміром, а не смаком. Міграція
 * call-site-ів показала, що 12 місць не мають сюди дороги, і не порізно, а
 * двома стійкими сім'ями: сім разів словесна дата БЕЗ року («13 вересня») і
 * п'ять разів дата РАЗОМ із часом. Склеїти їх із наявних НЕ МОЖНА, і це
 * перевірено прогоном, а не припущено:
 *
 *   {day, month:short, hour, minute}   → «13 вер., 14:30»   (кома від Intl)
 *   formatDateShort() + " " + formatTimeHm() → «13 вер. 14:30»  (коми немає)
 *
 * Тобто єдиний форматтер ставить розділювач, якого конкатенація не дає. Тому
 * два імені додано, а не тринадцять місць лишено сирими.
 *
 * ЩО ВСЕ ОДНО НЕ ДОДАЛИ, хоча форма трапляється: `{month:"long"}` і
 * `{month:"short"}` САМІ ПО СОБІ (без дня) — це підпис осі й заголовок
 * періоду без року, дві згадки на весь застосунок. Одна згадка не варта
 * імені: саме так набір і розповзається.
 *
 * УВАГА ПРО ДОВГИЙ МІСЯЦЬ ІЗ ЧАСОМ. `{day, month:"long", hour, minute}` у
 * uk-UA дає «13 вересня о 14:30» — із прийменником, а не комою. Це окрема
 * третя форма, і власного імені вона НЕ отримала: єдиний її носій
 * (`AIDigestSection`) зведено на `formatDateTimeShort`, тобто на «13 вер.,
 * 14:30». Це свідома втрата милозвучності заради того, щоб форм було дві, а
 * не три. Якщо прийменникова форма потрібна — це рішення на одне слово, і
 * тоді їй треба ім'я, а не повернення сирого `Intl` у call-site.
 *
 * Що НЕ живе тут:
 *  - день тижня — `uaWeekdayDate.ts` (`формат «середа, 2 вересня»`);
 *  - київська довга дата для білінгу — `kyivTime.ts` `formatKyivLongDate`;
 *  - людські підписи день-ключів («сьогодні», «вчора») — `dayKeyLabel.ts`.
 *
 * ПРО ЧАСОВУ ЗОНУ. За замовчуванням — зона ПРИСТРОЮ, і це не недогляд:
 * ADR-0078 фіксує, що межа особистої доби визначається годинником пристрою.
 * Серверні звіти й фінансові періоди, яким потрібен Київ, передають
 * `timeZone` явно — так само, як це робить `formatUaWeekdayDate`.
 */

/** IANA-зона Києва — щоб викликачі не писали рядок руками. */
export const KYIV_TIME_ZONE = "Europe/Kyiv";

export interface DateFormatOptions {
  /** IANA-зона. Без неї — зона пристрою (ADR-0078). */
  timeZone?: string | undefined;
}

export interface DateShortOptions extends DateFormatOptions {
  /** Дописати рік: «13 вер. 2026». За замовчуванням ні. */
  withYear?: boolean;
}

export interface MonthYearOptions extends DateFormatOptions {
  /** Велика перша літера: «Вересень 2026». За замовчуванням ні. */
  capitalize?: boolean;
}

/** Порожній рядок на невалідній даті — підпис із «Invalid Date» гірший за відсутній. */
function guard(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function tz(timeZone: string | undefined) {
  return timeZone ? { timeZone } : {};
}

/** `13 вер.` — найчастіший формат у продукті (17 із 66 викликів на дату заміру). */
export function formatDateShort(
  date: Date,
  options: DateShortOptions = {},
): string {
  if (!guard(date)) return "";
  const { timeZone, withYear = false } = options;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    ...tz(timeZone),
  }).format(date);
}

/** `13 вересня 2026` — повна словесна дата. */
export function formatDateFull(
  date: Date,
  options: DateFormatOptions = {},
): string {
  if (!guard(date)) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...tz(options.timeZone),
  }).format(date);
}

/** `14:30` — час без секунд. */
export function formatTimeHm(
  date: Date,
  options: DateFormatOptions = {},
): string {
  if (!guard(date)) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    ...tz(options.timeZone),
  }).format(date);
}

/** `вересень 2026` — заголовок періоду. */
export function formatMonthYear(
  date: Date,
  options: MonthYearOptions = {},
): string {
  if (!guard(date)) return "";
  const { timeZone, capitalize = false } = options;
  const out = new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
    ...tz(timeZone),
  }).format(date);
  return capitalize ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/**
 * `13 вересня` — словесна дата БЕЗ року.
 *
 * Найчастіша форма поза базовим набором: сім call-site-ів на дату додавання
 * (`SyncStatusSheet`, `AiMemoryList`, `MonthStrip`, `transactionsLib`,
 * `useOverviewData`, `HeroCardStates`). Рік там зайвий, бо контекст — поточний
 * період, і дописати його означало б змінити видимий текст усім сімом.
 *
 * `month: "long"` разом із числом дня дає РОДОВИЙ відмінок («13 вересня»), а
 * сам по собі — називний («вересень»). Саме тому `MonthStrip` історично
 * діставав родовий відмінок, форматуючи фіктивне перше число й зрізаючи день
 * регуляркою; з цією функцією такий трюк більше не потрібен.
 */
export function formatDayMonth(
  date: Date,
  options: DateFormatOptions = {},
): string {
  if (!guard(date)) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    ...tz(options.timeZone),
  }).format(date);
}

/**
 * `13 вер., 14:30` — дата разом із часом; `withYear` дає
 * `13 вер. 2026 р., 14:30`.
 *
 * ОДИН форматтер, не склейка двох — і це не стилістика. `Intl` ставить кому
 * між датою й часом сам, а `formatDateShort() + " " + formatTimeHm()` дає
 * «13 вер. 14:30» без неї. Тобто конкатенація тут не еквівалент, а третій
 * формат, і саме через це п'ять call-site-ів не мали сюди дороги.
 *
 * `withYear: true` збігається байт-у-байт із `dateStyle:"medium"` +
 * `timeStyle:"short"` — перевірено прогоном; це та форма, яку вживав
 * `BankTransactionDetailsSheet`.
 */
export function formatDateTimeShort(
  date: Date,
  options: DateShortOptions = {},
): string {
  if (!guard(date)) return "";
  const { timeZone, withYear = false } = options;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    ...tz(timeZone),
  }).format(date);
}

/**
 * `13.09.2026` — цифрова дата для ЩІЛЬНИХ контекстів: таблиць і технічних
 * футерів, де словесна форма з'їдає ширину.
 *
 * Це свідомий виняток, а не решта легасі (рішення власника 2026-09-16):
 * альтернатива — звести все до словесного — програє там, де дата стоїть у
 * вузькій колонці поруч із сумою. Тобто цифрова форма лишається легальною,
 * але тепер вона ІМЕНОВАНА: видно, що її обрали, а не що вона витекла з
 * голого `toLocaleDateString()`.
 */
export function formatDateNumeric(
  date: Date,
  options: DateFormatOptions = {},
): string {
  if (!guard(date)) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...tz(options.timeZone),
  }).format(date);
}
