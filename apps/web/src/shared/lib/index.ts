/**
 * Shared lib utilities — barrel.
 *
 * Prefer importing from `@shared/lib` instead of deep paths so renames stay
 * cheap and IDE autocomplete surfaces the full API:
 *
 *   import { apiUrl, cn, friendlyApiError } from "@shared/lib";
 *
 * Deep imports (`@shared/lib/<group>/<name>`) still work and remain the
 * recommended pattern for hot paths where tree-shaking clarity matters.
 *
 * Internally organized into 5 cohesive groups (see `docs/architecture/`):
 *   api/       HTTP, React Query, errors, auth
 *   storage/   localStorage / IndexedDB primitives + migrations + quota
 *   modules/   cross-module communication, navigation, registry
 *   adapters/  web shims for `@sergeant/shared` contracts
 *   ui/        rendering / styling / UI helpers
 *
 * Note: `HubModuleId` is intentionally re-exported from `./modules/hubNav`
 * only; the duplicate alias in `./modules/moduleLabels` is consumed there
 * directly.
 */

// ─── api/ ───────────────────────────────────────────────────────────────
export { formatApiError } from "./api/apiErrorFormat";
export type { FormatApiErrorOptions } from "./api/apiErrorFormat";

export { apiUrl, getApiPrefix } from "./api/apiUrl";

export {
  clearBearerToken,
  getBearerToken,
  setBearerToken,
} from "./api/bearerToken";

export { friendlyApiError } from "./api/friendlyApiError";

export {
  authAwareRetry,
  createAppQueryClient,
  isRetriableError,
} from "./api/queryClient";

export {
  coachKeys,
  digestKeys,
  finykKeys,
  hashToken,
  hubKeys,
  nutritionKeys,
  pushKeys,
} from "./api/queryKeys";

// ─── storage/ ───────────────────────────────────────────────────────────
export {
  createModuleStorage,
  DEFAULT_DEBOUNCE_MS,
} from "./storage/createModuleStorage";
export type {
  ModuleStorage,
  ModuleStorageOptions,
} from "./storage/createModuleStorage";

export {
  safeReadLS,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "./storage/storage";

export { storageManager } from "./storage/storageManager";
export type {
  Migration,
  MigrationError,
  MigrationRunResult,
} from "./storage/storageManager";

export {
  DEFAULT_MAX_BYTES,
  estimateUtf8Bytes,
  safeJsonSet,
  safeSetItem,
} from "./storage/storageQuota";
export type { SafeSetOptions, SafeSetResult } from "./storage/storageQuota";

export { createTypedStore } from "./storage/typedStore";
export type { TypedStore, TypedStoreOptions } from "./storage/typedStore";

export { hasLiveWeeklyDigest, loadDigest } from "./storage/weeklyDigestStorage";
export type { WeeklyDigestRecord } from "./storage/weeklyDigestStorage";

// ─── modules/ ───────────────────────────────────────────────────────────
export { MODULE_LABELS } from "./modules/moduleLabels";

export {
  getModulePrimaryAction,
  MODULE_PRIMARY_ACTION,
} from "./modules/moduleQuickActions";
export type { ModulePrimaryAction } from "./modules/moduleQuickActions";

export {
  HUB_OPEN_MODULE_EVENT,
  openHubModule,
  openHubModuleWithAction,
} from "./modules/hubNav";
export type {
  HubModuleAction,
  HubModuleId,
  HubOpenModuleDetail,
} from "./modules/hubNav";

// ─── adapters/ ──────────────────────────────────────────────────────────
export { webFileDownloadAdapter } from "./adapters/fileDownload";

export { webFileImportAdapter } from "./adapters/fileImport";

export {
  hapticCancel,
  hapticError,
  hapticPattern,
  hapticSuccess,
  hapticTap,
  hapticWarning,
  webHapticAdapter,
} from "./adapters/haptic";

export {
  getStoredNativePushToken,
  subscribeNativePush,
  unsubscribeNativePush,
} from "./adapters/pushNative";
export type {
  NativePushPlatform,
  NativePushSubscription,
} from "./adapters/pushNative";

// ─── ui/ ────────────────────────────────────────────────────────────────
export { signedDeltaClass, transactionAmountClass } from "./ui/amountTone";

export { cn } from "./ui/cn";

export {
  arrayToCSV,
  dataToHTMLTable,
  downloadString,
  exportToCSV,
  exportToPDF,
  generatePDFReport,
} from "./ui/export";
export type {
  ExportColumn,
  PDFReportOptions,
  PDFReportSection,
} from "./ui/export";

export { parseFizrukWorkouts } from "./ui/parseFizrukWorkouts";

export { perfEnd, perfMark } from "./ui/perf";
export type { PerfMark } from "./ui/perf";

export { THEME_HEX } from "./ui/themeHex";

export { showUndoToast } from "./ui/undoToast";
export type { UndoToastOptions } from "./ui/undoToast";
