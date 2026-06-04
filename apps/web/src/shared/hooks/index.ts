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

export {
  useTheme,
  THEME_CHOICES,
  THEME_CHOICE_ICONS,
  THEME_CHOICE_LABELS,
  THEME_CHOICE_SHORT_LABELS,
} from "./useTheme";
export type { ThemeChoice, UseThemeReturn } from "./useTheme";

export { useDebounce } from "./useDebounce";

export { useDialogFocusTrap } from "./useDialogFocusTrap";
export type { DialogFocusTrapOptions } from "./useDialogFocusTrap";

export { useLocalStorageState } from "./useLocalStorageState";
export type { UseLocalStorageStateOptions } from "./useLocalStorageState";

export { useOnlineStatus } from "./useOnlineStatus";

export { useCloudPullPending } from "./useCloudPullPending";

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

// `useWebVisualKeyboardInset`, `useScrollHeader`, and `useFormattedCountUp`
// were removed from the public barrel in DC-4 (dead-code/hard-rules-2026-05)
// — 0 external consumers found by per-symbol grep. Source files remain on
// disk (knip follow-up DC-4b will sweep them if `pnpm knip` confirms).
//   - `useWebVisualKeyboardInset` is still importable via deep path
//     `@shared/hooks/useVisualKeyboardInset` for the `main.tsx` side-effect
//     registration; do not re-introduce to barrel until a real consumer appears.

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

export { useBodyScrollLock } from "./useBodyScrollLock";

export { useFocusTrap } from "./useFocusTrap";

// `useCountUp` and `useFormattedCountUp` were removed from the public barrel
// in DC-4 (dead-code/hard-rules-2026-05) — 0 external consumers found by
// per-symbol grep. Source file `useCountUp.ts` remains on disk (knip
// follow-up DC-4b will sweep if `pnpm knip` confirms).

export { useHaptic } from "./useHaptic";
export type { UseHapticReturn } from "./useHaptic";

export { useReducedMotion } from "./useReducedMotion";

export { useShortcutGlyph } from "./useShortcutGlyph";

export { useInView } from "./useInView";
