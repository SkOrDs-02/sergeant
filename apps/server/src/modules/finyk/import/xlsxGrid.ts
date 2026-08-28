import {
  readZip,
  looksLikeZip,
  ZipFormatError,
  type ZipEntries,
} from "./zipReader.js";

/**
 * XLSX (OOXML SpreadsheetML) → сітка рядків `string[][]` для
 * `statementFile.ts`. Далі сітка йде тим самим шляхом, що й CSV
 * (`csvProfiles.ts` → `statementPreview.ts#classifyRows`) — окремого
 * конвеєра для таблиць немає.
 *
 * Свій цільовий ридер, не бібліотека (див. `zipReader.ts` про WHY).
 * Покриває рівно те, що є в банківському експорті: спільні рядки
 * (`sharedStrings`), inline-рядки, числа, булеві, формульні результати і
 * ДАТИ (числовий serial + числовий формат зі `styles.xml`).
 *
 * AI-CONTEXT: числові й датові клітинки віддаються в КАНОНІЧНІЙ формі
 * (`-1234.56`, `2026-08-16`), тому `statementFile.ts` позначає такий грід
 * `sourceKind: "sheet"` і знімає з профілю жорсткі підказки
 * `dateFormat`/`decimalComma`. Інакше профіль Privat24 (`DD.MM.YYYY` +
 * кома-десятковий) мовчки перетворив би канонічний `2026-08-16` на
 * `unparsed_date`, а `-1234.56` — на `-123456` копійок.
 */

// ────────────────────────────── XML helpers ──────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Розгортає XML/HTML-сутності, включно з числовими (`&#8212;`, `&#x2014;`). */
export function decodeXmlEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(
        isHex ? body.slice(2) : body.slice(1),
        isHex ? 16 : 10,
      );
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Значення атрибута `name` у сирому тексті відкривального тега.
 *
 * Сканер, а не `new RegExp(name)`: імена атрибутів тут — константи
 * (`r`, `t`, `s`, `numFmtId`), але динамічний конструктор регекспа все
 * одно тягне попередження `security/detect-non-literal-regexp`, а
 * пре-коміт ганяє eslint із `--max-warnings=0`.
 *
 * Приймає рівно те, що дозволяє XML (`Attribute ::= Name Eq AttValue`,
 * `Eq ::= S? '=' S?`): будь-який пробільний символ як роздільник
 * атрибутів (не лише U+0020 — таби й переноси рядків легальні), пробіли
 * навколо `=`, і значення в подвійних або одинарних лапках. Кожне
 * послаблення тут — не косметика: комірка, у якої ми не прочитали `r`,
 * не падає з помилкою, а сідає в «наступну вільну» позицію, тобто
 * мовчки зсуває колонки у фінансових даних; не прочитаний `t` робить
 * рядкове значення числовим.
 */
function attr(tag: string, name: string): string | undefined {
  let from = 0;
  for (;;) {
    const at = tag.indexOf(name, from);
    if (at === -1) return undefined;
    from = at + name.length;
    // Ліва межа: імʼя має починати атрибут, а не бути хвостом іншого
    // (`r` у `numFmtId`, `Id` у значенні `"rId1"`).
    const before = at === 0 ? "<" : tag[at - 1]!;
    if (before !== "<" && !/\s/.test(before)) continue;
    let i = from;
    while (i < tag.length && /\s/.test(tag[i]!)) i += 1;
    // Права межа: далі має бути саме `=`. Це відсіює і збіг із префіксом
    // довшого імені (`s` у `spans`), бо там наступний символ — літера.
    if (tag[i] !== "=") continue;
    i += 1;
    while (i < tag.length && /\s/.test(tag[i]!)) i += 1;
    const quote = tag[i];
    if (quote !== '"' && quote !== "'") continue;
    const start = i + 1;
    const end = tag.indexOf(quote, start);
    if (end === -1) return undefined;
    return decodeXmlEntities(tag.slice(start, end));
  }
}

/** Конкатенація вмісту всіх `<t>`-вузлів фрагмента (rich-text `<si>` бʼється
 * на кілька `<r><t>`); `<rPh>` (японська фонетика) не трапляється в
 * банківських файлах і навмисно не виокремлюється. */
function joinTextNodes(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXmlEntities(m[1] ?? "");
  return out;
}

// ─────────────────────────── Shared strings ──────────────────────────────

function parseSharedStrings(zip: ZipEntries): string[] {
  const bytes = zip.get("xl/sharedStrings.xml");
  if (!bytes) return [];
  const xml = bytes.toString("utf8");
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(joinTextNodes(m[1] ?? ""));
  return out;
}

// ──────────────────────────── Number formats ─────────────────────────────

/** Вбудовані `numFmtId`, що є датою/часом за специфікацією ECMA-376. */
const BUILTIN_DATE_FMT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

/** Чи описує `formatCode` дату/час: шукаємо d/m/y/h/s ПОЗА літералами в
 * лапках і поза escape-ами (`\.`), інакше формат `0.00" грн"` хибно
 * читався б як датовий через "р"→ні, але `"months"` — так. */
function isDateFormatCode(code: string): boolean {
  let inQuotes = false;
  let inBracket = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i]!;
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "[") inBracket = true;
    else if (ch === "]") inBracket = false;
    if (inQuotes || inBracket) continue;
    if ("dmyhsDMYHS".includes(ch)) return true;
  }
  return false;
}

/** `s`-індекс клітинки → чи датовий у неї числовий формат. */
function parseDateStyleFlags(zip: ZipEntries): boolean[] {
  const bytes = zip.get("xl/styles.xml");
  if (!bytes) return [];
  const xml = bytes.toString("utf8");

  const customDateIds = new Set<number>();
  // І самозакривний `<numFmt .../>`, і парний `<numFmt ...></numFmt>`:
  // Excel і перевірений Privat24-експорт пишуть перший варіант, але інший
  // генератор із другим лишив би `customDateIds` порожнім — і датові
  // клітинки з КАСТОМНИМ форматом приїхали б Excel-серіалом, який
  // `statementPreview` класифікує як `unparsed_date`.
  const numFmtRe = /<numFmt\s[^>]*?(?:\/>|>[\s\S]*?<\/numFmt>)/g;
  let m: RegExpExecArray | null;
  while ((m = numFmtRe.exec(xml)) !== null) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode") ?? "";
    if (Number.isFinite(id) && isDateFormatCode(code)) customDateIds.add(id);
  }

  const cellXfs = /<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return [];
  const flags: boolean[] = [];
  const xfRe = /<xf\s[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
  while ((m = xfRe.exec(cellXfs[1]!)) !== null) {
    const id = Number(attr(m[0], "numFmtId") ?? "0");
    flags.push(BUILTIN_DATE_FMT_IDS.has(id) || customDateIds.has(id));
  }
  return flags;
}

// ───────────────────────────── Value coercion ────────────────────────────

/** Днів між епохою Excel (1899-12-30, з урахуванням «1900-високосного» бага
 * Lotus, який Excel відтворює) і Unix-епохою. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Excel-serial → `YYYY-MM-DD` (плюс ` HH:MM`, якщо є дробова частина).
 * `parseCalendarDateKey` читає обидві форми (хвостовий час ігнорує), тож
 * час лишаємо для читабельності sample-рядків у column-mapper.
 */
export function excelSerialToDateString(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2_958_465)
    return null;
  const ms = Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return hh === 0 && mm === 0 ? day : `${day} ${pad2(hh)}:${pad2(mm)}`;
}

/**
 * Число → рядок без експоненти й без плаваючого шуму (`-1234.5600000000001`
 * → `-1234.56`). Копійчана точність — 2 знаки, але лишаємо 6 із запасом на
 * курсові колонки, які теж може обрати користувач у mapper-і.
 */
export function canonicalNumberString(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

// ─────────────────────────────── Sheet read ──────────────────────────────

/** `"BC12"` → 0-based індекс колонки (54). */
export function columnRefToIndex(ref: string): number {
  let idx = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break; // перша цифра — кінець літерної частини
    idx = idx * 26 + (code - 64);
  }
  return idx - 1;
}

interface SheetReadContext {
  shared: string[];
  dateStyles: boolean[];
}

function cellText(
  cellTag: string,
  inner: string,
  ctx: SheetReadContext,
): string {
  const type = attr(cellTag, "t") ?? "n";

  if (type === "inlineStr") return joinTextNodes(inner).trim();

  const vMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
  const rawValue = vMatch ? decodeXmlEntities(vMatch[1]!) : "";
  if (!rawValue) return "";

  switch (type) {
    case "s": {
      const idx = Number(rawValue);
      return (Number.isInteger(idx) ? ctx.shared[idx] : undefined) ?? "";
    }
    case "str":
      return rawValue.trim();
    case "b":
      return rawValue === "1" ? "TRUE" : "FALSE";
    case "e":
      // #N/A, #REF! — для імпорту це порожня клітинка, не текст помилки.
      return "";
    case "d":
      // ISO-дата прямо в `<v>` (рідкісний, але легальний варіант OOXML).
      return rawValue.trim();
    default: {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) return rawValue.trim();
      const styleIdx = Number(attr(cellTag, "s") ?? "0");
      if (ctx.dateStyles[styleIdx] === true) {
        return excelSerialToDateString(n) ?? canonicalNumberString(n);
      }
      return canonicalNumberString(n);
    }
  }
}

function parseSheet(xml: string, ctx: SheetReadContext): string[][] {
  const rows: string[][] = [];
  // САМОЗАКРИВНА альтернатива йде ПЕРШОЮ, і це не косметика: у
  // `<row r="1"/><row r="2">…</row>` парна альтернатива вміє зʼїсти
  // `/` через `[^>]*` і проковтнути обидва рядки як один. Регексп
  // пробує альтернативи зліва направо, тож порядок і є фіксом.
  const rowRe = /<row(?:\s[^>]*)?\/>|<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const body = rowMatch[1] ?? "";
    const cells: string[] = [];
    // Той самий порядок альтернатив, що й для `<row>` вище: інакше
    // `<c r="A1"/><c r="B1">…</c>` читається як ОДНА клітинка, і всі
    // наступні колонки рядка зсуваються вліво (знайдено юніт-тестом).
    const cellRe = /<c(\s[^>]*)?\/>|<c(\s[^>]*)?>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let autoIndex = 0;

    while ((cellMatch = cellRe.exec(body)) !== null) {
      const tagAttrs = cellMatch[1] ?? cellMatch[2] ?? "";
      const inner = cellMatch[3] ?? "";
      const ref = attr(`<c${tagAttrs}>`, "r");
      // `<c>` без `r` легальний — тоді колонка йде по порядку. З `r`
      // порожні клітинки в файлі просто відсутні, і без цього зсуву
      // колонки «зʼїхали б» уліво (типово для експортів з пропусками).
      const colIdx = ref ? columnRefToIndex(ref) : autoIndex;
      if (colIdx >= 0) {
        while (cells.length < colIdx) cells.push("");
        cells[colIdx] = cellText(`<c${tagAttrs}>`, inner, ctx);
        autoIndex = colIdx + 1;
      }
    }
    rows.push(cells);
  }
  return rows;
}

// ───────────────────────────── Workbook entry ────────────────────────────

/** Шлях аркуша, на який показує ПЕРШИЙ `<sheet>` у `xl/workbook.xml`
 * (порядок вкладок = порядок у файлі), через `workbook.xml.rels`. */
function firstSheetPath(zip: ZipEntries): string | null {
  const wb = zip.get("xl/workbook.xml");
  if (wb) {
    const sheetTag = /<sheet\s[^>]*\/>/.exec(wb.toString("utf8"));
    const rid = sheetTag
      ? (attr(sheetTag[0], "r:id") ?? attr(sheetTag[0], "id"))
      : undefined;
    const relsBytes = zip.get("xl/_rels/workbook.xml.rels");
    if (rid && relsBytes) {
      const relsXml = relsBytes.toString("utf8");
      const relRe = /<Relationship\s[^>]*\/>/g;
      let m: RegExpExecArray | null;
      while ((m = relRe.exec(relsXml)) !== null) {
        if (attr(m[0], "Id") !== rid) continue;
        const target = attr(m[0], "Target") ?? "";
        const path = target.startsWith("/")
          ? target.slice(1)
          : `xl/${target.replace(/^\.\//, "")}`;
        if (zip.has(path)) return path;
      }
    }
  }
  // Fallback: перший `xl/worksheets/sheetN.xml` за числовим порядком.
  const sheets = zip
    .names()
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort(
      (a, b) =>
        Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]),
    );
  return sheets[0] ?? null;
}

export class XlsxFormatError extends Error {}

/** Чи це взагалі OOXML-книга (а не інший ZIP — ODS, docx, звичайний архів). */
export function isXlsxZip(zip: ZipEntries): boolean {
  return (
    zip.has("xl/workbook.xml") ||
    zip.names().some((n) => n.startsWith("xl/worksheets/"))
  );
}

/**
 * Читає ПЕРШИЙ аркуш XLSX у сітку. Банківські експорти кладуть виписку на
 * перший аркуш; вибір аркуша користувачем — окрема фіча, не цей шлях.
 */
export function xlsxToGrid(bytes: Buffer): string[][] {
  if (!looksLikeZip(bytes)) throw new XlsxFormatError("Не ZIP-контейнер");
  let zip: ZipEntries;
  try {
    zip = readZip(bytes);
  } catch (err) {
    throw new XlsxFormatError(
      err instanceof ZipFormatError ? err.message : "Не вдалось прочитати ZIP",
    );
  }
  if (!isXlsxZip(zip))
    throw new XlsxFormatError("ZIP без частин xl/ — не XLSX");

  const sheetPath = firstSheetPath(zip);
  if (!sheetPath) throw new XlsxFormatError("У книзі немає жодного аркуша");
  const sheetBytes = zip.get(sheetPath);
  if (!sheetBytes) throw new XlsxFormatError("Аркуш не читається");

  return parseSheet(sheetBytes.toString("utf8"), {
    shared: parseSharedStrings(zip),
    dateStyles: parseDateStyleFlags(zip),
  });
}
