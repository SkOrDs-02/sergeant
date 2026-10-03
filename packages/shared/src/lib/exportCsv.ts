/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Побудова CSV із серверного експорту акаунта.
 *
 * Рішення founder-а 2026-07-25 (#5): **«CSV і JSON разом. Таблиця — щоб
 * подивитись, повний файл — щоб перевезти.»** Тобто в цих двох форматів
 * різні задачі, і CSV свідомо НЕ намагається бути lossless: вкладені
 * структури згортаються в JSON-рядок, бо в таблиці їх усе одно не читають.
 * Перевозити дані — робота JSON-експорту, який лишається без змін.
 *
 * AI-DANGER: **BOM тут НЕ додається — і це навмисно.** Без BOM Excel читає
 * UTF-8 як cp1251 і вся кирилиця стає кракозябрами, тобто CSV перестає
 * виконувати єдину задачу, заради якої існує. Але BOM уже додає транспорт:
 * `apps/web/src/shared/lib/ui/export.ts::downloadString` клеїть `\uFEFF`
 * перед вмістом для БУДЬ-ЯКОГО файлу. Другий BOM тут дав би у Excel зайвий
 * видимий символ на початку першої клітинки.
 *
 * Тобто відповідальність розділена: цей модуль будує рядок, транспорт
 * відповідає за кодування. Якщо колись зʼявиться інший спосіб віддати файл
 * (серверний endpoint, share-sheet мобілки) — BOM додає ВІН, а не ця
 * функція.
 */

/** Один рядок таблиці. Значення довільні — приходять із серверного експорту. */
export type ExportRow = Record<string, unknown>;

/** Іменована секція: назва таблиці + її рядки. */
export interface ExportCsvSection {
  name: string;
  rows: readonly ExportRow[];
}

/**
 * UTF-8 BOM — експортується для тестів і для тих транспортів, що його ще не
 * додають. `buildExportCsv` його НЕ вставляє (див. AI-DANGER вище).
 */
export const CSV_BOM = "﻿";

/**
 * Екранує одне значення за RFC 4180.
 *
 * Лапки подвоюються, а обгортаються лише ті значення, що містять роздільник,
 * лапку чи перенос рядка. Обгортати все підряд теж валідно, але тоді файл
 * гірше читається оком — а це єдина причина, з якої CSV тут існує.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (raw === "") return "";
  // Formula injection: рядок, що починається з = + - @, Excel виконує як
  // формулу. У наших даних це цілком реальне — опис транзакції «=1+1» або
  // назва боргу «-Іван». Префікс `'` знешкоджує, лишаючись видимим.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Колонки секції — **обʼєднання** ключів усіх рядків, у порядку першої
 * появи.
 *
 * Брати ключі лише з першого рядка було б швидше й тихо губило б дані:
 * записи в експорті — це `Record<string, unknown>` з різних таблиць, і
 * необовʼязкове поле, відсутнє в першому рядку, зникло б для всіх.
 */
export function collectColumns(rows: readonly ExportRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function sectionToCsv(section: ExportCsvSection): string[] {
  const lines: string[] = [`# ${section.name}`];
  if (section.rows.length === 0) {
    lines.push("(порожньо)");
    return lines;
  }
  const columns = collectColumns(section.rows);
  lines.push(columns.map(escapeCsvValue).join(","));
  for (const row of section.rows) {
    lines.push(columns.map((c) => escapeCsvValue(row[c])).join(","));
  }
  return lines;
}

/**
 * Збирає багатосекційний CSV.
 *
 * Секції розділені порожнім рядком і заголовком `# назва`. Це не канонічний
 * CSV — канонічний тримає одну таблицю на файл, — але альтернативи гірші:
 * ZIP із багатьох файлів потребує бібліотеки в бандлі (а бюджет web-у
 * гейтиться в CI), а кілька окремих завантажень підряд браузери блокують
 * як підозрілі. Для задачі «подивитись» один файл із підписаними секціями
 * читається краще за все перелічене.
 *
 * Порожні секції лишаються у файлі навмисно: відсутність рядка «підписки»
 * і рядок «підписки: порожньо» — різні повідомлення, і друге чесніше.
 */
export function buildExportCsv(sections: readonly ExportCsvSection[]): string {
  const body = sections.map((s) => sectionToCsv(s).join("\n")).join("\n\n");
  return body + "\n";
}
