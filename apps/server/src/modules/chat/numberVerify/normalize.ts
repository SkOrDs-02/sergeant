/**
 * Нормалізація чисел у текстах чату: що вважати числом, як його прочитати і
 * яку похибку допустити при порівнянні (ADR-0097, «Верифікація чисел»).
 *
 * Модуль чистий: ні I/O, ні читання env. Усе, що тут живе, однаково працює
 * для відповіді моделі й для того, що модель бачила на вході («поданого»).
 * Саме тому розбір один на обидва боки: якби відповідь і подане читались
 * різними регулярками, «1 240» і «1240» розходились би на рівному місці.
 *
 * AI-CONTEXT: числа читаються з ВІЛЬНОГО тексту, тож найдорожча помилка тут
 * не пропуск, а хибне відхилення правди. Усе нижче схиляється до «не
 * рахувати числом» там, де сумнів: ідентифікатори, дати, години, версії та
 * довгі цифрові рядки вирізаються ДО пошуку чисел.
 */

/** Одиниці, за якими число потрапляє в перевірку (гроші та їжа/вага). */
export type NumberUnit = "money" | "kg" | "kcal" | "g";

/** Грубий вид числа для метрик: кардинальність обмежена свідомо. */
export type NumberKind = "money" | "mass" | "energy";

/**
 * Нижня межа перевірюваного значення. Дрібні числа (лічильники, кроки,
 * `95 грн`) людина звіряє сама, а їх хибне відхилення коштує більше, ніж
 * користь від звірки.
 */
export const SCOPE_MIN_VALUE = 100;

/** Мінімальна похибка порівняння: півгрівні. */
export const MIN_TOLERANCE = 0.5;

/**
 * Заповнювач для вирізаних фрагментів. Не цифра, не літера й не пробіл:
 * довжина тексту лишається тією самою (зсуви збігаються з оригіналом), а
 * сусідні цифри не склеюються в одне число.
 */
const BLANK = "\u0001";

/** Роздільник розрядів: пробіл, NBSP (`formatNumberUk`), вузький NBSP, тонкий. */
const GROUP_SPACE_RE = /[ \u00A0\u202F\u2009]/;
const GROUP_SPACES_RE = /[ \u00A0\u202F\u2009]/g;

/**
 * Маркер усічення з `toolResultTruncation.ts`. Він несе два числа про розмір
 * блоба, і це НЕ дані користувача, тож у «подане» вони не входять. Форму
 * маркера стереже тест, що проганяє справжній `truncateToolResults`.
 */
const TRUNCATION_MARKER_RE =
  /\[…truncated \d+ chars; original \d+ chars sent to Sentry breadcrumb…\]/g;

const URL_RE = /https?:\/\/\S+/g;

/** ISO-дата, за якою може йти час і зона: `2026-07-29`, `2026-07-29T10:00:00Z`. */
const ISO_DATE_RE =
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

/** Календарна дата з роком: `29.07.2026`, `29/07/26`. Без року не маскуємо. */
const DOTTED_DATE_RE = /(?<![\d.])\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})(?!\d)/g;

/** Година: `21:00`, `21:00:15`. */
const TIME_RE = /(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?!\d)/g;

/**
 * Рік перед «р.»/«року»: `у 2026 році` - це не сума. `\b` тут не годиться:
 * без `v`-прапора він ASCII-орієнтований і на кирилиці не спрацьовує, тому
 * межу слова задає явна заборона літери.
 */
const YEAR_WORD_RE =
  /(?<!\d)(?:19|20)\d{2}(?=[ \u00A0]*(?:ро[кц]|рік|рр?(?![а-яіїєґ])))/g;

/** Дуже довгі цифрові рядки: картки, телефони, номери, id. */
const LONG_DIGITS_RE = /\d{11,}/g;

/** Слово з літер, цифр, `_` і `-`: кандидат в ідентифікатор. */
const WORD_RE = /[\p{L}\p{N}_][\p{L}\p{N}_-]*/gu;

interface UnitPattern {
  unit: NumberUnit;
  /** Прив'язано до початку підрядка, одиниця не має продовжуватись літерою. */
  re: RegExp;
}

/**
 * Порядок має значення: `грн` мусить зустрітись раніше за `г`, а `ккал`
 * раніше за `к…`. Після кожного шаблону - заборона літери, щоб `г` не
 * з'їдало початок слова `година`.
 */
const UNIT_PATTERNS: readonly UnitPattern[] = [
  {
    unit: "money",
    re: /^(?:грн\.?|₴|uah|грив[а-яіїєґ]*)(?![а-яіїєґa-z])/i,
  },
  {
    unit: "kcal",
    re: /^(?:ккал|kcal|кілокалор[а-яіїєґ]*|калор[а-яіїєґ]*)(?![а-яіїєґa-z])/i,
  },
  {
    unit: "kg",
    re: /^(?:кг|kg|кілограм[а-яіїєґ]*)(?![а-яіїєґa-z])/i,
  },
  {
    unit: "g",
    re: /^(?:гр?\.?|g|грам[а-яіїєґ]*)(?![а-яіїєґa-z])/i,
  },
];

/** Множники «тис.» і «млн». Одиниця після них необовʼязкова. */
const MULTIPLIER_RE = /^(тис(?:яч[а-яіїєґ]*)?|млн|мільйон[а-яіїєґ]*)\.?/i;

/** Пропуски між числом і одиницею: пробіл, NBSP, вузький NBSP, `**` від markdown. */
const SUFFIX_GAP_RE = /^[*_]{0,2}[ \u00A0\u202F\u2009]*/;

export interface NumberSuffix {
  /** Множник «тис.»/«млн» (1, якщо немає). */
  multiplier: number;
  unit: NumberUnit | null;
  percent: boolean;
  /** Скільки символів після числа належить суфіксу (множник + одиниця). */
  length: number;
}

/**
 * Читає суфікс одразу після числа: `[множник] [одиниця]` або `%`.
 *
 * `rest` - текст ПІСЛЯ числа. Довжина повертається так, щоб виклик міг
 * розтягнути токен до кінця одиниці; якщо суфікса немає, `length` нуль.
 */
export function readSuffix(rest: string): NumberSuffix {
  const gap = SUFFIX_GAP_RE.exec(rest)?.[0] ?? "";
  let pos = gap.length;
  let multiplier = 1;
  let consumed = 0;

  if (rest.startsWith("%", pos)) {
    return { multiplier, unit: null, percent: true, length: pos + 1 };
  }

  const mul = MULTIPLIER_RE.exec(rest.slice(pos));
  if (mul) {
    const word = (mul[1] ?? "").toLowerCase();
    multiplier = word.startsWith("тис") ? 1_000 : 1_000_000;
    pos += mul[0].length;
    consumed = pos;
    const gap2 = SUFFIX_GAP_RE.exec(rest.slice(pos))?.[0] ?? "";
    pos += gap2.length;
  }

  const tail = rest.slice(pos);
  for (const { unit, re } of UNIT_PATTERNS) {
    const m = re.exec(tail);
    if (m) {
      return {
        multiplier,
        unit,
        percent: false,
        length: pos + m[0].length,
      };
    }
  }
  return { multiplier, unit: null, percent: false, length: consumed };
}

/** Чи є `rest` повністю одиницею виміру (для слів на кшталт `960грн`). */
function isWholeUnit(rest: string): boolean {
  for (const { re } of UNIT_PATTERNS) {
    const m = re.exec(rest);
    if (m && m[0].length === rest.length) return true;
  }
  return false;
}

function blank(text: string, re: RegExp): string {
  return text.replace(re, (m) => BLANK.repeat(m.length));
}

/**
 * Вирізає з тексту усе, що схоже на число, але ним не є: маркер усічення,
 * URL, дати, години, роки, ідентифікатори (`tx_9f21`, uuid, hex, `A4`),
 * порядкові (`29-го`) і довгі цифрові рядки.
 *
 * Слово з літерами й цифрами лишається, лише якщо воно - число з одиницею
 * (`960грн`, `500г`): модель нерідко пише без пробілу.
 */
export function maskNonQuantities(text: string): string {
  let out = text;
  out = blank(out, TRUNCATION_MARKER_RE);
  out = blank(out, URL_RE);
  out = blank(out, ISO_DATE_RE);
  out = blank(out, DOTTED_DATE_RE);
  out = blank(out, TIME_RE);
  out = blank(out, YEAR_WORD_RE);
  out = out.replace(WORD_RE, (word) => {
    if (!/\d/.test(word)) return word;
    // Цифри з дефісом без літер - діапазон (`500-700 грн`), а не ідентифікатор.
    if (!/[\p{L}_]/u.test(word)) return word;
    const lead = /^\d+/.exec(word);
    if (lead && isWholeUnit(word.slice(lead[0].length))) return word;
    return BLANK.repeat(word.length);
  });
  out = blank(out, LONG_DIGITS_RE);
  return out;
}

export interface ParsedNumeral {
  value: number;
  /** Друге прочитання неоднозначного запису (`1.240`: 1240 або 1,24). */
  alt: number | null;
  /** Знаків після десяткового роздільника у ПЕРШОМУ прочитанні. */
  decimals: number;
}

function decimalsOf(text: string): number {
  const m = /[.,](\d+)$/.exec(text);
  return m ? (m[1] ?? "").length : 0;
}

/**
 * Розбирає запис числа в значення.
 *
 * Підтримує групи пробілом/NBSP/вузьким NBSP (`12 345,67`), десяткову кому
 * й крапку (`12,5`, `12.5`), групи крапкою або комою (`1.240.000`,
 * `1,240,000`). Один роздільник із рівно трьома цифрами за ним
 * (`1.240`) двозначний: це або тисяча, або три знаки після коми. Тоді
 * повертаються ОБИДВА прочитання (`alt`), а вибір за одиницею робить викликач.
 */
export function parseNumeral(raw: string): ParsedNumeral | null {
  const spaced = GROUP_SPACE_RE.test(raw);
  if (spaced) {
    const compact = raw.replace(GROUP_SPACES_RE, "");
    const value = Number(compact.replace(",", "."));
    return Number.isFinite(value)
      ? { value, alt: null, decimals: decimalsOf(compact) }
      : null;
  }

  const dotGroups = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw);
  const commaGroups = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw);
  if ((dotGroups || commaGroups) && !raw.startsWith("0")) {
    const sep = dotGroups ? "." : ",";
    const groupCount = raw.split(sep).length - 1;
    const hasTail = dotGroups ? raw.includes(",") : raw.includes(".");
    const grouped = dotGroups
      ? Number(raw.replace(/\./g, "").replace(",", "."))
      : Number(raw.replace(/,/g, ""));
    if (groupCount >= 2 || hasTail) {
      return Number.isFinite(grouped)
        ? { value: grouped, alt: null, decimals: decimalsOf(raw) }
        : null;
    }
    // Одна група без хвоста: `1.240` / `1,240`.
    const decimal = Number(raw.replace(",", "."));
    return Number.isFinite(grouped) && Number.isFinite(decimal)
      ? { value: grouped, alt: decimal, decimals: 0 }
      : null;
  }

  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value)
    ? { value, alt: null, decimals: decimalsOf(raw) }
    : null;
}

/**
 * Похибка порівняння: половина останнього значущого розряду, але не менше
 * `MIN_TOLERANCE`. `34 тис.` це ±500, `1,2 тис.` це ±50, `960` це ±0,5.
 */
export function toleranceFor(decimals: number, multiplier: number): number {
  return Math.max(MIN_TOLERANCE, 0.5 * 10 ** -decimals * multiplier);
}

/** Вид числа для метрик. */
export function kindOfUnit(unit: NumberUnit): NumberKind {
  if (unit === "money") return "money";
  if (unit === "kcal") return "energy";
  return "mass";
}
