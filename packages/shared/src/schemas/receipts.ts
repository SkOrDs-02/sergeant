import { z } from "zod";
import { AMOUNT_MINOR_MAX } from "./bounds";

/**
 * Zod-схеми для чек-скану v1 (`apps/server/src/modules/finyk/receipts/`).
 *
 * SSOT pattern for AGENTS.md Hard Rule #3 — server serializer ↔ api-client
 * types ↔ contract test рухаються разом. Сервер валідує кожну відповідь
 * через `.parse()` цих схем безпосередньо перед `res.json()` (Hard Rule #3
 * у `sergeant-server-api`); `@sergeant/api-client` дзеркалить їх через
 * `z.infer<>` замість ручного дублювання типів.
 *
 * Спека: `docs/90-work/planning/specs/receipt-scan.md` § API-контракт.
 * Money-інваріант: суми — **kopiykas як number**, ніколи bigint-рядок
 * (Hard Rule #1) і ніколи гривні на цій межі.
 */

/** v1 lookup/analyze виробляють лише ці два джерела; `'silpo'` — окрема
 * координація (мовиться в `receipts` DB CHECK, але не тут). */
export const RECEIPT_DRAFT_SOURCES = ["dps", "vision"] as const;
export type ReceiptDraftSource = (typeof RECEIPT_DRAFT_SOURCES)[number];

/** Ширший набір — persisted-рядок теоретично може прийти з майбутнього
 * silpo-шляху (координація таблиць, `receipts.source` CHECK), тому
 * response-схема (`ReceiptSchema`) приймає й `'silpo'`, а draft — ні. */
const RECEIPT_SOURCES = ["dps", "vision", "silpo"] as const;

/**
 * Грошове поле ОДНІЄЇ позиції чека. На відміну від `amountMinorSchema`
 * (строго додатне — ручна витрата не може бути "мінус"), рядок чека
 * легітимно буває 0 (промо-подарунок) або відʼємним (рядок знижки, який
 * ДПС/vision іноді друкує окремим рядком, а не згортає в ціну товару) —
 * тому лише межа за модулем, без floor на нулі/відʼємному.
 */
const receiptItemMoneySchema = z
  .number()
  .int()
  .min(-AMOUNT_MINOR_MAX)
  .max(AMOUNT_MINOR_MAX);

/** Межа довжини назви позиції/магазину — експортовано так, щоб сервер
 * (напр. `analyze.ts::normalizeVisionResult`, який будує чернетку з
 * довільного LLM-JSON) міг кламп-ити до ТІЄЇ САМОЇ межі, а не тримати
 * окрему магічну константу, яка може розійтись зі схемою. */
export const RECEIPT_ITEM_NAME_MAX_LEN = 300;
export const RECEIPT_STORE_MAX_LEN = 300;

/** Кількість/вага позиції — може бути дробовою (вагові товари, напр. 0.345
 * кг) і теоретично відʼємною (рядок знижки без власної кількості). Той
 * самий "reuse for clamping" мотив, що й `RECEIPT_ITEM_NAME_MAX_LEN`. */
export const RECEIPT_ITEM_QTY_ABS_MAX = 1_000_000;
const receiptItemQtySchema = z
  .number()
  .finite()
  .min(-RECEIPT_ITEM_QTY_ABS_MAX)
  .max(RECEIPT_ITEM_QTY_ABS_MAX);

/** Межі position та кількості позицій draft-у — експортовані з тим самим
 * "reuse for clamping" мотивом, що `RECEIPT_ITEM_NAME_MAX_LEN`: серверні
 * парсери недовіреного вводу (`dpsXml.ts`, `analyze.ts`) деградують до цих
 * меж graceful-но замість валити `.parse()` ВЛАСНОЇ відповіді 500-кою. */
export const RECEIPT_ITEM_POSITION_MAX = 10_000;
export const RECEIPT_DRAFT_ITEMS_MAX = 200;

export const ReceiptDraftItemSchema = z.object({
  /** Порядок рядка в чеку, як його віддав парсер ДПС/vision (1-based —
   * `.min(1)` замість `.min(0)`, раунд 5 ревʼю: обидва продюсери
   * (dpsXml ROWNUM/i+1-фолбек, analyze idx+1) нумерують з одиниці). */
  position: z.number().int().min(1).max(RECEIPT_ITEM_POSITION_MAX),
  name: z.string().min(1).max(RECEIPT_ITEM_NAME_MAX_LEN),
  qty: receiptItemQtySchema,
  priceKopiykas: receiptItemMoneySchema,
  sumKopiykas: receiptItemMoneySchema,
});
export type ReceiptDraftItem = z.infer<typeof ReceiptDraftItemSchema>;

/**
 * Дубль `position` у межах ОДНОГО чека → 400 ще тут (review-фікс,
 * MINOR): без цього першим барʼєром був би `receipt_items_receipt_id_
 * position_idx` UNIQUE(receipt_id, position) з міграції 121 — pg
 * unique_violation (23505) без спеціального catch у `save.ts::
 * insertReceiptItems` (на відміну від `finyk_tx_receipt_links`, де є
 * SAVEPOINT-обробка) означало б непіймане 500 замість чистого 400 з
 * поясненням. Застосовано і до `ReceiptDraftSchema` (не лише Save) —
 * lookup/analyze самі `.parse()`-ять свою відповідь через цю ж форму
 * (Hard Rule #3), тож дубль-position з кривого ДПС-парсингу теж ловиться
 * тут, а не проривається до review-екрана невиправним.
 */
const receiptDraftItemsSchema = z
  .array(ReceiptDraftItemSchema)
  .max(RECEIPT_DRAFT_ITEMS_MAX)
  .superRefine((items, ctx) => {
    const seenPositions = new Set<number>();
    items.forEach((item, idx) => {
      if (seenPositions.has(item.position)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Дублікат position (${item.position}) у items — кожна позиція чека мусить мати унікальний position`,
          path: [idx, "position"],
        });
        return;
      }
      seenPositions.add(item.position);
    });
  });

/**
 * Опаковий сирий payload джерела (XML ДПС серіалізований у JSON, або
 * JSON-відповідь vision-LLM) — round-trip без інтерпретації клієнтом:
 * draft (lookup/analyze) → review-екран (не редагує це поле) → save.
 * 256 KB — той самий порядок, що `SYNC_V2_MAX_ROW_BYTES` для інших
 * opaque JSONB blob-ів цього репо.
 */
export const RECEIPT_RAW_PAYLOAD_MAX_BYTES = 256 * 1024;
const receiptRawPayloadSchema = z
  .unknown()
  .refine((v) => v !== undefined && v !== null, {
    message: "rawPayload є обовʼязковим",
  })
  .refine(
    (v) => {
      try {
        return (
          new TextEncoder().encode(JSON.stringify(v)).byteLength <=
          RECEIPT_RAW_PAYLOAD_MAX_BYTES
        );
      } catch {
        return false;
      }
    },
    {
      message: `rawPayload не може перевищувати ${RECEIPT_RAW_PAYLOAD_MAX_BYTES} байт`,
    },
  );

/**
 * Спільна форма чернетки — повертається `POST /api/finyk/receipts/lookup`
 * і `POST /api/finyk/receipts/analyze` (обидва БЕЗ запису в БД), і є базою
 * для `POST /api/finyk/receipts` (save = відредагований draft + category).
 *
 * `store` навмисно БЕЗ `.min(1)` — джерело могло не розпізнати назву
 * магазину; порожній рядок допустимий на цьому контрактному рівні, а
 * fallback-підстановка ("Невідомий магазин") відбувається в `save.ts`
 * безпосередньо перед INSERT (міграція 121, коментар до
 * `receipts.store_name`), не тут.
 */
export const ReceiptDraftSchema = z.object({
  source: z.enum(RECEIPT_DRAFT_SOURCES),
  fiscalNum: z.string().min(1).max(64).nullable(),
  store: z.string().max(RECEIPT_STORE_MAX_LEN),
  storeTaxId: z.string().min(1).max(32).nullable(),
  /** ISO-8601 з offset — момент покупки (Kyiv wall-clock конвертований у
   * справжній UTC-момент серверним парсером/нормалізатором). */
  purchasedAt: z.string().datetime({ offset: true }),
  totalKopiykas: z.number().int().min(0).max(AMOUNT_MINOR_MAX),
  items: receiptDraftItemsSchema,
  /** Лише для `source: 'vision'` — review-екран показує бейдж «перевір
   * суми». `null` для `'dps'` (структуровані дані, довіра висока). */
  confidence: z.number().min(0).max(1).nullable().optional(),
  rawPayload: receiptRawPayloadSchema,
  /**
   * Опційний client-generated UUID — retry-дедуп для vision-чеків
   * (`fiscalNum: null`, спека не визначає партіальний UNIQUE для цих
   * рядків, review-фікс MAJOR). Клієнт генерує ОДИН РАЗ на спробу
   * збереження і шле те саме значення в КОЖНОМУ retry — `save.ts`
   * (`fiscalNum === null` гілка) шукає існуючий чек за ним ПЕРЕД
   * insert-ом замість сліпого дубль-запису. Живе всередині
   * `receipts.raw_payload` JSONB (БЕЗ нової колонки/міграції), не в
   * окремому полі БД. Присутнє в `ReceiptDraftSchema` (не лише Save),
   * бо `ReceiptSaveRequestSchema` — `.extend()` над цією схемою; сервер
   * САМ це поле в lookup/analyze-відповідях не проставляє. Без
   * `clientScanId` — поведінка НЕ змінюється (кожен save з
   * `fiscalNum: null` і далі створює новий рядок, як і раніше).
   */
  clientScanId: z.string().uuid().nullable().optional(),
});
export type ReceiptDraft = z.infer<typeof ReceiptDraftSchema>;

export const ReceiptDraftResponseSchema = z.object({
  draft: ReceiptDraftSchema,
});
export type ReceiptDraftResponse = z.infer<typeof ReceiptDraftResponseSchema>;

// ────────────────────── POST /api/finyk/receipts/lookup ──────────────────
// Поля QR-URL ДПС кабінету (`.../cashregs/check?id=..&date=..&time=..&fn=..
// &sm=..`) — опакові рядки-ідентифікатори з чужої системи, не наша дата/
// час/число-семантика. Regex-вайтліст (як `BankApiPath` в api.ts) захищає
// вихідний HTTP-запит (`dpsClient.ts`) від сміттєвих символів; сам формат
// не задокументований нам (відкритий гейт спеки — токена ще нема).
const dpsQrFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/, "Недопустимі символи");

export const ReceiptLookupRequestSchema = z
  .object({
    fn: dpsQrFieldSchema,
    id: dpsQrFieldSchema,
    date: dpsQrFieldSchema,
    time: dpsQrFieldSchema,
    sm: dpsQrFieldSchema,
  })
  .strict();
export type ReceiptLookupRequest = z.infer<typeof ReceiptLookupRequestSchema>;

// ────────────────────── POST /api/finyk/receipts/analyze ─────────────────
// Дзеркалить `AnalyzePhotoSchema` (packages/shared/src/schemas/api.ts) —
// той самий `validateImageBase64` (5MB) contract на server-боці.
export const ReceiptAnalyzeRequestSchema = z
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
export type ReceiptAnalyzeRequest = z.infer<typeof ReceiptAnalyzeRequestSchema>;

// ────────────────────── POST /api/finyk/receipts (save) ──────────────────
export const ReceiptSaveRequestSchema = ReceiptDraftSchema.extend({
  category: z.string().min(1).max(120),
}).strict();
export type ReceiptSaveRequest = z.infer<typeof ReceiptSaveRequestSchema>;

export const ReceiptItemSchema = z.object({
  id: z.number().int().positive(),
  receiptId: z.number().int().positive(),
  position: z.number().int(),
  name: z.string(),
  qty: z.number(),
  priceKopiykas: z.number().int(),
  sumKopiykas: z.number().int(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptLinkSchema = z.object({
  txKind: z.enum(["mono", "manual"]),
  txRef: z.string(),
});
export type ReceiptLink = z.infer<typeof ReceiptLinkSchema>;

/** Persisted receipt (GET /:id, POST save response). `source` ширший за
 * `ReceiptDraftSource` — див. коментар при `RECEIPT_SOURCES` вище. */
export const ReceiptSchema = z.object({
  id: z.number().int().positive(),
  source: z.enum(RECEIPT_SOURCES),
  fiscalNum: z.string().nullable(),
  store: z.string(),
  storeTaxId: z.string().nullable(),
  purchasedAt: z.string(),
  totalKopiykas: z.number().int(),
  items: z.array(ReceiptItemSchema),
  /** `null` — matcher не знайшов mono-транзакцію АБО manual-expense insert
   * ще не завершився (не повинно траплятись у нормальній відповіді —
   * save завжди створює лінк на mono АБО manual). */
  link: ReceiptLinkSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

/**
 * `alreadyExists: true` — повторний скан того самого фіскального чека
 * (partial UNIQUE `(user_id, source, fiscal_num)`, міграція 121): сервер
 * повернув ІСНУЮЧИЙ receipt, не створив новий expense/link (спека:
 * «повторний скан того ж чека НЕ створює дубль»). HTTP-статус це
 * дзеркалить — 200 для `alreadyExists`, 201 для щойно створеного.
 */
export const ReceiptSaveResponseSchema = z.object({
  receipt: ReceiptSchema,
  alreadyExists: z.boolean(),
});
export type ReceiptSaveResponse = z.infer<typeof ReceiptSaveResponseSchema>;

// ────────────────────── GET /api/finyk/receipts/:id ───────────────────────
export const ReceiptGetResponseSchema = z.object({ receipt: ReceiptSchema });
export type ReceiptGetResponse = z.infer<typeof ReceiptGetResponseSchema>;
