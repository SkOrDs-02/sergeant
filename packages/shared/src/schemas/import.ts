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
 * (signed bigint) чи чекових позицій (можуть бути 0/відʼємні). */
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
 * тір-2 хеш `rowKey.ts` їх не ловить). Сервер на превʼю звіряє рядок з уже
 * збереженими витратами за трійкою дата+сума+напрям (ОПИС свідомо
 * ігнорується — саме він і плаває між прогонами) і ставить ЛИШЕ `true`
 * (відсутнє поле = збігів немає) — детектор `duplicateDetect.ts`; клієнт
 * знімає рядок з вибору за замовчуванням, лишаючи його видимим і
 * вмикабельним — той самий UX-патерн, що `transferLikely`. */
const duplicateLikelySchema = z.boolean().optional();

/**
 * Категорія, яку сервер ЗДОГАДАВСЯ поставити рядку — з власної колонки
 * категорії банку, з MCC або з ключових слів опису
 * (`import/categoryHint.ts`). Значення — id чипа з пікера finyk
 * (`MANUAL_EXPENSE_TAXONOMY` / `MANUAL_INCOME_TAXONOMY`).
 *
 * Поле ОПЦІЙНЕ і відсутнє = «доказів немає»: клієнт тоді підставляє
 * власний дефолт. Свідомо не шлемо «other»/«salary» — інакше здогадку
 * неможливо відрізнити від дефолту, і UI не міг би показати різницю.
 * Рядок усе одно редагується в bulk-review, тож підказка нічого не
 * вирішує остаточно.
 */
const categoryHintSchema = z.string().min(1).max(120).optional();

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
  categoryHint: categoryHintSchema,
});
export type ImportScreenshotRow = z.infer<typeof ImportScreenshotRowSchema>;

/**
 * Скільки рядків модель ПОВЕРНУЛА, але сервер прибрав, і чому. Потрібне
 * рівно для одного: коли `rows` порожні, UI мусить сказати ЩО САМЕ пішло
 * не так, а не «не вдалось розпізнати транзакції» на всі випадки одразу.
 * Бета-фідбек 2026-08-25: «ші написав, що не може знайти транзакції на
 * скріншоті» — і жодного способу дізнатись, чи він їх не побачив, чи
 * побачив і відкинув як не-гривневі.
 */
export const ImportScreenshotDroppedSchema = z.object({
  /** Позначені моделлю як невдалі («Недостатньо коштів», «Відхилено»). */
  failed: z.number().int().min(0),
  /** Сума не в гривні — Фаза 2 працює лише з UAH. */
  nonUah: z.number().int().min(0),
  /** Без читабельної дати чи додатної суми — картку показати нема з чого. */
  unreadable: z.number().int().min(0),
});
export type ImportScreenshotDropped = z.infer<
  typeof ImportScreenshotDroppedSchema
>;

const EMPTY_DROPPED = { failed: 0, nonUah: 0, unreadable: 0 } as const;

export const ImportScreenshotDraftSchema = z.object({
  docType: z.enum(IMPORT_SCREENSHOT_DOC_TYPES),
  /** Назва банку, якщо vision розпізнав логотип/бренд екрана; `null` —
   * невідомо/не банківський скрін. */
  bank: z.string().max(120).nullable(),
  rows: z.array(ImportScreenshotRowSchema).max(200),
  /** `.default()`, а не обовʼязкове поле: web і server деплояться окремо
   * (Vercel / Coolify), тож новий клієнт мусить пережити відповідь ще не
   * оновленого сервера — інакше `.parse()` на api-client перетворив би
   * робочий імпорт на помилку під час розкатки. */
  dropped: ImportScreenshotDroppedSchema.default(EMPTY_DROPPED),
  /** `true` — відповідь моделі обірвалась на ліміті токенів, тобто JSON
   * прийшов неповним і частину рядків фізично не відновити. Довгий список
   * транзакцій на одному скріні — головна причина «нуль рядків». */
  truncated: z.boolean().default(false),
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

/** Base64 самого файлу виписки — XLSX, HTML-таблиця під виглядом `.xls`
 * або текстовий CSV у будь-якому кодуванні. Кап у СИМВОЛАХ base64 з
 * запасом над 5 МБ сирих байтів (base64 ×4/3): декодовані байти сервер
 * ще раз міряє точно (`STATEMENT_MAX_FILE_BYTES`, `statementFile.ts`).
 *
 * WHY окреме поле, а не заміна `csv_text`: текстова гілка лишається
 * робочою для клієнтів/тестів, які вже шлють готовий рядок; файлова
 * додає те, чого текстова дати не може — типізовані клітинки XLSX і
 * детект кодування (`file.text()` у браузері завжди читає як UTF-8 і
 * псує windows-1251-виписку ще до відправки). */
const fileBase64Schema = z
  .string()
  .min(1, "Порожній файл")
  .max(7_000_000, "Файл завеликий");

export const ImportStatementPreviewRequestSchema = z
  .object({
    csv_text: csvTextSchema.optional(),
    file_base64: fileBase64Schema.optional(),
    /** Лише для діагностики/логів UI — рішення про формат сервер ухвалює
     * за magic-байтами, не за розширенням (банки регулярно віддають
     * HTML-таблицю з іменем `*.xls`). */
    file_name: z.string().max(255).optional(),
    mapping: ImportColumnMappingSchema.optional(),
  })
  .strict()
  .refine((v) => Boolean(v.csv_text) !== Boolean(v.file_base64), {
    message: "Треба рівно одне з csv_text або file_base64",
    path: ["csv_text"],
  });
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
  categoryHint: categoryHintSchema,
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

/** Один флет-обʼєкт для обох гілок відповіді (спека: "Результат:
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
    /** Обовʼязкова per row — клієнт дає, включно з income-категоріями
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

/**
 * Що САМЕ сталося з кожним поданим рядком. Агрегати (`created` /
 * `skipped.*`) кажуть скільки, але не який — а клієнту потрібне саме
 * «який»: `finyk_manual_expenses` рядки народжуються прямим SQL-INSERT-ом,
 * і локально їх видно лише тим, що клієнт запише ті самі id у свій
 * storage (`useBulkImport.ts` write-through). Поки відповідь несла лише
 * лічильники, зіставити id з рядками можна було ТІЛЬКИ коли не пропущено
 * жодного рядка — тож будь-який один дубль чи mono-матч у батчі робив
 * НЕВИДИМИМИ локально ВСІ створені рядки цього імпорту (звіт власника
 * 2026-08-28: «пише, що вони вже є, а в операціях їх немає»).
 *
 * - `created` — рядок щойно вставлено (є в `batch.createdRowIds`).
 * - `duplicate` — рядок із таким id уже був і ЖИВИЙ (тір-2 дедуп).
 * - `tombstoned` — рядок із таким id уже був, але видалений (undo імпорту
 *   чи ручне видалення). Клієнт НЕ воскрешає його локально.
 * - `mono_matched` — тір-1: платіж уже видно як mono-транзакцію.
 */
export const IMPORT_COMMIT_ROW_STATUSES = [
  "created",
  "duplicate",
  "tombstoned",
  "mono_matched",
] as const;
export type ImportCommitRowStatus = (typeof IMPORT_COMMIT_ROW_STATUSES)[number];

export const ImportCommitRowResultSchema = z.object({
  /** `finyk_manual_expenses.id` — детермінований `rowKey.ts`-хеш. */
  id: z.string().min(1),
  status: z.enum(IMPORT_COMMIT_ROW_STATUSES),
});
export type ImportCommitRowResult = z.infer<typeof ImportCommitRowResultSchema>;

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
  /** Результат КОЖНОГО поданого рядка, у тому самому порядку й тій самій
   * довжині, що `rows` запиту. `.default([])`, а не обовʼязкове поле: web
   * і server деплояться окремо (Vercel / Coolify), тож новий клієнт мусить
   * пережити відповідь ще не оновленого сервера — той самий підхід, що
   * `ImportScreenshotDraftSchema.dropped`. Порожній масив = «сервер
   * старий», клієнт падає на легасі-шлях (`GET .../batches/:id`). */
  rows: z
    .array(ImportCommitRowResultSchema)
    .max(IMPORT_COMMIT_MAX_ROWS)
    .default([]),
});
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;

// ──────────────── GET /DELETE /api/finyk/import/batches/:id ─────────────

/** Словник `import_batches.status` (колонка НАВМИСНО без DB CHECK —
 * міграція 122 коментар: "словник живе в коді домену"). Мінімум
 * зі спеки Stage 1: `'completed' | 'undone'`. Цей slice синхронний
 * (commit обробляє всі рядки в одній транзакції) — проміжних
 * async-станів (`pending`/`processing`) немає; якщо майбутній async-режим
 * (черга, дуже великі виписки) зʼявиться — розширювати тут, одним PR з
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

/**
 * `GET /api/finyk/import/recent` — сирі факти для плашки «залий
 * документи» (спека `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * Сервер НЕ виносить вердикт «показувати чи ні» навмисно. Умова плашки
 * росте від ЧАСУ, а не від даних («днів від останнього імпорту»), тож
 * серверна відповідь застаріває сама собою на довго відкритій вкладці —
 * та сама пастка, яку вже ловив `useMonoStaleness`. Вердикт вважає
 * клієнт із власним годинником, а сервер віддає лише дати.
 */
export const ImportRecentSourceSchema = z.object({
  source: z.enum(IMPORT_SOURCES),
  /** ISO-дати останніх успішних батчів цього типу, найновіший перший. */
  recentAt: z.array(z.iso.datetime()).min(1),
});
export type ImportRecentSource = z.infer<typeof ImportRecentSourceSchema>;

export const ImportRecentResponseSchema = z.object({
  sources: z.array(ImportRecentSourceSchema),
});
export type ImportRecentResponse = z.infer<typeof ImportRecentResponseSchema>;
