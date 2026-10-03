import { boundedDayKeySchema } from "@sergeant/shared";

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;
export type CsvDelimiter = (typeof CANDIDATE_DELIMITERS)[number];

/** Рахує входження `ch` у `line`, ігноруючи значення всередині лапок. */
function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ch) count++;
  }
  return count;
}

/**
 * Визначає розділювач за рядком: `,` / `;` / таб. Дефолт - кома, якщо
 * жоден кандидат не зустрівся.
 */
export function detectDelimiter(headerLine: string): CsvDelimiter {
  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const count = countOutsideQuotes(headerLine, d);
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

const BOM = String.fromCharCode(0xfeff);

/**
 * Мінімальний RFC4180-подібний токенізатор: підтримує закавичені поля з
 * embedded-роздільником/переносом рядка та подвоєні лапки (`""` -> `"`).
 * CRLF і LF - обидва як межа рядка.
 */
export function tokenizeCsv(text: string, delimiter: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Рядок, у якого всі поля порожні або складаються лише з whitespace. */
export function isBlankRow(row: string[]): boolean {
  return row.length === 0 || row.every((f) => f.trim() === "");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Витягує календарну дату `YYYY-MM-DD` з `DD.MM.YYYY` чи `YYYY-MM-DD`.
 * Хвостовий час ігнорується, бо результатом є саме day-key.
 */
export function parseCalendarDateKey(
  raw: string,
  hint?: "DD.MM.YYYY" | "YYYY-MM-DD",
): string | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;

  if (hint === "YYYY-MM-DD" && iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (hint === "DD.MM.YYYY" && dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (!hint && iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (!hint && dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    return null;
  }

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const key = `${year}-${pad2(month)}-${pad2(day)}`;
  return boundedDayKeySchema.safeParse(key).success ? key : null;
}
