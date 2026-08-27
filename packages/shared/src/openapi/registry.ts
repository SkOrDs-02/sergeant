import { createDocument } from "zod-openapi";
import { z } from "zod";

import * as schemas from "../schemas/api";
import * as receiptSchemas from "../schemas/receipts";
import * as importSchemas from "../schemas/import";
import * as silpoSchemas from "../schemas/silpo";

/**
 * Builds OpenAPI 3.1 document from zod-схем у `@sergeant/shared/schemas/api`.
 *
 * Використовує `zod-openapi@5` (нативний `.meta()` API zod v4) — без
 * prototype-патчів і без runtime-augmentation. Кожна named-схема дістає
 * stable component ID через `.meta({ id })`, після чого в OpenAPI
 * `#/components/schemas/<id>` формується автоматично з `$ref`-ом.
 *
 * Caller має імпортувати `./routes` перед викликом, щоб route-каталог
 * зареєструвався у локальному обʼєкті `paths`.
 */

// ────────────────────── Named components (з ID для $ref) ──────────────────────
//
// `.meta({ id })` робить схему named-компонентом у фінальному OpenAPI doc-і.
// id-и зведені в kebab-free PascalCase, бо OpenAPI generators конвертують їх
// у клас-імена SDK (Java/Go/Swift).
const User = schemas.UserSchema.meta({
  id: "User",
  description: "Публічний профіль користувача (повертається з /api/me).",
});
const MeResponse = schemas.MeResponseSchema.meta({
  id: "MeResponse",
  description: "Відповідь на GET /api/me.",
});
const UserProfilePutBody = schemas.UserProfilePutBodySchema.meta({
  id: "UserProfilePutBody",
  description:
    "PUT /api/me/profile request body — write-through профіль/біометрія (migration 115, НЕ oplog-sync).",
});
const UserProfileResponse = schemas.UserProfileResponseSchema.meta({
  id: "UserProfileResponse",
  description:
    "Відповідь GET/PUT /api/me/profile. `profile: {}` / `updatedAt: null` — дефолт, коли рядка ще немає.",
});
const ChatRequest = schemas.ChatRequestSchema.meta({
  id: "ChatRequest",
  description:
    "POST /api/chat — Anthropic-чат із tool-results і опційним streaming.",
});
const ChatUsageResponse = schemas.ChatUsageResponseSchema.meta({
  id: "ChatUsageResponse",
  description:
    "GET /api/chat/usage — денний Free-tier ліміт AI-чату (PR-42 chat counter).",
});
const RecallMemoryRequest = schemas.RecallMemoryRequestSchema.meta({
  id: "RecallMemoryRequest",
  description:
    "POST /api/ai-memory/recall — semantic-search query body (query + optional topK/sources).",
});
const RecallMemoryResult = schemas.RecallMemoryResultSchema.meta({
  id: "RecallMemoryResult",
  description:
    "Один результат semantic-search-у з ai_memories: id, score (cosine sim) і origin metadata.",
});
const RecallMemoryResponse = schemas.RecallMemoryResponseSchema.meta({
  id: "RecallMemoryResponse",
  description:
    "Відповідь POST /api/ai-memory/recall — масив результатів (може бути порожнім).",
});
const AiMemoryClearResponse = schemas.AiMemoryClearResponseSchema.meta({
  id: "AiMemoryClearResponse",
  description:
    "Відповідь DELETE /api/ai-memory — підтвердження та кількість видалених записів.",
});
const AiMemoryListResponse = schemas.AiMemoryListResponseSchema.meta({
  id: "AiMemoryListResponse",
  description:
    "Відповідь GET /api/ai-memory/list — сторінка фактів памʼяті + keyset-курсор.",
});
const AiMemoryDeleteResponse = schemas.AiMemoryDeleteResponseSchema.meta({
  id: "AiMemoryDeleteResponse",
  description:
    "Відповідь DELETE /api/ai-memory/{id} — ідемпотентна; deleted:false означає, що рядка вже не було.",
});
const AnalyzePhoto = schemas.AnalyzePhotoSchema.meta({
  id: "AnalyzePhoto",
  description: "POST /api/nutrition/analyze-photo — base64 фото страви.",
});
const RefinePhoto = schemas.RefinePhotoSchema.meta({
  id: "RefinePhoto",
  description: "POST /api/nutrition/refine-photo — Q&A + portion override.",
});
const ParsePantry = schemas.ParsePantrySchema.meta({
  id: "ParsePantry",
  description: "POST /api/nutrition/parse-pantry — вільний текст коморою.",
});
const BackupUpload = schemas.BackupUploadSchema.meta({
  id: "BackupUpload",
  description: "POST /api/nutrition/backup-upload — зашифрований blob.",
});
const RecommendRecipes = schemas.RecommendRecipesSchema.meta({
  id: "RecommendRecipes",
  description: "POST /api/nutrition/recommend-recipes.",
});
const DayHint = schemas.DayHintSchema.meta({
  id: "DayHint",
  description: "POST /api/nutrition/day-hint.",
});
const DayPlan = schemas.DayPlanSchema.meta({
  id: "DayPlan",
  description: "POST /api/nutrition/day-plan.",
});
const WeekPlan = schemas.WeekPlanSchema.meta({
  id: "WeekPlan",
  description: "POST /api/nutrition/week-plan.",
});
const ShoppingList = schemas.ShoppingListSchema.meta({
  id: "ShoppingList",
  description: "POST /api/nutrition/shopping-list.",
});
const WeeklyDigest = schemas.WeeklyDigestSchema.meta({
  id: "WeeklyDigest",
  description: "POST /api/digest/weekly.",
});
const CoachInsight = schemas.CoachInsightSchema.meta({
  id: "CoachInsight",
  description: "POST /api/coach/insight.",
});
const CoachMemoryPost = schemas.CoachMemoryPostSchema.meta({
  id: "CoachMemoryPost",
  description: "POST /api/coach/memory.",
});
// V1 sync component registrations (`SyncPush` / `SyncPull` /
// `SyncPushAll`) were dropped in PR #076 (storage-roadmap Stage 13)
// — the underlying routes return 410 Gone since 2026-05-06
// (ADR-0047) so advertising the schemas as live endpoint payloads
// was misleading.
const PrivatQuery = schemas.PrivatQuerySchema.meta({
  id: "PrivatQuery",
  description: "Query для GET /api/privat.",
});
const PushSubscribe = schemas.PushSubscribeSchema.meta({
  id: "PushSubscribe",
  description: "Web-push subscribe (legacy).",
});
const PushUnsubscribe = schemas.PushUnsubscribeSchema.meta({
  id: "PushUnsubscribe",
  description: "Web-push unsubscribe (legacy).",
});
const PushRegister = schemas.PushRegisterSchema.meta({
  id: "PushRegister",
  description: "POST /api/push/register — discriminated union web/ios/android.",
});
const PushUnregister = schemas.PushUnregisterSchema.meta({
  id: "PushUnregister",
  description: "POST /api/push/unregister.",
});
const PushSend = schemas.PushSendSchema.meta({
  id: "PushSend",
  description: "Internal /api/push/send (worker).",
});
const PushTestRequest = schemas.PushTestRequestSchema.meta({
  id: "PushTestRequest",
  description: "POST /api/push/test.",
});
const PushSendSummary = schemas.PushSendSummarySchema.meta({
  id: "PushSendSummary",
  description: "Уніфікований summary push fan-out (delivered/cleaned/errors).",
});
const PushTestResponse = schemas.PushTestResponseSchema.meta({
  id: "PushTestResponse",
  description: "POST /api/push/test response.",
});
const FoodSearchQuery = schemas.FoodSearchQuerySchema.meta({
  id: "FoodSearchQuery",
  description: "Query для GET /api/food-search (OpenFoodFacts).",
});
const BarcodeQuery = schemas.BarcodeQuerySchema.meta({
  id: "BarcodeQuery",
  description: "Query для GET /api/barcode (OpenFoodFacts).",
});
const MonoTransactionsQuery = schemas.MonoTransactionsQuerySchema.meta({
  id: "MonoTransactionsQuery",
  description:
    "Query для GET /api/mono/transactions — фільтри from/to/accountId та cursor.",
});
const MonoAccountDto = schemas.MonoAccountDtoSchema.meta({
  id: "MonoAccountDto",
  description:
    "Рядок `mono_accounts` після нормалізації (bigint coerce + masked PAN).",
});
const MonoAccountsResponse = schemas.MonoAccountsResponseSchema.meta({
  id: "MonoAccountsResponse",
  description: "Відповідь GET /api/mono/accounts — масив MonoAccountDto.",
});
const MonoJarDto = schemas.MonoJarDtoSchema.meta({
  id: "MonoJarDto",
  description: "Рядок `mono_jar` після нормалізації (bigint coerce).",
});
const MonoJarsResponse = schemas.MonoJarsResponseSchema.meta({
  id: "MonoJarsResponse",
  description: "Відповідь GET /api/mono/jars — масив MonoJarDto.",
});
const MonoTransactionDto = schemas.MonoTransactionDtoSchema.meta({
  id: "MonoTransactionDto",
  description:
    "Рядок `mono_transactions` після нормалізації (bigint coerce, MCC ж. nullable).",
});
const MonoTransactionsPage = schemas.MonoTransactionsPageSchema.meta({
  id: "MonoTransactionsPage",
  description:
    "Відповідь GET /api/mono/transactions — cursor-paginated `{data, nextCursor}`.",
});
const MonoSyncState = schemas.MonoSyncStateSchema.meta({
  id: "MonoSyncState",
  description:
    "Відповідь GET /api/mono/sync-state — статус інтеграції + лічильники.",
});
const MonoConnectResponse = schemas.MonoConnectResponseSchema.meta({
  id: "MonoConnectResponse",
  description: "Відповідь POST /api/mono/connect — `status: 'active'` literal.",
});
const MonoDisconnectResponse = schemas.MonoDisconnectResponseSchema.meta({
  id: "MonoDisconnectResponse",
  description: "Відповідь POST /api/mono/disconnect — `{ ok: true }`.",
});
const MonoBackfillResponse = schemas.MonoBackfillResponseSchema.meta({
  id: "MonoBackfillResponse",
  description:
    "Відповідь POST /api/mono/backfill — `status: 'started'` literal.",
});
const MonoBackfillProgress = schemas.MonoBackfillProgressSchema.meta({
  id: "MonoBackfillProgress",
  description:
    "Відповідь GET /api/mono/backfill-progress — поточний стан per-user backfill job.",
});
// ── Silpo MCP integration (walking-skeleton experiment) ──────────────────
// Shapes below describe our OWN normalized storage (`silpo_receipts` /
// `silpo_receipt_items`, migration 121), not the raw MCP tool payload — see
// the docstring in `packages/shared/src/schemas/silpo.ts`.
const SilpoSyncState = silpoSchemas.SilpoSyncStateSchema.meta({
  id: "SilpoSyncState",
  description:
    "Відповідь GET /api/silpo/sync-state — статус інтеграції + лічильники для Settings-картки.",
});
const SilpoDisconnectResponse = silpoSchemas.SilpoDisconnectResponseSchema.meta(
  {
    id: "SilpoDisconnectResponse",
    description:
      "Відповідь POST /api/silpo/disconnect — `{ ok: true }` (mono-патерн: видаляє лише `silpo_connection`).",
  },
);
const SilpoWipeResponse = silpoSchemas.SilpoWipeResponseSchema.meta({
  id: "SilpoWipeResponse",
  description:
    "Відповідь POST /api/silpo/wipe — повне видалення чеків користувача, `deletedReceipts` — лічильник.",
});
const SilpoSyncResult = silpoSchemas.SilpoSyncResultSchema.meta({
  id: "SilpoSyncResult",
  description:
    "Відповідь POST /api/silpo/sync — діагностичні лічильники pull/insert/match ПІСЛЯ спроби синхронізації.",
});
const SilpoReceiptItemDto = silpoSchemas.SilpoReceiptItemDtoSchema.meta({
  id: "SilpoReceiptItemDto",
  description:
    "Рядок `silpo_receipt_items` після нормалізації (bigint coerce: `id`, `priceKop`).",
});
const SilpoReceiptSummaryDto = silpoSchemas.SilpoReceiptSummaryDtoSchema.meta({
  id: "SilpoReceiptSummaryDto",
  description:
    "Рядок `silpo_receipts` без line items (bigint coerce: `totalKop`); `transactionId: null` — перше-класний стан «чек без транзакції».",
});
const SilpoReceiptDetailDto = silpoSchemas.SilpoReceiptDetailDtoSchema.meta({
  id: "SilpoReceiptDetailDto",
  description: "SilpoReceiptSummaryDto + масив SilpoReceiptItemDto.",
});
const SilpoReceiptsPage = silpoSchemas.SilpoReceiptsPageSchema.meta({
  id: "SilpoReceiptsPage",
  description:
    "Відповідь GET /api/silpo/receipts — cursor-paginated `{data, nextCursor}`.",
});
const SilpoReceiptsQuery = silpoSchemas.SilpoReceiptsQuerySchema.meta({
  id: "SilpoReceiptsQuery",
  description:
    "Query для GET /api/silpo/receipts — limit (coerced), cursor, опційний transactionId для точкового пошуку привʼязаного чека.",
});
// ── Silpo cart (Track G — MCP write path) ─────────────────────────────────
const SilpoCartPreviewRequest = silpoSchemas.SilpoCartPreviewRequestSchema.meta(
  {
    id: "SilpoCartPreviewRequest",
    description:
      "Тіло POST /api/silpo/cart/preview — `{items: [{name, quantity?}]}` (1..100).",
  },
);
const SilpoCartPreviewResponse =
  silpoSchemas.SilpoCartPreviewResponseSchema.meta({
    id: "SilpoCartPreviewResponse",
    description:
      "Відповідь POST /api/silpo/cart/preview — по одному result на запитаний рядок, у порядку запиту.",
  });
const SilpoCartApplyRequest = silpoSchemas.SilpoCartApplyRequestSchema.meta({
  id: "SilpoCartApplyRequest",
  description:
    "Тіло POST /api/silpo/cart/apply — `{selections: [{lagerId, quantity}]}` (1..100); `lagerId` — опаковий токен з preview.",
});
const SilpoCartDto = silpoSchemas.SilpoCartDtoSchema.meta({
  id: "SilpoCartDto",
  description:
    "Відповідь GET /api/silpo/cart і POST /api/silpo/cart/apply — поточний стан кошика Сільпо.",
});

const Pagination = schemas.PaginationSchema.meta({
  id: "Pagination",
  description:
    "Стандартні query-params для list-endpoints (limit/offset, coerced).",
});
const WaitlistSubmit = schemas.WaitlistSubmitSchema.meta({
  id: "WaitlistSubmit",
  description:
    "POST /api/v1/waitlist — sign-up на майбутній Pro-тір (Phase 0 monetization).",
});
const WaitlistSubmitResponse = schemas.WaitlistSubmitResponseSchema.meta({
  id: "WaitlistSubmitResponse",
  description:
    "Відповідь на POST /api/v1/waitlist — `created` розрізняє новий запис vs duplicate.",
});
const FeedbackSubmit = schemas.FeedbackSubmitSchema.meta({
  id: "FeedbackSubmit",
  description:
    "POST /api/v1/feedback — in-app віджет фідбеку (головний багрепорт-канал бети).",
});
const FeedbackSubmitResponse = schemas.FeedbackSubmitResponseSchema.meta({
  id: "FeedbackSubmitResponse",
  description:
    "Відповідь на POST /api/v1/feedback — `id` рядка у feedback_entries (bigint скоерсено в number).",
});
const BillingCheckoutRequest = schemas.BillingCheckoutRequestSchema.meta({
  id: "BillingCheckoutRequest",
  description: "POST /api/billing/checkout — Stripe Checkout session request.",
});
const BillingCheckoutResponse = schemas.BillingCheckoutResponseSchema.meta({
  id: "BillingCheckoutResponse",
  description:
    "Відповідь Stripe Checkout MVP: session id, redirect URL, test/live mode.",
});
const BillingStatusResponse = schemas.BillingStatusResponseSchema.meta({
  id: "BillingStatusResponse",
  description:
    "Поточний subscription state користувача, серіалізований з subscriptions (m056).",
});
const BillingPortalResponse = schemas.BillingPortalResponseSchema.meta({
  id: "BillingPortalResponse",
  description:
    "Відповідь POST /api/billing/portal: short-lived redirect URL у Stripe Customer Portal.",
});
const BillingCancelResponse = schemas.BillingCancelResponseSchema.meta({
  id: "BillingCancelResponse",
  description:
    "Відповідь POST /api/billing/cancel — власне скасування Pro (LiqPay/Plata не мають Customer Portal).",
});
const BillingProvidersResponse = schemas.BillingProvidersResponseSchema.meta({
  id: "BillingProvidersResponse",
  description:
    "GET /api/billing/providers — payment-провайдери, доступні юзеру (UA → liqpay/plata; інші → stripe).",
});
const TranscribeQuery = schemas.TranscribeQuerySchema.meta({
  id: "TranscribeQuery",
  description:
    "Query для POST /api/transcribe (Groq Whisper proxy): мова + prompt.",
});
const TranscribeResponse = schemas.TranscribeResponseSchema.meta({
  id: "TranscribeResponse",
  description:
    "Відповідь на POST /api/transcribe — розпізнаний текст + тривалість аудіо.",
});
const WebVitalsPayload = schemas.WebVitalsPayloadSchema.meta({
  id: "WebVitalsPayload",
  description:
    "POST /api/metrics/web-vitals — батч Core Web Vitals (LCP/INP/FCP/TTFB/CLS).",
});

// ────────────────────── Чек-скан v1 (/api/finyk/receipts/*) ───────────────
const ReceiptLookupRequest = receiptSchemas.ReceiptLookupRequestSchema.meta({
  id: "ReceiptLookupRequest",
  description:
    "POST /api/finyk/receipts/lookup — опакові поля QR фіскального чека ДПС.",
});
const ReceiptAnalyzeRequest = receiptSchemas.ReceiptAnalyzeRequestSchema.meta({
  id: "ReceiptAnalyzeRequest",
  description:
    "POST /api/finyk/receipts/analyze — base64 фото чека (vision fallback).",
});
const ReceiptDraftResponse = receiptSchemas.ReceiptDraftResponseSchema.meta({
  id: "ReceiptDraftResponse",
  description:
    "Відповідь lookup/analyze — чернетка чека БЕЗ запису в БД (`source: 'dps'|'vision'`).",
});
const ReceiptSaveRequest = receiptSchemas.ReceiptSaveRequestSchema.meta({
  id: "ReceiptSaveRequest",
  description:
    "POST /api/finyk/receipts — відредагований draft + category. Опційний " +
    "`clientScanId` (uuid) — ідемпотентність retry для vision-чеків без fiscalNum.",
});
const ReceiptSaveResponse = receiptSchemas.ReceiptSaveResponseSchema.meta({
  id: "ReceiptSaveResponse",
  description:
    "Відповідь save — 201 (новий) або 200 + alreadyExists:true (ідемпотентний повтор).",
});
const ReceiptGetResponse = receiptSchemas.ReceiptGetResponseSchema.meta({
  id: "ReceiptGetResponse",
  description: "Відповідь GET /api/finyk/receipts/{id}.",
});

// ────────────────────── Масове ведення (/api/finyk/import/*) ──────────────
const ImportScreenshotAnalyzeRequest =
  importSchemas.ImportScreenshotAnalyzeRequestSchema.meta({
    id: "ImportScreenshotAnalyzeRequest",
    description:
      "POST /api/finyk/import/screenshot/analyze — base64 скрін банкінгу.",
  });
const ImportScreenshotAnalyzeResponse =
  importSchemas.ImportScreenshotAnalyzeResponseSchema.meta({
    id: "ImportScreenshotAnalyzeResponse",
    description: "Відповідь screenshot/analyze — draft rows[] БЕЗ запису в БД.",
  });
const ImportStatementPreviewRequest =
  importSchemas.ImportStatementPreviewRequestSchema.meta({
    id: "ImportStatementPreviewRequest",
    description:
      "POST /api/finyk/import/statement/preview — рівно одне з csv_text (готовий текст) чи file_base64 (сам файл: XLSX, HTML-таблиця під іменем .xls, CSV у будь-якому кодуванні) + опційний column mapping.",
  });
const ImportStatementPreviewResponse =
  importSchemas.ImportStatementPreviewResponseSchema.meta({
    id: "ImportStatementPreviewResponse",
    description:
      "Відповідь statement/preview — discriminated за needsMapping " +
      "(profile+rows+skipped, АБО headers+sampleRows для ручного column-mapper).",
  });
const ImportCommitRequest = importSchemas.ImportCommitRequestSchema.meta({
  id: "ImportCommitRequest",
  description:
    "POST /api/finyk/import/commit — вибрані/відредаговані rows (1..5000).",
});
const ImportCommitResponse = importSchemas.ImportCommitResponseSchema.meta({
  id: "ImportCommitResponse",
  description:
    "Відповідь commit — batchId + created/linked + skipped{monoMatched,duplicate}.",
});
const ImportBatchGetResponse = importSchemas.ImportBatchGetResponseSchema.meta({
  id: "ImportBatchGetResponse",
  description: "Відповідь GET /api/finyk/import/batches/{id}.",
});
const ImportBatchUndoResponse =
  importSchemas.ImportBatchUndoResponseSchema.meta({
    id: "ImportBatchUndoResponse",
    description:
      "Відповідь DELETE /api/finyk/import/batches/{id} — undo, " +
      "ідемпотентний (tombstoned:0 на повторний виклик).",
  });

/**
 * Канонічний shape body-помилки, який віддає `apps/server/src/http/errorHandler.ts`
 * на всі 4xx/5xx відповіді через `AppError`-ієрархію (parseBody/parseQuery, auth,
 * rate-limit, generic operational/programmer errors).
 *
 * Поля:
 *  - `error` / `message` — людинозчитуваний текст. Дублюються свідомо: прямі
 *    `fetch`-споживачі історично читають `error`, better-fetch (Better Auth
 *    клієнт) читає `message`. Збігаються за значенням (див. errorHandler.ts:101).
 *  - `code` — стабільний machine-readable код (`VALIDATION`, `RATE_LIMIT`,
 *    `BAD_REQUEST`, `INTERNAL`, …).
 *  - `requestId` — кореляційний ID, опційний (можлива відсутність до того, як
 *    request-id middleware відпрацював; JSON.stringify пропускає `undefined`).
 *  - `details` — surfaced лише для operational помилок із `cause: { details }`
 *    (типовий шлях `parseBody`/`parseQuery`). На 5xx відсутній за політикою
 *    no-cause-leak (errorHandler.ts:106).
 */
const ApiError = z
  .object({
    error: z.string(),
    message: z.string(),
    code: z.string(),
    requestId: z.string().optional(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  })
  .meta({
    id: "ApiError",
    description:
      "Канонічна shape body-помилки від `errorHandler` (4xx/5xx через AppError-ієрархію).",
  });

/**
 * Каталог: routePath → spec для кожного endpoint-а.
 *
 * Експортуємо як одну функцію (а не глобальний side-effect-imports),
 * щоб тести могли мати чисту свіжу копію.
 */
export const namedSchemas = {
  User,
  MeResponse,
  UserProfilePutBody,
  UserProfileResponse,
  ChatRequest,
  ChatUsageResponse,
  RecallMemoryRequest,
  RecallMemoryResult,
  RecallMemoryResponse,
  AiMemoryClearResponse,
  AiMemoryListResponse,
  AiMemoryDeleteResponse,
  AnalyzePhoto,
  RefinePhoto,
  ParsePantry,
  BackupUpload,
  RecommendRecipes,
  DayHint,
  DayPlan,
  WeekPlan,
  ShoppingList,
  WeeklyDigest,
  CoachInsight,
  CoachMemoryPost,
  PrivatQuery,
  PushSubscribe,
  PushUnsubscribe,
  PushRegister,
  PushUnregister,
  PushSend,
  PushTestRequest,
  PushSendSummary,
  PushTestResponse,
  FoodSearchQuery,
  BarcodeQuery,
  MonoTransactionsQuery,
  MonoAccountDto,
  MonoAccountsResponse,
  MonoJarDto,
  MonoJarsResponse,
  MonoTransactionDto,
  MonoTransactionsPage,
  MonoSyncState,
  MonoConnectResponse,
  MonoDisconnectResponse,
  MonoBackfillResponse,
  MonoBackfillProgress,
  SilpoSyncState,
  SilpoDisconnectResponse,
  SilpoWipeResponse,
  SilpoSyncResult,
  SilpoReceiptItemDto,
  SilpoReceiptSummaryDto,
  SilpoReceiptDetailDto,
  SilpoReceiptsPage,
  SilpoReceiptsQuery,
  SilpoCartPreviewRequest,
  SilpoCartPreviewResponse,
  SilpoCartApplyRequest,
  SilpoCartDto,
  Pagination,
  WaitlistSubmit,
  WaitlistSubmitResponse,
  FeedbackSubmit,
  FeedbackSubmitResponse,
  BillingCheckoutRequest,
  BillingCheckoutResponse,
  BillingStatusResponse,
  BillingPortalResponse,
  BillingCancelResponse,
  BillingProvidersResponse,
  TranscribeQuery,
  TranscribeResponse,
  WebVitalsPayload,
  ReceiptLookupRequest,
  ReceiptAnalyzeRequest,
  ReceiptDraftResponse,
  ReceiptSaveRequest,
  ReceiptSaveResponse,
  ReceiptGetResponse,
  ImportScreenshotAnalyzeRequest,
  ImportScreenshotAnalyzeResponse,
  ImportStatementPreviewRequest,
  ImportStatementPreviewResponse,
  ImportCommitRequest,
  ImportCommitResponse,
  ImportBatchGetResponse,
  ImportBatchUndoResponse,
  ApiError,
} as const;

export { createDocument };
