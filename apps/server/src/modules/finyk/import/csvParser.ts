import { boundedDayKeySchema } from "@sergeant/shared";

/**
 * CSV-only tokenizer + примітиви парсингу (дата/сума) для «Масового
 * ведення» (`statementPreview.ts`, `csvProfiles.ts`).
 *
 * НАВМИСНО без залежності (`papaparse`/`csv-parse` тощо не в
 * `package.json` — перевірено перед написанням, task-brief прямо
 * забороняє додавати нові залежності для CSV-парсингу). Мінімальний,
 * цільовий парсер — той самий підхід, що `receipts/dpsXml.ts` для XML.
 */

// ─────────────────────── Delimiter detection ────────────────────────────

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;
export type CsvDelimiter = (typeof CANDIDATE_DELIMITERS)[number];

/** Рахує входження `ch` у `line`, ігноруючи те, що всередині лапок
 * (щоб кома в закавиченому описі не вплинула на детект розділювача). */
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
 * Визначає розділювач за заголовковим рядком: `,` / `;` / таб — те, що
 * зустрічається найчастіше поза лапками. Дефолт — кома (найпоширеніший
 * CSV-розділювач), якщо жоден кандидат не зустрівся.
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

// ─────────────────────────── Tokenizer ───────────────────────────────────

const BOM = String.fromCharCode(0xfeff);

/**
 * Мінімальний RFC4180-подібний токенізатор: підтримує закавичені поля з
 * embedded-роздільником/переносом рядка та подвоєні лапки (`""` → `"`).
 * CRLF і LF — обидва як межа рядка (лишній `\r` перед `\n` просто
 * ковтається; одиночний старий-Mac `\r`-без-`\n` НЕ підтримується —
 * жоден банк-експорт цим не користується).
 *
 * Повертає масив рядків (кожен — масив полів); порожні рядки в кінці
 * файлу (trailing newline) не породжують зайвого порожнього рядка.
 */
export function tokenizeCsv(text: string, delimiter: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(BOM.length) : text; // strip BOM
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
      i += 1; // swallow; `\n` (next char) does the actual row-split
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
  // Flush trailing field/row that wasn't terminated by a final newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Рядок токенізованого CSV, у якого всі поля порожні (або є лише один
 * порожній елемент) — стрій blank-рядок файлу, не дані. */
export function isBlankRow(row: string[]): boolean {
  return row.length === 0 || row.every((f) => f.trim() === "");
}

// ─────────────────────────── Amount parsing ──────────────────────────────

/**
 * Парсить підписану суму в KOPIYKAS з довільного банківського формату:
 * дот- чи кома-десятковий роздільник, пробіл/nbsp як роздільник тисяч,
 * опційний ведучий/хвостовий валютний маркер ("грн"/"UAH"), ведучий мінус
 * для витрати. Повертає `null`, якщо рядок не читається як число.
 *
 * `decimalComma`: `true` — форсує кому як десятковий роздільник (крапки
 * тоді трактуються як роздільник тисяч), `false` — форсує крапку,
 * `undefined` — автодетект (обидва присутні → останній за позицією
 * символ вважається десятковим, стандартна евристика; лише один
 * присутній → саме він десятковий).
 */
export function parseSignedAmountKopiykas(
  raw: string,
  opts: { decimalComma?: boolean | undefined } = {},
): number | null {
  let s = raw.trim();
  if (!s) return null;
  // Прибираємо пробіли/NBSP (типовий роздільник тисяч у excel-експортах)
  // і валютні суфікси/префікси захисно — автопрофілі не повинні їх
  // передавати, але кастомний mapping користувача може вказати на
  // колонку з "1 234,56 грн".
  s = s.replace(/[\s\u00A0]+/g, "").replace(/(uah|грн\.?)/gi, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized = s;
  if (opts.decimalComma === true) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (opts.decimalComma === false) {
    normalized = s.replace(/,/g, "");
  } else if (hasComma && hasDot) {
    normalized =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  }
  // dot-only чи без роздільника взагалі — лишаємо як є.

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// ─────────────────────────── Date parsing ────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Витягує календарну дату (день-ключ `YYYY-MM-DD`) з `DD.MM.YYYY` чи
 * `YYYY-MM-DD` (обидва — опційно з хвостовим часом, який ігнорується: ці
 * рядки несуть лише день, час CSV-виписки за spec-контрактом не входить
 * у `ImportStatementRowSchema`). `hint`, якщо заданий, форсує один із двох
 * форматів (обовʼязково для однозначно-амбівалентних дат типу
 * "01.02.2026" — 1 лютого чи 2 січня без mapping-підказки невідомо);
 * без `hint` — автодетект за роздільником (`-` → ISO, `.` → DD.MM.YYYY).
 *
 * Немає TZ-арифметики навмисно (ADR-0078 "Kyiv"-режим тут — не
 * `kyivWallClockToUtc`, а пряме зчитування цифр): дата на банківському
 * експорті/скріні вже надрукована в Kyiv wall-clock (той самий годинник,
 * що бачить користувач), тому конвертація не потрібна — лише
 * форматування/перевпорядкування цифр, які вже є.
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

  // Реальна календарна перевірка (ревʼю PR #818): «30.02» і «29.02» у
  // невисокосний рік проходили діапазонні межі вище — Date у UTC
  // round-trip-ом ловить неіснуючі дати без злих сюрпризів таймзон.
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
