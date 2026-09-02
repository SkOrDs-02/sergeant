// Core API client
export { createApiClient } from "./createApiClient";
export type { ApiClient, ApiClientConfig } from "./createApiClient";

// HTTP primitives
export {
  createHttpClient,
  applyApiPrefix,
  DEFAULT_API_PREFIX,
  parseRetryAfterMs,
} from "./httpClient";
export type { HttpClient, HttpClientConfig, TokenProvider } from "./httpClient";

// Error types
export { ApiError, isApiError } from "./ApiError";
export type { ApiErrorInit, ApiErrorKind } from "./ApiError";

// Shared types
export type {
  HttpMethod,
  ParseMode,
  QueryValue,
  RequestOptions,
} from "./types";

// Endpoint factories and their response shapes
export {
  createMeEndpoints,
  type AiMemoryClearResponse,
  type AiMemoryDeleteResponse,
  type AiMemoryListItem,
  type AiMemoryListResponse,
  type MeDeleteResponse,
  type MeEndpoints,
  type MeExportResponse,
  type MeResponse,
  type User,
  type UserPreferences,
  type UserPreferencesPatch,
  type UserProfilePayload,
  type UserProfileResponse,
} from "./endpoints/me";

export {
  createSyncV2Endpoints,
  type SyncV2Endpoints,
  type SyncV2OpKind,
  type SyncV2OpResult,
  type SyncV2OpResultStatus,
  type SyncV2PullOp,
  type SyncV2PullOptions,
  type SyncV2PullResponse,
  type SyncV2PushOp,
  type SyncV2PushOptions,
  type SyncV2PushResponse,
} from "./endpoints/syncV2";

export {
  buildSyncV2IncrementOp,
  isIncrementOpSupported,
  INCREMENT_DELTA_MAX_ABS,
  INCREMENT_OP_SUPPORTED_TABLES,
  type BuildSyncV2IncrementOpInput,
  type BuildSyncV2IncrementOpReason,
  type BuildSyncV2IncrementOpResult,
  type IncrementOpTable,
} from "./endpoints/syncV2.increment";

export {
  mapSyncV2IncrementOpToOutboxInput,
  type OutboxIncrementInputShape,
  type SyncV2IncrementPushOp,
} from "./endpoints/syncV2.increment.outboxEnqueue";

export {
  submitSyncV2IncrementOp,
  type SubmitSyncV2IncrementOpEnqueued,
  type SubmitSyncV2IncrementOpFn,
  type SubmitSyncV2IncrementOpRejected,
  type SubmitSyncV2IncrementOpResult,
} from "./endpoints/syncV2.increment.submit";

export {
  runSyncEnginePushOnce,
  mapDrainedRowToSyncV2PushOp,
  describePushError,
  type DrainSyncOpOutboxFn,
  type DrainedOutboxRowShape,
  type MarkOutboxRejectedFn,
  type MarkOutboxRetryFn,
  type MarkOutboxSuccessFn,
  type PlanRetryFn,
  type SyncEnginePushDeps,
  type SyncEnginePushOptions,
  type SyncEnginePushResult,
  type SyncOpRetryPlanShape,
  type SyncV2PushFn,
} from "./endpoints/syncV2.pushLoop";

export {
  createSyncEnginePushScheduler,
  type SyncEngineClearIntervalFn,
  type SyncEnginePushScheduler,
  type SyncEnginePushSchedulerDeps,
  type SyncEnginePushSchedulerOptions,
  type SyncEngineSetIntervalFn,
} from "./endpoints/syncV2.pushScheduler";

export {
  createSyncEngineFlushOnReconnect,
  type SyncEngineEventTarget,
  type SyncEngineFlushOnReconnect,
  type SyncEngineFlushOnReconnectDeps,
  type SyncEngineFlushOnReconnectOptions,
  type SyncEngineFlushTriggerKind,
} from "./endpoints/syncV2.flushOnReconnect";

export {
  createCoachEndpoints,
  type CoachEndpoints,
  type CoachInsightPayload,
} from "./endpoints/coach";

export {
  createChatEndpoints,
  type ChatCallOpts,
  type ChatEndpoints,
  type ChatMessage,
  type ChatRequestPayload,
  type ChatResponse,
} from "./endpoints/chat";

export {
  createPushEndpoints,
  PushRegisterRequestSchema,
  PushRegisterResponseSchema,
  PushTestRequestSchema,
  PushTestResponseSchema,
  PushUnregisterRequestSchema,
  PushUnregisterResponseSchema,
  type PushEndpoints,
  type PushPlatform,
  type PushRegisterRequest,
  type PushRegisterResponse,
  type PushTestRequest,
  type PushTestResponse,
  type PushUnregisterRequest,
  type PushUnregisterResponse,
} from "./endpoints/push";

export {
  createNutritionEndpoints,
  type NutritionBackupDownloadResponse,
  type NutritionBackupUploadResponse,
  type NutritionDayMeal,
  type NutritionDayPlan,
  type NutritionDayPlanResponse,
  type NutritionEndpoints,
  type NutritionMacros,
  type NutritionMealType,
  type NutritionNotFoodKind,
  type NutritionPantryItem,
  type NutritionParsePantryResponse,
  type NutritionPhotoIngredient,
  type NutritionPhotoPortion,
  type NutritionPhotoResponse,
  type NutritionPhotoItem,
  type NutritionPhotoResult,
  type NutritionRecipe,
  type NutritionRecipesResponse,
  type NutritionShoppingCategory,
  type NutritionShoppingItem,
  type NutritionShoppingListResponse,
  type NutritionWeekDay,
  type NutritionWeekPlan,
  type NutritionWeekPlanResponse,
} from "./endpoints/nutrition";

export {
  createBarcodeEndpoints,
  type BarcodeEndpoints,
  type BarcodeLookupResponse,
  type BarcodeProduct,
} from "./endpoints/barcode";

export {
  createFoodSearchEndpoints,
  type FoodSearchEndpoints,
  type FoodSearchProduct,
  type FoodSearchResponse,
} from "./endpoints/foodSearch";

export {
  createMonoWebhookEndpoints,
  type MonoAccount,
  type MonoAccountDto,
  type MonoBackfillProgress,
  type MonoBackfillResponse,
  type MonoCashbackType,
  type MonoClientInfo,
  type MonoConnectResponse,
  type MonoConnectionStatus,
  type MonoDisconnectResponse,
  type MonoJar,
  type MonoJarDto,
  type MonoSyncState,
  type MonoTransactionDto,
  type MonoTransactionsPage,
  type MonoWebhookEndpoints,
} from "./endpoints/mono";

export {
  createPrivatEndpoints,
  type PrivatBalanceFinalResponse,
  type PrivatBalanceRecord,
  type PrivatCredentials,
  type PrivatEndpoints,
  type PrivatStatementEntry,
  type PrivatStatementsResponse,
} from "./endpoints/privat";

export {
  createSilpoEndpoints,
  silpoConnectUrl,
  type SilpoCartApplyRequest,
  type SilpoCartDto,
  type SilpoCartItemDto,
  type SilpoCartMatchDto,
  type SilpoCartPreviewItem,
  type SilpoCartPreviewQueryDto,
  type SilpoCartPreviewRequest,
  type SilpoCartPreviewResponse,
  type SilpoCartSelection,
  type SilpoConnectionStatus,
  type SilpoDisconnectResponse,
  type SilpoEndpoints,
  type SilpoReceiptChannel,
  type SilpoReceiptDetailDto,
  type SilpoReceiptItemDto,
  type SilpoReceiptsListParams,
  type SilpoReceiptsPage,
  type SilpoReceiptsQuery,
  type SilpoReceiptSummaryDto,
  type SilpoSyncResult,
  type SilpoSyncState,
  type SilpoRelinkResponse,
  type SilpoUnlinkResponse,
  type SilpoWipeResponse,
} from "./endpoints/silpo";

export {
  createWaitlistEndpoints,
  WaitlistSubmitRequestSchema,
  WaitlistSubmitResponseSchema,
  type WaitlistEndpoints,
  type WaitlistSubmitRequest,
  type WaitlistSubmitResponse,
} from "./endpoints/waitlist";

export {
  createFeedbackEndpoints,
  FeedbackSubmitRequestSchema,
  FeedbackSubmitResponseSchema,
  type FeedbackEndpoints,
  type FeedbackSubmitRequest,
  type FeedbackSubmitResponse,
} from "./endpoints/feedback";

export {
  createBillingEndpoints,
  BillingCheckoutRequestBodySchema,
  BillingCheckoutResponseBodySchema,
  BillingPortalResponseBodySchema,
  BillingStatusResponseBodySchema,
  type BillingCheckoutRequest,
  type BillingCheckoutResponse,
  type BillingEndpoints,
  type BillingPortalResponse,
  type BillingStatusResponse,
} from "./endpoints/billing";

export {
  createFinykEndpoints,
  ManualExpenseCreateBodySchema,
  ManualExpenseCreateResponseBodySchema,
  type FinykEndpoints,
  type ManualExpenseCreateRequest,
  type ManualExpenseCreateResponse,
} from "./endpoints/finyk";

// Чек-скан v1 (`POST/GET /api/finyk/receipts/*`) — types re-exported here
// too (not just via the composed `FinykEndpoints` above) so callers can
// import `ReceiptDraft`/`Receipt`/etc. directly.
export {
  createFinykReceiptsEndpoints,
  ReceiptAnalyzeRequestBodySchema,
  ReceiptDraftResponseBodySchema,
  ReceiptGetResponseBodySchema,
  ReceiptLookupRequestBodySchema,
  ReceiptSaveRequestBodySchema,
  ReceiptSaveResponseBodySchema,
  type FinykReceiptsEndpoints,
  type Receipt,
  type ReceiptAnalyzeRequest,
  type ReceiptDraft,
  type ReceiptDraftItem,
  type ReceiptDraftResponse,
  type ReceiptDraftSource,
  type ReceiptGetResponse,
  type ReceiptItem,
  type ReceiptLink,
  type ReceiptLookupRequest,
  type ReceiptSaveRequest,
  type ReceiptSaveResponse,
} from "./endpoints/finykReceipts";

// Масове ведення (`POST/GET/DELETE /api/finyk/import/*`).
export {
  createFinykImportEndpoints,
  ImportBatchGetResponseBodySchema,
  ImportBatchUndoResponseBodySchema,
  ImportCommitRequestBodySchema,
  ImportCommitResponseBodySchema,
  ImportScreenshotAnalyzeRequestBodySchema,
  ImportScreenshotAnalyzeResponseBodySchema,
  ImportStatementPreviewRequestBodySchema,
  ImportStatementPreviewResponseBodySchema,
  type FinykImportEndpoints,
  type ImportBatch,
  type ImportBatchGetResponse,
  type ImportBatchStatus,
  type ImportBatchUndoResponse,
  type ImportColumnMapping,
  type ImportCommitRequest,
  type ImportCommitResponse,
  type ImportCommitRow,
  type ImportDateFormat,
  type ImportDirection,
  type ImportScreenshotAnalyzeRequest,
  type ImportScreenshotAnalyzeResponse,
  type ImportScreenshotDocType,
  type ImportScreenshotDraft,
  type ImportScreenshotRow,
  type ImportSkipReason,
  type ImportSkippedRow,
  type ImportSource,
  type ImportStatementPreviewRequest,
  type ImportStatementPreviewResponse,
  type ImportStatementProfile,
  type ImportStatementRow,
} from "./endpoints/finykImport";

// Non-standard 413/415 image-validation error envelope shared by
// `analyzeReceipt` and `analyzeImportScreenshot` — NOT the standard
// `{error, message, code, requestId}` shape (see module docstring).
export {
  isImageValidationErrorBody,
  type ImageValidationErrorBody,
  type ImageValidationErrorCode,
} from "./endpoints/imageValidationError";

export {
  createWeeklyDigestEndpoints,
  type WeeklyDigestEndpoints,
  type WeeklyDigestPayload,
  type WeeklyDigestReport,
  type WeeklyDigestResponse,
} from "./endpoints/weeklyDigest";

export {
  createTranscribeEndpoints,
  TranscribeQuerySchema,
  TranscribeResponseSchema,
  type TranscribeBody,
  type TranscribeEndpoints,
  type TranscribeOutcome,
  type TranscribeQuery,
  type TranscribeResponse,
} from "./endpoints/transcribe";

export {
  createWebVitalsEndpoints,
  WebVitalsPayloadSchema,
  type WebVitalsEndpoints,
  type WebVitalsPayload,
} from "./endpoints/webVitals";
