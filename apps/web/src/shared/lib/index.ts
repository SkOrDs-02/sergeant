/**
 * Shared lib utilities — barrel.
 *
 * Prefer importing from `@shared/lib` instead of deep paths so renames stay
 * cheap and IDE autocomplete surfaces the full API:
 *
 *   import { apiUrl, cn, friendlyApiError } from "@shared/lib";
 *
 * Deep imports (`@shared/lib/cn`) still work and remain the recommended
 * pattern for hot paths where tree-shaking clarity matters.
 *
 * Note: `HubModuleId` is intentionally re-exported from `./hubNav` only;
 * the duplicate alias in `./moduleLabels` is consumed there directly.
 */

export { formatApiError } from "./apiErrorFormat";
export type { FormatApiErrorOptions } from "./apiErrorFormat";

export { apiUrl, getApiPrefix } from "./apiUrl";

export {
  clearBearerToken,
  getBearerToken,
  setBearerToken,
} from "./bearerToken";

export { cn } from "./cn";

export {
  createModuleStorage,
  DEFAULT_DEBOUNCE_MS,
} from "./createModuleStorage";
export type {
  ModuleStorage,
  ModuleStorageOptions,
} from "./createModuleStorage";

export { webFileDownloadAdapter } from "./fileDownload";

export { webFileImportAdapter } from "./fileImport";

export { friendlyApiError } from "./friendlyApiError";

export {
  hapticCancel,
  hapticError,
  hapticPattern,
  hapticSuccess,
  hapticTap,
  hapticWarning,
  webHapticAdapter,
} from "./haptic";

export {
  HUB_OPEN_MODULE_EVENT,
  openHubModule,
  openHubModuleWithAction,
} from "./hubNav";
export type {
  HubModuleAction,
  HubModuleId,
  HubOpenModuleDetail,
} from "./hubNav";

export { MODULE_LABELS } from "./moduleLabels";

export {
  getModulePrimaryAction,
  MODULE_PRIMARY_ACTION,
} from "./moduleQuickActions";
export type { ModulePrimaryAction } from "./moduleQuickActions";

export { parseFizrukWorkouts } from "./parseFizrukWorkouts";

export { perfEnd, perfMark } from "./perf";
export type { PerfMark } from "./perf";

export {
  getStoredNativePushToken,
  subscribeNativePush,
  unsubscribeNativePush,
} from "./pushNative";
export type { NativePushPlatform, NativePushSubscription } from "./pushNative";

export {
  authAwareRetry,
  createAppQueryClient,
  isRetriableError,
} from "./queryClient";

export {
  coachKeys,
  digestKeys,
  finykKeys,
  hashToken,
  hubKeys,
  nutritionKeys,
  pushKeys,
} from "./queryKeys";

export { signedDeltaClass, transactionAmountClass } from "./amountTone";

export {
  safeReadLS,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "./storage";

export { storageManager } from "./storageManager";
export type {
  Migration,
  MigrationError,
  MigrationRunResult,
} from "./storageManager";

export {
  DEFAULT_MAX_BYTES,
  estimateUtf8Bytes,
  safeJsonSet,
  safeSetItem,
} from "./storageQuota";
export type { SafeSetOptions, SafeSetResult } from "./storageQuota";

export { THEME_HEX } from "./themeHex";

export { createTypedStore } from "./typedStore";
export type { TypedStore, TypedStoreOptions } from "./typedStore";

export { showUndoToast } from "./undoToast";
export type { UndoToastOptions } from "./undoToast";

export { hasLiveWeeklyDigest, loadDigest } from "./weeklyDigestStorage";
export type { WeeklyDigestRecord } from "./weeklyDigestStorage";

export {
  arrayToCSV,
  dataToHTMLTable,
  downloadString,
  exportToCSV,
  exportToPDF,
  generatePDFReport,
} from "./export";
export type {
  ExportColumn,
  PDFReportOptions,
  PDFReportSection,
} from "./export";
