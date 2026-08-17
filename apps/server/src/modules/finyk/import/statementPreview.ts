import type { Request, Response } from "express";
import { parseBody } from "../../../http/validate.js";
import {
  ImportStatementPreviewRequestSchema,
  ImportStatementPreviewResponseSchema,
} from "@sergeant/shared";
import type { ImportSkippedRow, ImportStatementRow } from "@sergeant/shared";
import {
  detectDelimiter,
  isBlankRow,
  parseCalendarDateKey,
  parseSignedAmountKopiykas,
  tokenizeCsv,
} from "./csvParser.js";
import {
  detectCsvProfile,
  isUahCurrencyValue,
  resolveCustomMapping,
  type ResolvedColumnMapping,
} from "./csvProfiles.js";

/** Spec § Фаза 2 «Автопрофілі + column-mapper»: "preview перших 5 рядків". */
const SAMPLE_ROWS_LIMIT = 5;

interface ClassifiedRows {
  rows: ImportStatementRow[];
  skipped: ImportSkippedRow[];
}

/**
 * Класифікує кожен рядок даних (без заголовка) через резолвлений
 * column-mapping. Порядок перевірок навмисний (структурне спершу,
 * семантичне потім): `empty` → `unparsed_date` → `not_uah` →
 * `unparsed_amount` — рядок з кількома проблемами одразу отримує
 * найбільш "кореневу" причину, а не випадкову залежно від порядку колонок.
 */
function classifyRows(
  dataRows: string[][],
  mapping: ResolvedColumnMapping,
): ClassifiedRows {
  const rows: ImportStatementRow[] = [];
  const skipped: ImportSkippedRow[] = [];

  dataRows.forEach((row, idx) => {
    const line = idx + 2; // 1-based; рядок 1 — заголовок (spec: line = токенізований номер рядка).

    if (isBlankRow(row)) {
      skipped.push({ line, reason: "empty" });
      return;
    }

    const dateRaw = row[mapping.dateColIndex] ?? "";
    const amountRaw = row[mapping.amountColIndex] ?? "";
    const descriptionRaw = row[mapping.descriptionColIndex] ?? "";

    if (!dateRaw.trim() && !amountRaw.trim() && !descriptionRaw.trim()) {
      // Рядок несе дані в ІНШИХ колонках (напр. MCC-only службовий рядок),
      // але жодна з трьох мапованих — непридатний так само, як фізично
      // порожній рядок.
      skipped.push({ line, reason: "empty" });
      return;
    }

    const date = parseCalendarDateKey(dateRaw, mapping.dateFormat);
    if (!date) {
      skipped.push({ line, reason: "unparsed_date" });
      return;
    }

    if (mapping.currencyColIndex !== null) {
      const currencyRaw = row[mapping.currencyColIndex] ?? "";
      if (currencyRaw.trim() && !isUahCurrencyValue(currencyRaw)) {
        skipped.push({ line, reason: "not_uah" });
        return;
      }
    }

    const signed = parseSignedAmountKopiykas(amountRaw, {
      decimalComma: mapping.decimalComma,
    });
    // `signed === 0` теж skip: rowKey/commit контракт вимагає направлену
    // (`expense`|`income`) додатну суму — нульова транзакція не має
    // жодного з двох напрямів і найчастіше сама по собі є ознакою
    // нерозпізнаного/службового рядка, не легітимним платежем.
    if (signed === null || signed === 0) {
      skipped.push({ line, reason: "unparsed_amount" });
      return;
    }

    rows.push({
      date,
      amountKopiykas: Math.abs(signed),
      direction: signed < 0 ? "expense" : "income",
      description: descriptionRaw.trim(),
    });
  });

  return { rows, skipped };
}

/**
 * POST /api/finyk/import/statement/preview — CSV-only (XLS/XLSX/PDF
 * відкладено, спека § Фаза 2б/2в) парсинг банківської виписки. БЕЗ запису
 * в БД — commit відбувається окремим `POST /api/finyk/import/commit`.
 *
 * Потік: детект розділювача → токенізація → автопрофіль (mono/Privat24)
 * за заголовком; якщо не збігся — клієнтський `mapping` (якщо даний і
 * резолвиться на реальні заголовки) → `profile: 'custom'`; інакше —
 * `needsMapping: true` + `headers`/`sampleRows` для ручного column-mapper.
 *
 * Автопрофіль МАЄ пріоритет над клієнтським `mapping`, коли обидва
 * присутні: якщо заголовки одного разу впізнані як mono/Privat24, довіра
 * до вбудованої мапи вища за довільний mapping (UI в принципі не мав би
 * показувати mapper, коли preview вже повернув автопрофіль на
 * попередньому виклику — це defensive-порядок для повторного виклику з
 * застарілим тілом, не очікуваний UX-шлях).
 */
export default async function statementPreviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { csv_text, mapping } = parseBody(
    ImportStatementPreviewRequestSchema,
    req,
  );

  const firstNewlineIdx = csv_text.indexOf("\n");
  const headerLine =
    firstNewlineIdx === -1 ? csv_text : csv_text.slice(0, firstNewlineIdx);
  const delimiter = detectDelimiter(headerLine);

  const allRows = tokenizeCsv(csv_text, delimiter);
  const headerRow = allRows[0] ?? [];
  const dataRows = allRows.slice(1);
  const headers = headerRow.map((h) => h.trim());

  const autodetected = detectCsvProfile(headers);
  if (autodetected) {
    const { rows, skipped } = classifyRows(dataRows, autodetected.mapping);
    res.status(200).json(
      ImportStatementPreviewResponseSchema.parse({
        profile: autodetected.profile,
        needsMapping: false,
        rows,
        skipped,
      }),
    );
    return;
  }

  if (mapping) {
    const resolved = resolveCustomMapping(headers, mapping);
    if (resolved) {
      const { rows, skipped } = classifyRows(dataRows, resolved);
      res.status(200).json(
        ImportStatementPreviewResponseSchema.parse({
          profile: "custom",
          needsMapping: false,
          rows,
          skipped,
        }),
      );
      return;
    }
    // mapping даний, але жодна з трьох колонок не знайдена серед
    // фактичних headers (застарілий mapping / інший файл) — падаємо
    // назад у needsMapping, а не мовчки повертаємо 0 рядків.
  }

  res.status(200).json(
    ImportStatementPreviewResponseSchema.parse({
      profile: null,
      needsMapping: true,
      headers,
      sampleRows: dataRows.slice(0, SAMPLE_ROWS_LIMIT),
      rows: [],
      skipped: [],
    }),
  );
}
