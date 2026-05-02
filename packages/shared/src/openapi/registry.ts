import { createDocument } from "zod-openapi";
import { z } from "zod";

import * as schemas from "../schemas/api";

/**
 * Builds OpenAPI 3.1 document from zod-схем у `@sergeant/shared/schemas/api`.
 *
 * Використовує `zod-openapi@5` (нативний `.meta()` API zod v4) — без
 * prototype-патчів і без runtime-augmentation. Кожна named-схема дістає
 * stable component ID через `.meta({ id })`, після чого в OpenAPI
 * `#/components/schemas/<id>` формується автоматично з `$ref`-ом.
 *
 * Caller має імпортувати `./routes` перед викликом, щоб route-каталог
 * зареєструвався у локальному об'єкті `paths`.
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
const ChatRequest = schemas.ChatRequestSchema.meta({
  id: "ChatRequest",
  description:
    "POST /api/chat — Anthropic-чат із tool-results і опційним streaming.",
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
const SyncPush = schemas.SyncPushSchema.meta({
  id: "SyncPush",
  description: "POST /api/sync/push (per-module LWW).",
});
const SyncPull = schemas.SyncPullSchema.meta({
  id: "SyncPull",
  description: "POST /api/sync/pull (per-module).",
});
const SyncPushAll = schemas.SyncPushAllSchema.meta({
  id: "SyncPushAll",
  description: "POST /api/sync/push-all (bulk).",
});
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

/** Стандартна 400-помилка для validateBody. */
const ApiError = z
  .object({
    error: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  })
  .meta({
    id: "ApiError",
    description: "Стандартна shape 400-помилки після `validateBody`.",
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
  ChatRequest,
  RecallMemoryRequest,
  RecallMemoryResult,
  RecallMemoryResponse,
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
  SyncPush,
  SyncPull,
  SyncPushAll,
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
  MonoTransactionDto,
  MonoTransactionsPage,
  MonoSyncState,
  MonoConnectResponse,
  MonoDisconnectResponse,
  MonoBackfillResponse,
  Pagination,
  WaitlistSubmit,
  WaitlistSubmitResponse,
  TranscribeQuery,
  TranscribeResponse,
  WebVitalsPayload,
  ApiError,
} as const;

export { createDocument };
