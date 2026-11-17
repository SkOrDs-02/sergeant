import { scanElements } from "./tagScan.js";
import { decodeXmlEntities } from "./xlsxGrid.js";

/**
 * HTML-таблиця → сітка `string[][]`.
 *
 * AI-CONTEXT: це не «підтримка HTML заради HTML». Частина табличних
 * експортів віддає HTML-таблицю з розширенням `.xls`. Excel таке
 * відкриває, `xlsxToGrid` - ні (це не ZIP), і без цієї гілки такий файл
 * упирався б у помилку старого формату, хоча читається тривіально.
 *
 * Свідомо НЕ повноцінний HTML-парсер: очікуваний експорт - це плаский
 * `<table>` без JS. Вкладені таблиці (layout-обгортки) розкладаються в
 * плоский список `<tr>`, а зайві рядки-обгортки потім відсіює
 * `locateHeaderRow` у `tabularFile.ts`.
 */

const TR_OPEN_RE = /<(tr)\b/gi;
const CELL_OPEN_RE = /<(t[dh])\b/gi;
const SCRIPT_STYLE_OPEN_RE = /<(script|style)\b/gi;
const TAG_RE = /<[^>]*>/g;
const BR_RE = /<br\s*\/?>/gi;

/** Чи схожий текст на HTML-документ із таблицею (детект іде ДО парсингу —
 * дешевий тест на `<table` в перших кілобайтах). */
export function looksLikeHtmlTable(text: string): boolean {
  return /<table\b/i.test(text.slice(0, 64 * 1024));
}

/** Скільки разів поспіль дозволено чистити рядок до нерухомої точки.
 * Реальний табличний експорт стабілізується на ПЕРШОМУ проході; більше
 * одного треба лише вкладеним тегам, тобто рівно тому випадку, заради
 * якого цикл і існує. Стеля тут не косметична: без неї скрафчений файл на
 * 5 МБ (стеля `STATEMENT_MAX_FILE_BYTES`), у якому кожен прохід відкриває
 * наступний `<script>`, дає квадратичний CPU на серверному запиті
 * імпорту. */
const MAX_SANITIZE_PASSES = 8;

/** Вхід не вдалось безпечно розібрати як HTML-таблицю. */
export class HtmlFormatError extends Error {}

/**
 * Прибирає підрядки за патерном ДО НЕРУХОМОЇ ТОЧКИ — поки рядок не
 * перестане мінятись, але не більше ніж `MAX_SANITIZE_PASSES` разів.
 *
 * Один прохід тут недостатній, і це не теорія: `<scr<script>ipt>` після
 * однієї заміни лишає `<script>`, бо вирізаний шматок склеює краї.
 * Саме на це вказує CodeQL «Incomplete multi-character sanitization»
 * (2 high на цьому файлі, PR #855). У нашому випадку витягнутий текст
 * ніколи не рендериться — він іде в комірку сітки, — але тег, що пережив
 * чистку, псує РОЗБІР: залишковий `<td>` всередині значення зсуває
 * колонки. Тож фікс потрібен і для коректності, не лише щоб заспокоїти
 * сканер.
 *
 * Перевищення стелі — це відмова, а не «віддамо що вийшло»: рядок, який
 * після восьми проходів усе ще містить теги, не є штатною таблицею.
 */
function stripUntilStable(input: string, strip: (s: string) => string): string {
  let current = strip(input);
  for (let pass = 1; ; pass += 1) {
    const next = strip(current);
    if (next === current) return current;
    if (pass >= MAX_SANITIZE_PASSES) {
      throw new HtmlFormatError("HTML: розмітка не піддається чистці");
    }
    current = next;
  }
}

function removeScriptStyle(html: string): string {
  let out = "";
  let prev = 0;
  for (const el of scanElements(html, SCRIPT_STYLE_OPEN_RE, {
    ignoreCase: true,
  })) {
    out += html.slice(prev, el.start);
    prev = el.end;
  }
  return out + html.slice(prev);
}

/** Теги прибираються лише до останнього `>`: `<` у хвості без жодного `>`
 * праворуч тегом не стане, а регексп пробував би кожен такий `<` і
 * дочитував би хвіст до кінця (квадратичний CPU на `<<<<…`). */
function stripTags(s: string): string {
  const last = s.lastIndexOf(">");
  if (last === -1) return s;
  return s.slice(0, last + 1).replace(TAG_RE, "") + s.slice(last + 1);
}

function cellToText(html: string): string {
  // Тут нерухома точка настає вже на першому проході (`[^>]*` не
  // переступає через `>`, тож `<`, який пережив заміну, не має жодного
  // `>` праворуч), але цикл лишається спільним — і як гарантія для
  // сканера, і щоб дві чистки не розʼїхались.
  const withoutTags = stripUntilStable(html.replace(BR_RE, " "), stripTags);
  return decodeXmlEntities(
    // NBSP з `&nbsp;` вже розгорнутий у пробіл; лишається літеральний
    // U+00A0, яким часто розділяють тисячі.
    withoutTags.replace(/\u00A0/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Витягує всі `<tr>` документа в порядку появи. `colspan` розгортається
 * порожніми клітинками — інакше колонки праворуч від обʼєднаної шапки
 * зʼїхали б відносно рядків даних.
 *
 * Кидає `HtmlFormatError`, якщо чистка розмітки не сходиться за
 * `MAX_SANITIZE_PASSES` проходів. `maxRows` обриває розбір, щойно
 * стільки рядків набрано: решту файлу викликач однаково відкине.
 */
export function htmlTableToGrid(
  html: string,
  maxRows = Number.POSITIVE_INFINITY,
): string[][] {
  // Так само до нерухомої точки: вкладений `<script>` усередині
  // `<script>` пережив би один прохід (див. `stripUntilStable`).
  const cleaned = stripUntilStable(html, removeScriptStyle);
  const rows: string[][] = [];

  for (const tr of scanElements(cleaned, TR_OPEN_RE, { ignoreCase: true })) {
    if (rows.length >= maxRows) break;
    const cells: string[] = [];
    for (const cell of scanElements(tr.body ?? "", CELL_OPEN_RE, {
      ignoreCase: true,
    })) {
      const attrs = cell.attrs;
      cells.push(cellToText(cell.body ?? ""));
      // HTML дозволяє і подвійні, і одинарні лапки, і зовсім без них
      // (`colspan='3'` трапляється в експортах). Без одинарних лапок
      // атрибут не читався, порожні клітинки не додавались — і всі
      // колонки праворуч від обʼєднаної шапки зʼїжджали.
      const span = Number(
        /\bcolspan\s*=\s*["']?(\d+)["']?/i.exec(attrs)?.[1] ?? "1",
      );
      for (let i = 1; i < span && i < 64; i += 1) cells.push("");
    }
    // Рядок-обгортка вкладеної таблиці не має власних `<td>` на своєму
    // рівні — вкидати порожній рядок у сітку немає сенсу.
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}
