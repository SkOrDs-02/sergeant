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

function cellToText(html: string): string {
  return decodeXmlEntities(
    html
      .replace(BR_RE, " ")
      .replace(/<[^>]*>/g, "")
      // NBSP з `&nbsp;` вже розгорнутий у пробіл; лишається літеральний
      // U+00A0, яким банки розділяють тисячі.
      .replace(/\u00A0/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Витягує всі `<tr>` документа в порядку появи. `colspan` розгортається
 * порожніми клітинками — інакше колонки праворуч від об'єднаної шапки
 * з'їхали б відносно рядків даних.
 */
export function htmlTableToGrid(html: string): string[][] {
  const cleaned = html.replace(SCRIPT_STYLE_RE, "");
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
      const span = Number(/\bcolspan\s*=\s*"?(\d+)"?/i.exec(attrs)?.[1] ?? "1");
      for (let i = 1; i < span && i < 64; i += 1) cells.push("");
    }
    // Рядок-обгортка вкладеної таблиці не має власних `<td>` на своєму
    // рівні — вкидати порожній рядок у сітку немає сенсу.
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}
