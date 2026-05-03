/**
 * Web adapter for the shared haptic contract.
 *
 * Binds the `@sergeant/shared` haptic contract to `navigator.vibrate`
 * with the same guards the web app has always relied on:
 *  1) no-op when the user has `prefers-reduced-motion: reduce`;
 *  2) no-op on platforms without `navigator.vibrate` (iOS Safari,
 *     desktop);
 *  3) swallows exceptions — some mobile Chrome builds throw
 *     `NotAllowedError` when `vibrate` is called outside a user
 *     gesture, or throttle the call silently.
 *
 * Importing this module has the side-effect of registering the web
 * adapter on the shared contract, so existing
 * `import { hapticTap } from "@shared/lib/adapters/haptic"` call sites keep
 * working unchanged.
 */

import {
  hapticCancel,
  hapticError,
  hapticPattern,
  hapticSuccess,
  hapticTap,
  hapticWarning,
  setHapticAdapter,
  type HapticAdapter,
} from "@sergeant/shared";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}

function vibrate(pattern: number | number[]): void {
  if (!canVibrate() || prefersReducedMotion()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop — NotAllowedError / throttled by browser */
  }
}

export const webHapticAdapter: HapticAdapter = {
  tap: () => vibrate(10),
  success: () => vibrate([12, 40, 18]),
  warning: () => vibrate(30),
  error: () => vibrate([60, 60, 60]),
  cancel: () => {
    // Intentionally bypasses the reduced-motion guard — cancelling an
    // in-flight vibration should always succeed regardless of the
    // user's motion preference.
    if (!canVibrate()) return;
    try {
      navigator.vibrate(0);
    } catch {
      /* noop */
    }
  },
  pattern: vibrate,
};

setHapticAdapter(webHapticAdapter);

export {
  hapticCancel,
  hapticError,
  hapticPattern,
  hapticSuccess,
  hapticTap,
  hapticWarning,
};
