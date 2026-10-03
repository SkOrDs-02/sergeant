import type { Request, Response } from "express";
import pool from "../../../db.js";
import { parseBody } from "../../../http/validate.js";
import { ValidationError } from "../../../obs/errors.js";
import {
  ImportStatementPreviewRequestSchema,
  ImportStatementPreviewResponseSchema,
} from "@sergeant/shared";
import type { ImportSkippedRow, ImportStatementRow } from "@sergeant/shared";
import { isBlankRow, parseCalendarDateKey } from "@sergeant/tabular-import";
import { isLikelyOwnTransfer } from "./transferDetect.js";
import { markDuplicateLikely } from "./duplicateDetect.js";
import { parseSignedAmountKopiykas } from "./csvParser.js";
import {
  detectCsvProfile,
  isUahCurrencyValue,
  resolveCustomMapping,
  withAutodetectedFormats,
  type ResolvedColumnMapping,
} from "./csvProfiles.js";
import { resolveCategoryHint } from "./categoryHint.js";
import {
  gridFromCsvText,
  gridFromStatementFile,
  type StatementGrid,
} from "./statementFile.js";

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
  headerRowIndex = 0,
): ClassifiedRows {
  const rows: ImportStatementRow[] = [];
  const skipped: ImportSkippedRow[] = [];

  dataRows.forEach((row, idx) => {
    // 1-based номер у ФАЙЛІ, а не в зрізі даних: заголовок таблиці не
    // завжди перший рядок (преамбула «Виписка за період…» у XLSX/HTML —
    // `statementFile.ts#locateHeaderRow`), і без цього зсуву «пропущено
    // рядок 4» вказувало б людині не туди.
    const line = headerRowIndex + idx + 2;

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

    const description = descriptionRaw.trim();
    const direction = signed < 0 ? "expense" : "income";
    // Категорія-підказка: власна колонка банку → MCC → ключові слова
    // опису (`categoryHint.ts`). `null` = доказів немає, поле не йде в
    // відповідь узагалі, і клієнт підставляє свій дефолт.
    const categoryHint = resolveCategoryHint({
      direction,
      ...(mapping.categoryColIndex !== null
        ? { bankCategory: row[mapping.categoryColIndex] ?? "" }
        : {}),
      ...(mapping.mccColIndex !== null
        ? { mcc: row[mapping.mccColIndex] ?? "" }
        : {}),
      description,
    });
    rows.push({
      date,
      amountKopiykas: Math.abs(signed),
      direction,
      description,
      // Лише true, без false — поле опційне у схемі, відсутність = «не
      // схожий на переказ» (див. transferLikelySchema у @sergeant/shared).
      ...(isLikelyOwnTransfer(description) ? { transferLikely: true } : {}),
      ...(categoryHint ? { categoryHint } : {}),
    });
  });

  return { rows, skipped };
}

/**
 * Кап на кількість data-рядків preview (ревʼю PR #818): байтовий ліміт
 * входу не обмежує кількість рядків, а відповідь несе обʼєкт на кожен.
 * Річна виписка — тисячі рядків; 10k — межа з запасом, далі просимо
 * розбити файл.
 */
const MAX_PREVIEW_DATA_ROWS = 10_000;

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Base64 → байти. `Buffer.from(..., "base64")` мовчки ковтає сміття
 * (невалідні символи просто ігноруються), тож валідність перевіряємо
 * round-trip-ом довжини — інакше «файл» із випадкового тексту дійшов би
 * до парсера і зламався б там уже незрозумілою помилкою.
 */
function decodeBase64File(b64: string): Buffer {
  const cleaned = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new ValidationError("Не вдалося прочитати файл.");
  }
  return Buffer.from(cleaned, "base64");
}

/** Сітка + її межі: спільний вхід для обох гілок контракту запиту. */
function buildGrid(input: {
  csvText: string | undefined;
  fileBase64: string | undefined;
}): StatementGrid {
  if (input.fileBase64 !== undefined) {
    return gridFromStatementFile(decodeBase64File(input.fileBase64));
  }
  const text = input.csvText ?? "";
  // Дешевий pre-check ДО токенізації (раунд 5 ревʼю): токенізованих
  // рядків не може бути більше, ніж `\n`+1, тож свідомо завеликий вхід
  // відкидається без оплати повного парсингу 5MB. NB: closing-quote
  // переноси всередині полів роблять цю оцінку ВЕРХНЬОЮ межею — фінальна
  // перевірка по dataRows.length нижче лишається авторитетною.
  let newlineCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) newlineCount += 1;
  }
  if (newlineCount > MAX_PREVIEW_DATA_ROWS) {
    throw new ValidationError(
      `Виписка завелика: понад ${MAX_PREVIEW_DATA_ROWS} рядків. Розбий файл на менші періоди.`,
    );
  }
  return gridFromCsvText(text);
}

/**
 * POST /api/finyk/import/statement/preview — парсинг банківської виписки
 * БЕЗ запису в БД (commit — окремий `POST /api/finyk/import/commit`).
 *
 * Приймає або готовий текст (`csv_text`), або сам файл (`file_base64`):
 * XLSX, HTML-таблицю під виглядом `.xls` і текстовий CSV у будь-якому
 * кодуванні — детект за magic-байтами в `statementFile.ts`, не за
 * розширенням. PDF і бінарний Excel 97 віддають зрозумілу відмову з
 * інструкцією, а не порожній результат.
 *
 * Потік: файл/текст → сітка + рядок-заголовок → автопрофіль
 * (mono/Privat24) за заголовком; якщо не збігся — клієнтський `mapping`
 * (якщо даний і резолвиться на реальні заголовки) → `profile: 'custom'`;
 * інакше — `needsMapping: true` + `headers`/`sampleRows` для ручного
 * column-mapper.
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
  const userId = (req as WithSessionUser).user!.id;
  const { csv_text, file_base64, mapping } = parseBody(
    ImportStatementPreviewRequestSchema,
    req,
  );

  const grid = buildGrid({ csvText: csv_text, fileBase64: file_base64 });
  const headerRow = grid.rows[grid.headerRowIndex] ?? [];
  const dataRows = grid.rows.slice(grid.headerRowIndex + 1);
  const headers = headerRow.map((h) => h.trim());

  if (dataRows.length > MAX_PREVIEW_DATA_ROWS) {
    throw new ValidationError(
      `Виписка завелика: ${dataRows.length} рядків (максимум ${MAX_PREVIEW_DATA_ROWS}). Розбий файл на менші періоди.`,
    );
  }

  const autodetected = detectCsvProfile(headers);
  if (autodetected) {
    // Сітка з ТИПІЗОВАНИХ клітинок XLSX уже несе канонічні дату й суму,
    // тож друковані підказки профілю тут шкодять, а не допомагають
    // (`csvProfiles.ts#withAutodetectedFormats`).
    const profileMapping =
      grid.sourceKind === "sheet"
        ? withAutodetectedFormats(autodetected.mapping)
        : autodetected.mapping;
    const { rows, skipped } = classifyRows(
      dataRows,
      profileMapping,
      grid.headerRowIndex,
    );
    res.status(200).json(
      ImportStatementPreviewResponseSchema.parse({
        profile: autodetected.profile,
        needsMapping: false,
        // «Сітка 2» дедуп-превʼю (duplicateDetect.ts): мʼяка мітка
        // «схоже, вже є» за трійкою дата+сума+напрям проти вже збережених
        // витрат — до того, як людина побачить галочки.
        rows: await markDuplicateLikely(pool, userId, rows),
        skipped,
      }),
    );
    return;
  }

  if (mapping) {
    const resolved = resolveCustomMapping(headers, mapping);
    if (resolved) {
      const { rows, skipped } = classifyRows(
        dataRows,
        resolved,
        grid.headerRowIndex,
      );
      res.status(200).json(
        ImportStatementPreviewResponseSchema.parse({
          profile: "custom",
          needsMapping: false,
          rows: await markDuplicateLikely(pool, userId, rows),
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
