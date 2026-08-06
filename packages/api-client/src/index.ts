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
  type NutritionDayHintResponse,
  type NutritionDayMeal,
  type NutritionDayPlan,
  type NutritionDayPlanResponse,
  type NutritionEndpoints,
  type NutritionMacros,
  type NutritionMealType,
  type NutritionPantryItem,
  type NutritionParsePantryResponse,
  type NutritionPhotoIngredient,
  type NutritionPhotoPortion,
  type NutritionPhotoResponse,
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
