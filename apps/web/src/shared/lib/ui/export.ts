/**
 * Data Export Utilities — CSV & PDF generation for reports.
 */
import { formatDateNumeric } from "@shared/lib/time/formatDate";
import { isIOSStandalonePWA } from "@shared/lib/platform/iosStandalone";

export interface ExportColumn<T> {
  key: keyof T | string;
  header: string;
  /** Custom value formatter */
  format?: (value: unknown, row: T) => string | number;
}

/**
 * Converts data array to CSV string.
 */
export function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  options: { separator?: string; includeHeader?: boolean } = {},
): string {
  const { separator = ",", includeHeader = true } = options;

  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? "");
    if (str.includes(separator) || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(columns.map((col) => escapeCSV(col.header)).join(separator));
  }

  for (const row of data) {
    const values = columns.map((col) => {
      const value = getColumnValue(row, col.key);
      if (col.format) {
        return escapeCSV(col.format(value, row));
      }
      return escapeCSV(value);
    });
    lines.push(values.join(separator));
  }

  return lines.join("\n");
}

function getNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function getColumnValue<T extends Record<string, unknown>>(
  row: T,
  key: ExportColumn<T>["key"],
): unknown {
  if (typeof key === "string" && key.includes(".")) {
    return getNestedValue(row, key);
  }
  return row[key as keyof T];
}

/**
 * Скільки blob-URL лишається живим після кліку по `<a download>`, мс.
 *
 * AI-CONTEXT: до 2026-10-01 `URL.revokeObjectURL` ішов одразу за `click()`.
 * Chromium читає blob синхронно під час кліку, а iOS Safari/PWA віддає його
 * системі (Files, лист «Поділитись») ПІСЛЯ повернення з обробника: відкликаний
 * URL тоді вказує в нікуди, навігація зависає, і застосунок виглядає
 * завислим (тост «Вивантажено операцій…» не зникає, нав перезавантажує
 * Операції — звіт власника з iOS PWA). Відкликати треба, бо URL тримає blob у
 * памʼяті до закриття вкладки; хвилина дає системі час забрати файл.
 */
const BLOB_URL_REVOKE_DELAY_MS = 60_000;

/**
 * Downloads a string as a file.
 */
export function downloadString(
  content: string,
  filename: string,
  mimeType: string = "text/plain",
): void {
  const blob = new Blob(["\uFEFF" + content], {
    type: `${mimeType};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Не одразу: див. `BLOB_URL_REVOKE_DELAY_MS`.
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
}

/**
 * Чим закінчилась віддача файла.
 *
 * - `shared` — файл віддано в системне «Поділитись» (iOS PWA);
 * - `downloaded` — спрацювало звичайне завантаження (`<a download>`);
 * - `cancelled` — людина закрила аркуш «Поділитись» без вибору. Це не збій
 *   і не успіх: тост «Вивантажено…» тут не доречний.
 */
export type FileDeliveryResult = "shared" | "downloaded" | "cancelled";

/**
 * Віддає рядок як файл людині.
 *
 * AI-CONTEXT (2026-10-01, звіт власника: тап «Вивантажити» в застосунку з
 * іконки на iPhone): у standalone-PWA на iOS `<a download>` з blob-URL не
 * качає файл, а ВОДИТЬ сам застосунок на blob — без кнопки «назад», тож
 * він виглядає завислим (тост не зникає, нав перезавантажує Операції).
 * Відкладене `revokeObjectURL` це не лікує. Там єдиний чесний шлях —
 * системне «Поділитись» (`navigator.share` з файлом): аркуш пропонує
 * «Зберегти у Файли», і застосунок нікуди не йде.
 *
 * Правила:
 *  - «Поділитись» лише в iOS standalone-PWA і лише коли `canShare({ files })`
 *    підтверджує, що браузер візьме цей файл; скрізь інде — звичайне
 *    завантаження, як і раніше;
 *  - закриття аркуша (`AbortError`) — тиха відмова, `cancelled`;
 *  - будь-яка інша відмова `share` (нема активації жесту, тип не
 *    підтримано) — фолбек на завантаження, а не втрачений експорт;
 *  - `navigator.share` викликається СИНХРОННО на початку функції: iOS
 *    вимагає активації жесту, і будь-який `await` до виклику її з'їдає.
 *    Тому викликай це з обробника кліку, не після мережевого запиту.
 */
export async function saveStringAsFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain",
): Promise<FileDeliveryResult> {
  if (
    isIOSStandalonePWA() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    // BOM лишається: Excel без нього читає UTF-8 як Windows-1251.
    const file = new File(["\uFEFF" + content], filename, { type: mimeType });
    let canShare = false;
    try {
      canShare = navigator.canShare({ files: [file] });
    } catch {
      canShare = false;
    }
    if (canShare) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (error) {
        // За імʼям, а не `instanceof`: DOMException може прийти з іншого
        // realm-а й не бути нащадком `Error` у цьому.
        if ((error as { name?: unknown } | null)?.name === "AbortError") {
          return "cancelled";
        }
        // Інша відмова — падаємо в завантаження нижче.
      }
    }
  }
  downloadString(content, filename, mimeType);
  return "downloaded";
}

/**
 * Exports data as CSV file (системне «Поділитись» в iOS PWA, інакше
 * завантаження — див. {@link saveStringAsFile}).
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string = "export.csv",
): Promise<FileDeliveryResult> {
  const csv = arrayToCSV(data, columns);
  return saveStringAsFile(csv, filename, "text/csv");
}

/**
 * Generates a simple HTML report for printing to PDF.
 */
export interface PDFReportSection {
  title: string;
  content: string | HTMLElement;
}

export interface PDFReportOptions {
  title: string;
  subtitle?: string;
  sections: PDFReportSection[];
  theme?: "light" | "dark";
  logo?: string;
  footerText?: string;
}

export function generatePDFReport(options: PDFReportOptions): string {
  const {
    title,
    subtitle,
    sections,
    theme = "light",
    logo,
    footerText,
  } = options;

  const isDark = theme === "dark";
  const bgColor = isDark ? "#1a1a1a" : "#ffffff";
  const textColor = isDark ? "#e5e5e5" : "#1a1a1a";
  const mutedColor = isDark ? "#888888" : "#666666";
  const borderColor = isDark ? "#333333" : "#e5e5e5";

  return `
    <!DOCTYPE html>
    <html lang="uk">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 20mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          background: ${bgColor};
          color: ${textColor};
          padding: 24px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
          padding-bottom: 16px;
          border-bottom: 1px solid ${borderColor};
        }
        .header-content {
          flex: 1;
        }
        .logo {
          width: 48px;
          height: 48px;
          margin-left: 16px;
        }
        h1 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .subtitle {
          font-size: 14px;
          color: ${mutedColor};
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid ${borderColor};
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        th, td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid ${borderColor};
        }
        th {
          font-weight: 600;
          background: ${isDark ? "#252525" : "#f5f5f5"};
        }
        tr:nth-child(even) {
          background: ${isDark ? "#202020" : "#fafafa"};
        }
        .footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid ${borderColor};
          font-size: 12px;
          color: ${mutedColor};
          text-align: center;
        }
        @media print {
          body {
            padding: 0;
          }
          .section {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-content">
          <h1>${title}</h1>
          ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
        </div>
        ${logo ? `<img src="${logo}" alt="Logo" class="logo">` : ""}
      </div>

      ${sections
        .map(
          (section) => `
        <div class="section">
          <h2 class="section-title">${section.title}</h2>
          <div class="section-content">
            ${typeof section.content === "string" ? section.content : section.content.outerHTML}
          </div>
        </div>
      `,
        )
        .join("")}

      <div class="footer">
        ${footerText || `Згенеровано ${formatDateNumeric(new Date())} о ${new Date().toLocaleTimeString("uk-UA")}`}
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates HTML table from data for PDF reports.
 */
export function dataToHTMLTable<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
): string {
  const headers = columns.map((col) => `<th>${col.header}</th>`).join("");

  const rows = data.map((row) => {
    const cells = columns.map((col) => {
      const value = getColumnValue(row, col.key);
      if (col.format) {
        return `<td>${col.format(value, row)}</td>`;
      }
      return `<td>${value ?? ""}</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });

  return `
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}
