import { kyivWallClockToUtc } from "./kyivClock.js";

/**
 * Мінімальний, цільовий XML-парсер для відповіді ДПС `chkAll`
 * (`GET /ws/api_public/rro/chkAll`, публічна XSD, теги CHECK / CHECKHEAD /
 * CHECKBODY / ROW). Жодної XML-залежності в `package.json` server-а нема
 * (перевірено перед написанням — спека дозволяє мінімальний власний
 * парсер, а не тягнути `fast-xml-parser`/`xml2js` заради чотирьох тегів).
 *
 * AI-DANGER: ВІДКРИТИЙ ГЕЙТ СПЕКИ — реального токена ДПС нема (founder ще
 * не згенерував), тож жоден рядок нижче не бачив живої відповіді. Верхній
 * рівень (`CHECK`/`CHECKHEAD`/`CHECKBODY`/`ROW`) прийшов прямо з завдання
 * (публічна XSD), решта leaf-тегів (`ORGNM`, `ORGTIN`, `ORDATE`, `ORTIME`,
 * `ORDERTAXNUM`, `SUM`, `NAME`, `AMOUNT`, `PRICE`, `COST`) — обґрунтована
 * реконструкція за типовою структурою українських фіскальних XML, НЕ
 * підтверджена реальним запитом. Перший крок імплементації (спека
 * § Ризики) — smoke-тест на реальному чеку; якщо теги розходяться,
 * правити ЛИШЕ `extractFirstTag(head, "...")` виклики нижче — решта
 * (day-boundary, money-парсинг, error-handling) від конкретних імен не
 * залежить.
 *
 * Формат SUM/PRICE/COST теж не підтверджений: `parseMoneyKopiykas`
 * обробляє ОБИДВА правдоподібні варіанти (ціле число копійок "15000" АБО
 * рядок з крапкою як гривні-з-копійками "150.00") — розрізняє за
 * наявністю десяткового роздільника, тому жодна гілка мовчки не спотворює
 * суму.
 */

const MAX_XML_BYTES = 512 * 1024;

export interface ParsedDpsCheckItem {
  position: number;
  name: string;
  qty: number;
  priceKopiykas: number;
  sumKopiykas: number;
}

export interface ParsedDpsCheck {
  fiscalNum: string | null;
  store: string;
  storeTaxId: string | null;
  purchasedAt: Date;
  totalKopiykas: number;
  items: ParsedDpsCheckItem[];
}

function decodeXmlText(raw: string): string {
  let s = raw;
  const cdataMatch = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  if (cdataMatch) s = cdataMatch[1] ?? "";
  return (
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_m, code: string) =>
        String.fromCharCode(Number(code)),
      )
      // `&amp;` decoded LAST — інакше "&amp;lt;" подвійно розкодувався б у "<".
      .replace(/&amp;/g, "&")
      .trim()
  );
}

/** Перший `<tag>...</tag>` (з довільними атрибутами у відкритому тезі) у `xml`. */
function extractFirstTag(xml: string, tag: string): string | null {
  // eslint-disable-next-line security/detect-non-literal-regexp -- `tag` завжди хардкоджений літерал у виклику (напр. "ORGNM", "SUM"), ніколи не з `xml`/зовнішнього вводу; лише `xml` (текст, що зіставляється, не патерн) містить дані джерела.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  return decodeXmlText(m[1] ?? "");
}

interface TagBlock {
  attrs: string;
  content: string;
}

/** Усі блоки `<tag attrs?>...</tag>` у `xml` (для повторюваних ROW). */
function extractAllTagBlocks(xml: string, tag: string): TagBlock[] {
  // eslint-disable-next-line security/detect-non-literal-regexp -- `tag` завжди хардкоджений літерал (напр. "ROW"), той самий обґрунтований case, що `extractFirstTag` вище.
  const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: TagBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1] ?? "", content: m[2] ?? "" });
    // Захист від нескінченного циклу на нульовій довжині збігу — з цим
    // патерном (обов'язковий `<tag...>...</tag>`) не повинно траплятись,
    // але дешево перестрахуватись проти майбутньої зміни regex-у.
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function extractAttr(attrs: string, name: string): string | null {
  // eslint-disable-next-line security/detect-non-literal-regexp -- `name` завжди хардкоджений літерал (напр. "ROWNUM"), той самий обґрунтований case, що `extractFirstTag` вище.
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = re.exec(attrs);
  return m ? (m[1] ?? null) : null;
}

/**
 * Гроші (SUM/PRICE/COST) — або ціле число копійок ("15000"), або рядок з
 * десятковим роздільником як гривні ("150.00" / "150,00"). Кома
 * нормалізується до крапки (укр. фіскальні системи іноді пишуть кому).
 * Від'ємні значення (рядки знижок) зберігаються як є.
 */
function parseMoneyKopiykas(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  if (trimmed.includes(".")) {
    const hryvnia = Number(trimmed);
    if (!Number.isFinite(hryvnia)) return null;
    return Math.round(hryvnia * 100);
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * `ORDATE` — 8 цифр, формат не підтверджений (DDMMYYYY чи YYYYMMDD
 * однаково правдоподібні для укр. державної форми). Пробуємо обидва
 * прочитання і приймаємо те, що дає правдоподібний рік/місяць/день —
 * безпечніше за одну тверду гілку, яка мовчки дасть криву дату, якщо
 * здогад невірний.
 */
function parseDpsDate(
  raw: string | null,
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const asYyyyMmDd = {
    year: Number(digits.slice(0, 4)),
    month: Number(digits.slice(4, 6)),
    day: Number(digits.slice(6, 8)),
  };
  const asDdMmYyyy = {
    year: Number(digits.slice(4, 8)),
    month: Number(digits.slice(2, 4)),
    day: Number(digits.slice(0, 2)),
  };
  const plausible = (p: {
    year: number;
    month: number;
    day: number;
  }): boolean =>
    p.year >= 2000 &&
    p.year <= 2100 &&
    p.month >= 1 &&
    p.month <= 12 &&
    p.day >= 1 &&
    p.day <= 31;
  if (plausible(asYyyyMmDd)) return asYyyyMmDd;
  if (plausible(asDdMmYyyy)) return asDdMmYyyy;
  return null;
}

/** `ORTIME` — 6 (HHMMSS) чи 4 (HHMM) цифр. Відсутній/нечитабельний → 12:00
 * (краще за падіння всього парсингу заради секунд точності часу). */
function parseDpsTime(raw: string | null): {
  hour: number;
  minute: number;
  second: number;
} {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length >= 6) {
    return {
      hour: Number(digits.slice(0, 2)),
      minute: Number(digits.slice(2, 4)),
      second: Number(digits.slice(4, 6)),
    };
  }
  if (digits.length >= 4) {
    return {
      hour: Number(digits.slice(0, 2)),
      minute: Number(digits.slice(2, 4)),
      second: 0,
    };
  }
  return { hour: 12, minute: 0, second: 0 };
}

/**
 * Парсить XML-відповідь `chkAll` у структуровані дані чека. Повертає
 * `null` на будь-якій неможливості впевнено розпізнати документ (не
 * кидає — lookup.ts сам вирішує, як це подати користувачу).
 *
 * Hard Rule #21: НІКОЛИ не логуй `xml` тут чи в жодному викликачі — може
 * містити адресу магазину/ЄДРПОУ понад pino-редакцію.
 */
export function parseDpsCheckXml(xml: string): ParsedDpsCheck | null {
  if (!xml || typeof xml !== "string") return null;
  if (Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES) return null;

  const checkMatch = /<CHECK(?:\s[^>]*)?>([\s\S]*?)<\/CHECK>/i.exec(xml);
  if (!checkMatch) return null;
  const checkXml = checkMatch[1] ?? "";

  const head = extractFirstTag(checkXml, "CHECKHEAD");
  const body = extractFirstTag(checkXml, "CHECKBODY");
  if (head == null || body == null) return null;

  const store = extractFirstTag(head, "ORGNM");
  if (!store) return null;

  const storeTaxId = extractFirstTag(head, "ORGTIN");
  const fiscalNum = extractFirstTag(head, "ORDERTAXNUM");

  const dateParts = parseDpsDate(extractFirstTag(head, "ORDATE"));
  if (!dateParts) return null;
  const timeParts = parseDpsTime(extractFirstTag(head, "ORTIME"));
  const purchasedAt = kyivWallClockToUtc({ ...dateParts, ...timeParts });

  const totalKopiykas = parseMoneyKopiykas(extractFirstTag(head, "SUM"));
  if (totalKopiykas == null) return null;

  const items: ParsedDpsCheckItem[] = [];
  const rowBlocks = extractAllTagBlocks(body, "ROW");
  for (let i = 0; i < rowBlocks.length; i++) {
    const block = rowBlocks[i];
    if (!block) continue;
    const name = extractFirstTag(block.content, "NAME");
    if (!name) continue; // пропускаємо нерозбірливий рядок, не валимо весь чек

    const qtyRaw = extractFirstTag(block.content, "AMOUNT");
    const qty = qtyRaw != null ? Number(qtyRaw.replace(",", ".")) : 1;
    const priceKopiykas =
      parseMoneyKopiykas(extractFirstTag(block.content, "PRICE")) ?? 0;
    const costKopiykas = parseMoneyKopiykas(
      extractFirstTag(block.content, "COST"),
    );
    const rowNum = Number(extractAttr(block.attrs, "ROWNUM"));

    items.push({
      position: Number.isFinite(rowNum) && rowNum > 0 ? rowNum : i + 1,
      name,
      qty: Number.isFinite(qty) ? qty : 1,
      priceKopiykas,
      sumKopiykas:
        costKopiykas ??
        priceKopiykas * Math.round(Number.isFinite(qty) ? qty : 1),
    });
  }

  return { fiscalNum, store, storeTaxId, purchasedAt, totalKopiykas, items };
}
