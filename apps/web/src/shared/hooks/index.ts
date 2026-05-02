/**
 * Shared React hooks — barrel.
 *
 * Prefer importing from `@shared/hooks` instead of deep paths so renames
 * stay cheap and IDE autocomplete surfaces the full API:
 *
 *   import { useDebounce, useOnlineStatus, useToast } from "@shared/hooks";
 *
 * Deep imports (`@shared/hooks/useDebounce`) still work and remain the
 * recommended pattern for hot paths where tree-shaking clarity matters.
 */

export { useActiveFizrukWorkout } from "./useActiveFizrukWorkout";

export { useDarkMode } from "./useDarkMode";

export { useDebounce } from "./useDebounce";

export { useDialogFocusTrap } from "./useDialogFocusTrap";
export type { DialogFocusTrapOptions } from "./useDialogFocusTrap";

export { useHashRoute } from "./useHashRoute";
export type {
  HashRoute,
  UseHashRouteOptions,
  UseHashRouteResult,
} from "./useHashRoute";

export { useLocalStorageState } from "./useLocalStorageState";
export type { UseLocalStorageStateOptions } from "./useLocalStorageState";

export { useOnlineStatus } from "./useOnlineStatus";

export { usePushNotifications } from "./usePushNotifications";
export type { UsePushNotificationsResult } from "./usePushNotifications";

export {
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from "./usePushNotifications.webpush";
export type { WebPushSubscriptionPayload } from "./usePushNotifications.webpush";

export { usePwaAction } from "./usePwaAction";
export type { PwaActionHandler } from "./usePwaAction";

export { ToastProvider, useToast } from "./useToast";
export type {
  ToastAction,
  ToastApi,
  ToastContextValue,
  ToastItem,
  ToastType,
} from "./useToast";

export { useWebVisualKeyboardInset } from "./useVisualKeyboardInset";

export { useScrollHeader } from "./useScrollHeader";
export type {
  ScrollHeaderState,
  UseScrollHeaderOptions,
} from "./useScrollHeader";

export { usePullToRefresh } from "./usePullToRefresh";
export type {
  PullToRefreshState,
  UsePullToRefreshOptions,
} from "./usePullToRefresh";

export { useSwipeToDismiss } from "./useSwipeToDismiss";
export type {
  SwipeBind,
  UseSwipeToDismissOptions,
  UseSwipeToDismissReturn,
} from "./useSwipeToDismiss";

export { useFocusTrap } from "./useFocusTrap";

export { useFormValidation, validationRules } from "./useFormValidation";
export type { UseFormValidationReturn } from "./useFormValidation";

export { useCountUp, useFormattedCountUp } from "./useCountUp";

export type { DarkModeSchedule, UseDarkModeReturn } from "./useDarkMode";

export { useHaptic } from "./useHaptic";
export type { UseHapticReturn } from "./useHaptic";

export { useReducedMotion } from "./useReducedMotion";
