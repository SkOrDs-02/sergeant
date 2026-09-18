/**
 * Centralized haptic feedback utilities for consistent UX.
 *
 * Haptic Guidelines:
 * - Light: Selection changes, toggle states, minor interactions
 * - Medium: Button presses, confirmations, successful actions
 * - Heavy: Destructive actions, errors, important alerts
 * - Success: Task completion, positive outcomes
 * - Warning: Caution needed, potential issues
 * - Error: Failures, validation errors
 *
 * All functions are safe to call even when haptics aren't available
 * (e.g., on Android devices without haptic support).
 */
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Check if haptics are likely supported.
 * Note: This is a best-effort check; actual support depends on device.
 */
export const isHapticsSupported =
  Platform.OS === "ios" || Platform.OS === "android";

/**
 * Safely trigger haptic feedback, catching any errors.
 */
async function safeHaptic(fn: () => Promise<void>): Promise<void> {
  if (!isHapticsSupported) return;
  try {
    await fn();
  } catch {
    // Silently fail if haptics aren't available
  }
}

// ============================================================================
// Impact Feedback
// ============================================================================

/**
 * Light impact — for selection changes, toggles, minor interactions.
 * Examples: Selecting a list item, toggling a switch, tab changes.
 */
export function hapticLight(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * Medium impact — for button presses, confirmations.
 * Examples: Primary button tap, form submission, action confirmation.
 */
export function hapticMedium(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * Heavy impact — for destructive actions, important alerts.
 * Examples: Delete confirmation, critical errors, force touch.
 */
export function hapticHeavy(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/**
 * Soft impact — subtle feedback for gentle interactions.
 * Examples: Scrolling to snap point, light touch.
 */
export function hapticSoft(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/**
 * Rigid impact — sharper feedback for precise interactions.
 * Examples: Slider stops, precise value changes.
 */
export function hapticRigid(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

// ============================================================================
// Notification Feedback
// ============================================================================

/**
 * Success notification — task completed successfully.
 * Examples: Form saved, item created, goal achieved.
 */
export function hapticSuccess(): void {
  safeHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

/**
 * Warning notification — caution needed.
 * Examples: Approaching limit, potential data loss, attention required.
 */
export function hapticWarning(): void {
  safeHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
}

/**
 * Error notification — something went wrong.
 * Examples: Validation failed, API error, action blocked.
 */
export function hapticError(): void {
  safeHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}

// ============================================================================
// Selection Feedback
// ============================================================================

/**
 * Selection changed — for picker/selection changes.
 * Examples: Date picker scroll, option selected, wheel stopped.
 */
export function hapticSelection(): void {
  safeHaptic(() => Haptics.selectionAsync());
}

// ============================================================================
// Semantic Haptics (High-Level API)
// ============================================================================

/**
 * Semantic haptic feedback for common UI patterns.
 * Use these for consistent haptic language across the app.
 */
export const haptics = {
  // Navigation
  tabChange: hapticLight,
  pageTransition: hapticLight,
  sheetOpen: hapticMedium,
  sheetClose: hapticLight,
  modalOpen: hapticMedium,
  modalClose: hapticLight,

  // Interactions
  buttonPress: hapticMedium,
  toggleOn: hapticLight,
  toggleOff: hapticLight,
  checkboxToggle: hapticLight,
  radioSelect: hapticLight,
  sliderChange: hapticSelection,
  pickerChange: hapticSelection,

  // Actions
  actionSuccess: hapticSuccess,
  actionError: hapticError,
  actionWarning: hapticWarning,
  deleteAction: hapticHeavy,
  saveAction: hapticSuccess,
  refreshComplete: hapticSuccess,

  // Gestures
  swipeOpen: hapticLight,
  swipeClose: hapticLight,
  longPress: hapticMedium,
  dragStart: hapticLight,
  dragEnd: hapticLight,
  pullToRefresh: hapticLight,

  // Feedback
  validation: {
    success: hapticSuccess,
    error: hapticError,
    warning: hapticWarning,
  },
} as const;

// ============================================================================
// Hook for conditional haptics
// ============================================================================

import { useCallback } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { useLocalStorage } from "@/lib/storage";

interface HubPrefs {
  hapticsEnabled?: boolean;
}

/**
 * Hook that returns haptic functions that respect user preferences.
 * If user has disabled haptics in settings, functions become no-ops.
 */
export function useHaptics() {
  const [prefs] = useLocalStorage<HubPrefs>(STORAGE_KEYS.HUB_PREFS, {});
  const enabled = prefs.hapticsEnabled !== false; // Default to enabled

  const conditionalHaptic = useCallback(
    (hapticFn: () => void) => {
      if (enabled) {
        hapticFn();
      }
    },
    [enabled],
  );

  return {
    enabled,
    light: () => conditionalHaptic(hapticLight),
    medium: () => conditionalHaptic(hapticMedium),
    heavy: () => conditionalHaptic(hapticHeavy),
    soft: () => conditionalHaptic(hapticSoft),
    rigid: () => conditionalHaptic(hapticRigid),
    success: () => conditionalHaptic(hapticSuccess),
    warning: () => conditionalHaptic(hapticWarning),
    error: () => conditionalHaptic(hapticError),
    selection: () => conditionalHaptic(hapticSelection),
  };
}

export default haptics;
