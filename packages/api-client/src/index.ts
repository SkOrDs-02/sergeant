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
  type MeEndpoints,
  type MeResponse,
  type User,
} from "./endpoints/me";

export {
  createSyncEndpoints,
  type SyncEndpoints,
  type ModulePullPayload,
  type ModulePushPayload,
  type ModulePushResult,
  type PullAllResult,
  type PushAllResult,
} from "./endpoints/sync";

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

// ────────────────────── OpenAPI typed client ──────────────────────
//
// Auto-generated from `docs/api/openapi.json` by `pnpm api:generate-openapi-types`.
// Single source of truth → zod schemas in `packages/shared/src/schemas/api.ts`,
// then `pnpm api:generate-openapi` (zod → spec), then types here. CI gates
// (`pnpm api:check-openapi` + `pnpm api:check-openapi-types`) fail any PR that
// touches one without the others.
//
// Use `paths` to type-route handlers and `components["schemas"]["MeResponse"]`
// to pick out a named schema. `operations` is keyed by `operationId` once the
// spec gets them populated. Keep hand-written types in `endpoints/*` as
// _the_ public surface for now — the generated ones are an additive parallel
// layer so consumers can move incrementally.
export type {
  paths as OpenApiPaths,
  components as OpenApiComponents,
  operations as OpenApiOperations,
  webhooks as OpenApiWebhooks,
} from "./generated/openapi";
