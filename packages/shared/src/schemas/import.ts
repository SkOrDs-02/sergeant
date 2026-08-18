import { z } from "zod";
import { AMOUNT_MINOR_MAX, boundedDayKeySchema } from "./bounds";

/**
 * Zod-схеми для «Масового ведення» (receipt-scan spec § Фаза 2а/2б) —
 * `apps/server/src/modules/finyk/import/`.
 *
 * SSOT pattern for AGENTS.md Hard Rule #3 — server serializer ↔ api-client
 * types ↔ contract test рухаються разом. Сервер валідує кожну відповідь
 * через `.parse()` цих схем безпосередньо перед `res.json()`.
 *
 * Спека: `docs/90-work/planning/specs/receipt-scan.md` § «Фаза 2 — Масове
 * ведення» → «API-контракт Фази 2». Money-інваріант: суми — **kopiykas як
 * number**, ніколи bigint-рядок (Hard Rule #1).
 *
 * Скоуп цього slice (Stage 2B, узгоджено з оркестратором — деталі у
 * server-agent звіті): скрін банкінгу (vision) + виписка CSV (структурний
 * парсер + автопрофілі mono/Privat24) + commit/undo журналу батчів.
 * Batch-чеки (N × v1 `receipts/analyze`+`receipts`) і XLS/XLSX/PDF —
 * НЕ в цьому файлі (відкладено, § деталі в звіті сервер-агента).
 */

// ─────────────────────────── Спільне ────────────────────────────────────

/** Джерела, які приймає `POST /api/finyk/import/commit` у цьому slice. */
export const IMPORT_SOURCES = ["bank_screenshot", "bank_statement"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const ImportDirectionSchema = z.enum(["expense", "income"]);
export type ImportDirection = z.infer<typeof ImportDirectionSchema>;

/** Сума одного рядка імпорту — завжди ДОДАТНА величина (напрям несе окреме
 * поле `direction`, не знак), на відміну від `mono_transaction.amount`
 * (signed bigint) чи чекових позицій (можуть бути 0/від'ємні). */
export const importAmountKopiykasSchema = z
  .number()
  .int()
  .min(1)
  .max(AMOUNT_MINOR_MAX);

// ─────────────── POST /api/finyk/import/screenshot/analyze ─────────────
// Дзеркалить `ReceiptAnalyzeRequestSchema` (receipts.ts) — той самий
// `validateImageBase64` (5MB) контракт на server-боці, той самий
// snake_case тіла запиту.
export const ImportScreenshotAnalyzeRequestSchema = z
  .object({
    image_base64: z
      .string()
      .min(100, "Порожнє зображення")
      .max(7_000_000, "Зображення завелике"),
    mime_type: z
      .string()
      .regex(/^image\/[a-z+.-]+$/i)
      .max(64)
      .optional(),
  })
  .strict();
export type ImportScreenshotAnalyzeRequest = z.infer<
  typeof ImportScreenshotAnalyzeRequestSchema
>;

/** `receipt`/`other` — рядки vision однаково може не дати (промпт просить
 * порожній масив), тому rows завжди `[]`-сумісний, без окремого guard-у
 * на doc_type. */
export const IMPORT_SCREENSHOT_DOC_TYPES = [
  "bank_screenshot",
  "receipt",
  "other",
] as const;
export type ImportScreenshotDocType =
  (typeof IMPORT_SCREENSHOT_DOC_TYPES)[number];

/** `true` — опис рядка схожий на переказ між власними рахунками (mono-банка:
 * «Поповнення «X»» без « від », «Часткове зняття банки», «переказ на свою
 * картку»): гроші не покинули кишеню користувача, у витрати/доходи такому
 * рядку за замовчуванням не можна. Сервер ставить ЛИШЕ `true` (відсутнє
 * поле = не схожий) — детектор `transferDetect.ts`; клієнт знімає рядок з
 * вибору за замовчуванням, лишаючи його видимим і вмикабельним
 * (рішення founder-а 2026-08-18 за реальною mono-випискою). */
const transferLikelySchema = z.boolean().optional();

/** «Сітка 2» дедуп-превʼю (бета-фідбек №4, 2026-08-18: той самий скрін,
 * кинутий двічі, задвоїв рядки — vision читає описи недетерміновано, тож
 * тір-2 хеш `rowKey.ts` їх не ловить). Сервер на прев'ю звіряє рядок з уже
 * збереженими витратами за трійкою дата+сума+напрям (ОПИС свідомо
 * ігнорується — саме він і плаває між прогонами) і ставить ЛИШЕ `true`
 * (відсутнє поле = збігів немає) — детектор `duplicateDetect.ts`; клієнт
 * знімає рядок з вибору за замовчуванням, лишаючи його видимим і
 * вмикабельним — той самий UX-патерн, що `transferLikely`. */
const duplicateLikelySchema = z.boolean().optional();

export const ImportScreenshotRowSchema = z.object({
  date: boundedDayKeySchema,
  /** `HH:MM`, 24-годинний. `null` — нечитабельно/відсутнє на скріні
   * (push-повідомлення часто не несуть часу окремою міткою). */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  amountKopiykas: importAmountKopiykasSchema,
  direction: ImportDirectionSchema,
  description: z.string().max(300),
  confidence: z.number().min(0).max(1),
  transferLikely: transferLikelySchema,
  duplicateLikely: duplicateLikelySchema,
});
export type ImportScreenshotRow = z.infer<typeof ImportScreenshotRowSchema>;

export const ImportScreenshotDraftSchema = z.object({
  docType: z.enum(IMPORT_SCREENSHOT_DOC_TYPES),
  /** Назва банку, якщо vision розпізнав логотип/бренд екрана; `null` —
   * невідомо/не банківський скрін. */
  bank: z.string().max(120).nullable(),
  rows: z.array(ImportScreenshotRowSchema).max(200),
});
export type ImportScreenshotDraft = z.infer<typeof ImportScreenshotDraftSchema>;

export const ImportScreenshotAnalyzeResponseSchema = z.object({
  draft: ImportScreenshotDraftSchema,
});
export type ImportScreenshotAnalyzeResponse = z.infer<
  typeof ImportScreenshotAnalyzeResponseSchema
>;

// ─────────────── POST /api/finyk/import/statement/preview ──────────────

export const IMPORT_DATE_FORMATS = ["DD.MM.YYYY", "YYYY-MM-DD"] as const;
export type ImportDateFormat = (typeof IMPORT_DATE_FORMATS)[number];

/** Колонки з CSV-заголовка (точний текст заголовка, як він прийшов у
 * попередньому `needsMapping: true` → `headers[]`), не індекси — стабільне
 * до перестановки колонок джерелом. */
export const ImportColumnMappingSchema = z
  .object({
    dateCol: z.string().min(1).max(200),
    amountCol: z.string().min(1).max(200),
    descriptionCol: z.string().min(1).max(200),
    dateFormat: z.enum(IMPORT_DATE_FORMATS).optional(),
    decimalComma: z.boolean().optional(),
  })
  .strict();
export type ImportColumnMapping = z.infer<typeof ImportColumnMappingSchema>;

/** 5 MB — той самий порядок ліміту, що `validateImageBase64` decoded-cap і
 * spec § Фаза 2 API-контракт («виписка — csv_text рядком у JSON... ліміт
 * 5MB»). Перевіряється БАЙТАМИ (`TextEncoder`), не довжиною рядка — інакше
 * кириличний CSV (2 байти/символ у UTF-8) міг би вдвічі перевищити
 * реальний ліміт непоміченим (той самий підхід, що
 * `receiptRawPayloadSchema` у receipts.ts). */
export const IMPORT_STATEMENT_MAX_CSV_BYTES = 5 * 1024 * 1024;
const csvTextSchema = z
  .string()
  .min(1, "Порожній файл")
  .refine(
    (v) =>
      new TextEncoder().encode(v).byteLength <= IMPORT_STATEMENT_MAX_CSV_BYTES,
    {
      message: `csv_text не може перевищувати ${IMPORT_STATEMENT_MAX_CSV_BYTES} байт`,
    },
  );

export const ImportStatementPreviewRequestSchema = z
  .object({
    csv_text: csvTextSchema,
    mapping: ImportColumnMappingSchema.optional(),
  })
  .strict();
export type ImportStatementPreviewRequest = z.infer<
  typeof ImportStatementPreviewRequestSchema
>;

export const ImportStatementRowSchema = z.object({
  date: boundedDayKeySchema,
  amountKopiykas: importAmountKopiykasSchema,
  direction: ImportDirectionSchema,
  description: z.string().max(300),
  transferLikely: transferLikelySchema,
  duplicateLikely: duplicateLikelySchema,
});
export type ImportStatementRow = z.infer<typeof ImportStatementRowSchema>;

export const IMPORT_SKIP_REASONS = [
  "not_uah",
  "unparsed_date",
  "unparsed_amount",
  "empty",
] as const;
export type ImportSkipReason = (typeof IMPORT_SKIP_REASONS)[number];

export const ImportSkippedRowSchema = z.object({
  /** 1-based рядок у токенізованому CSV (1 = заголовок, 2 = перший рядок
   * даних) — збігається з фізичним номером рядка файлу, ЯКЩО жодне поле не
   * несе екранований `\n` усередині лапок (рідкісний, але легальний CSV
   * кейс — той самий caveat, що "рядок" у будь-якому spreadsheet-переглядачі). */
  line: z.number().int().min(1),
  reason: z.enum(IMPORT_SKIP_REASONS),
});
export type ImportSkippedRow = z.infer<typeof ImportSkippedRowSchema>;

export const IMPORT_STATEMENT_PROFILES = ["mono", "privat24"] as const;
export type ImportStatementProfile = (typeof IMPORT_STATEMENT_PROFILES)[number];

/** Один флет-об'єкт для обох гілок відповіді (спека: "Результат:
 * {profile|'custom'|needsMapping, rows, skipped}"; "невідомий формат: без
 * mapping → {needsMapping:true, headers[], sampleRows[][]}"). Коли
 * `needsMapping: true` — `profile: null`, `rows`/`skipped` порожні,
 * `headers`/`sampleRows` заповнені; інакше — навпаки. */
export const ImportStatementPreviewResponseSchema = z.object({
  profile: z
    .union([z.enum(IMPORT_STATEMENT_PROFILES), z.literal("custom")])
    .nullable(),
  needsMapping: z.boolean(),
  headers: z.array(z.string()).optional(),
  /** Перші рядки даних (не заголовок) для ручного column-mapper preview —
   * capped на 5 (spec § Фаза 2 «Автопрофілі + column-mapper»: "preview
   * перших 5 рядків"). */
  sampleRows: z.array(z.array(z.string())).optional(),
  rows: z.array(ImportStatementRowSchema),
  skipped: z.array(ImportSkippedRowSchema),
});
export type ImportStatementPreviewResponse = z.infer<
  typeof ImportStatementPreviewResponseSchema
>;

// ─────────────────── POST /api/finyk/import/commit ──────────────────────

export const ImportCommitRowSchema = z
  .object({
    date: boundedDayKeySchema,
    amountKopiykas: importAmountKopiykasSchema,
    direction: ImportDirectionSchema,
    description: z.string().max(300),
    /** Обов'язкова per row — клієнт дає, включно з income-категоріями
     * finyk (`manualIncomeCategories.ts`); сервер зберігає опаково,
     * так само як `ManualExpenseCreateSchema.category`. */
    category: z.string().min(1).max(120),
  })
  .strict();
export type ImportCommitRow = z.infer<typeof ImportCommitRowSchema>;

/** 5000 — не зі спеки буквально (не задане явно), розумний stopgap-кап
 * проти патологічного payload-у в одному HTTP-запиті; великі виписки
 * (роки історії) — задокументований follow-up (§ звіт server-agent). */
// 1000, не 5000 (ревʼю PR #818): commit обробляє рядки послідовно в одній
// транзакції (дедуп-запит + insert на рядок) — 5000 рядків тримали б
// pooled-клієнт на ~10k запитів. Багаторічна виписка йде кількома
// commit-ами; set-based переписування — окремий крок, якщо виникне
// реальна потреба.
export const IMPORT_COMMIT_MAX_ROWS = 1000;

export const ImportCommitRequestSchema = z
  .object({
    source: z.enum(IMPORT_SOURCES),
    rows: z.array(ImportCommitRowSchema).min(1).max(IMPORT_COMMIT_MAX_ROWS),
  })
  .strict();
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;

export const ImportCommitResponseSchema = z.object({
  batchId: z.number().int().positive(),
  created: z.number().int().min(0),
  /** Завжди `0` у цьому slice — журнал батчів тут покриває лише
   * transaction-рядки (скріни/виписки); batch-чеки (N × v1
   * `receipts`/`receipts/analyze`, які МОЖУТЬ лінкуватись на mono) не є
   * поверхнею цього ендпоінта. Поле лишене числовим (не `z.literal(0)`),
   * щоб майбутнє розширення (чекові лінки через цей самий журнал) не
   * ламало тип на клієнті — лише поведінку. */
  linked: z.number().int().min(0),
  skipped: z.object({
    monoMatched: z.number().int().min(0),
    duplicate: z.number().int().min(0),
  }),
});
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;

// ──────────────── GET /DELETE /api/finyk/import/batches/:id ─────────────

/** Словник `import_batches.status` (колонка НАВМИСНО без DB CHECK —
 * міграція 122 коментар: "словник живе в коді домену"). Мінімум
 * зі спеки Stage 1: `'completed' | 'undone'`. Цей slice синхронний
 * (commit обробляє всі рядки в одній транзакції) — проміжних
 * async-станів (`pending`/`processing`) немає; якщо майбутній async-режим
 * (черга, дуже великі виписки) з'явиться — розширювати тут, одним PR з
 * migration-agent-note (без DB-міграції, бо CHECK немає). */
export const IMPORT_BATCH_STATUSES = ["completed", "undone"] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export const ImportBatchSchema = z.object({
  id: z.number().int().positive(),
  source: z.string(),
  status: z.enum(IMPORT_BATCH_STATUSES),
  rowsTotal: z.number().int().min(0),
  rowsCreated: z.number().int().min(0),
  rowsLinked: z.number().int().min(0),
  rowsSkipped: z.number().int().min(0),
  /** `finyk_manual_expenses.id` (TEXT, migration 096) — усі рядки, які цей
   * батч створив, для undo-tombstone. */
  createdRowIds: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const ImportBatchGetResponseSchema = z.object({
  batch: ImportBatchSchema,
});
export type ImportBatchGetResponse = z.infer<
  typeof ImportBatchGetResponseSchema
>;

/** `tombstoned` — скільки рядків ЦЕЙ виклик реально tombstone-нув (0 на
 * ідемпотентний повторний виклик, бо `deleted_at IS NULL` більше нічого
 * не матче) — спостережуваність no-op без окремого статус-коду. */
export const ImportBatchUndoResponseSchema = z.object({
  batch: ImportBatchSchema,
  tombstoned: z.number().int().min(0),
});
export type ImportBatchUndoResponse = z.infer<
  typeof ImportBatchUndoResponseSchema
>;
