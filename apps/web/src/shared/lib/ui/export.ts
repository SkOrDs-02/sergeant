/**
 * Data Export Utilities — CSV & PDF generation for reports.
 */

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
  URL.revokeObjectURL(url);
}

/**
 * Exports data as CSV file.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string = "export.csv",
): void {
  const csv = arrayToCSV(data, columns);
  downloadString(csv, filename, "text/csv");
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
        ${footerText || `Згенеровано ${new Date().toLocaleDateString("uk-UA")} о ${new Date().toLocaleTimeString("uk-UA")}`}
      </div>
    </body>
    </html>
  `;
}

/**
 * Opens a print dialog for PDF generation.
 */
export function exportToPDF(options: PDFReportOptions): void {
  const html = generatePDFReport(options);
  const printWindow = window.open("", "_blank");

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }
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
