import { decodeXmlEntities } from "./xlsxGrid.js";

/**
 * HTML-таблиця → сітка `string[][]`.
 *
 * AI-CONTEXT: це не «підтримка HTML заради HTML». Частина українських
 * банків (історично — Privat24) віддає кнопку «Експорт в Excel», яка
 * насправді віддає HTML-таблицю з розширенням `.xls`. Excel таке
 * відкриває, `xlsxToGrid` — ні (це не ZIP), і без цієї гілки такий файл
 * упирався б у помилку «старий формат .xls», хоча читається тривіально.
 *
 * Свідомо НЕ повноцінний HTML-парсер: банківський експорт — це плаский
 * `<table>` без JS. Вкладені таблиці (layout-обгортки) розкладаються в
 * плоский список `<tr>`, а зайві рядки-обгортки потім відсіює
 * `locateHeaderRow` у `statementFile.ts` — той самий механізм, що вже
 * потрібен для преамбули XLSX-виписок.
 */

const TR_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BR_RE = /<br\s*\/?>/gi;

/** Чи схожий текст на HTML-документ із таблицею (детект іде ДО парсингу —
 * дешевий тест на `<table` в перших кілобайтах). */
export function looksLikeHtmlTable(text: string): boolean {
  return /<table\b/i.test(text.slice(0, 64 * 1024));
}

/** Скільки разів поспіль дозволено чистити рядок до нерухомої точки.
 * Реальний банківський експорт стабілізується на ПЕРШОМУ проході; більше
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
 * після восьми проходів усе ще містить теги, не є банківською випискою.
 */
function stripUntilStable(input: string, pattern: RegExp): string {
  let current = input.replace(pattern, "");
  for (let pass = 1; ; pass += 1) {
    const next = current.replace(pattern, "");
    if (next === current) return current;
    if (pass >= MAX_SANITIZE_PASSES) {
      throw new HtmlFormatError("HTML: розмітка не піддається чистці");
    }
    current = next;
  }
}

function cellToText(html: string): string {
  // Тут нерухома точка настає вже на першому проході (`[^>]*` не
  // переступає через `>`, тож `<`, який пережив заміну, не має жодного
  // `>` праворуч), але цикл лишається спільним — і як гарантія для
  // сканера, і щоб дві чистки не розʼїхались.
  const withoutTags = stripUntilStable(html.replace(BR_RE, " "), /<[^>]*>/g);
  return decodeXmlEntities(
    // NBSP з `&nbsp;` вже розгорнутий у пробіл; лишається літеральний
    // U+00A0, яким банки розділяють тисячі.
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
 * `MAX_SANITIZE_PASSES` проходів.
 */
export function htmlTableToGrid(html: string): string[][] {
  // Так само до нерухомої точки: вкладений `<script>` усередині
  // `<script>` пережив би один прохід (див. `stripUntilStable`).
  const cleaned = stripUntilStable(html, SCRIPT_STYLE_RE);
  const rows: string[][] = [];
  let trMatch: RegExpExecArray | null;
  TR_RE.lastIndex = 0;

  while ((trMatch = TR_RE.exec(cleaned)) !== null) {
    const body = trMatch[1] ?? "";
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    CELL_RE.lastIndex = 0;
    while ((cellMatch = CELL_RE.exec(body)) !== null) {
      const attrs = cellMatch[2] ?? "";
      cells.push(cellToText(cellMatch[3] ?? ""));
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
