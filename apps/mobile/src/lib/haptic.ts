/**
 * Mobile adapter for the shared haptic contract.
 *
 * This file registers the mobile haptic adapter with the shared contract
 * and re-exports utilities from the consolidated haptics.ts file.
 *
 * Maps the six contract primitives to `expo-haptics`:
 *  - `tap`      → `Haptics.selectionAsync()` (subtle UI select feedback);
 *  - `success`  → `Haptics.notificationAsync(Success)`;
 *  - `warning`  → `Haptics.notificationAsync(Warning)`;
 *  - `error`    → `Haptics.notificationAsync(Error)`;
 *  - `cancel`   → a light impact (`ImpactFeedbackStyle.Light`) — there is
 *    no native "cancel" haptic, so we fall back to the lightest impact
 *    the user still perceives;
 *  - `pattern`  → intentional no-op (see note below).
 *
 * Importing this module has the side-effect of registering the mobile
 * adapter on the shared contract. Do this once from `app/_layout.tsx`.
 */

import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

import { setHapticAdapter, type HapticAdapter } from "@sergeant/shared";

// Re-export utilities that are only defined in the centralized haptics module.
export {
  hapticSuccess,
  hapticWarning,
  hapticError,
  haptics,
  useHaptics,
  isHapticsSupported,
} from "./haptics";

/* ═══════════════════════════════════════════════════════════════════════════
   SAFE EXECUTION WRAPPER
   ═══════════════════════════════════════════════════════════════════════════ */

function safe(run: () => Promise<unknown> | void): void {
  try {
    // `expo-haptics` methods return Promises that may reject on
    // unsupported hardware, simulator-without-haptics, or web preview.
    // `try/catch` alone only catches synchronous throws; wrapping in
    // `Promise.resolve(...).catch(...)` also swallows async rejections
    // so React Native does not surface an unhandled-promise-rejection
    // warning (or crash in production) for every silent haptic call.
    void Promise.resolve(run()).catch(() => {
      /* unsupported hardware / web — swallow */
    });
  } catch {
    /* synchronous throw from the adapter body itself — swallow */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CORE HAPTIC ADAPTER
   ═══════════════════════════════════════════════════════════════════════════ */

export const mobileHapticAdapter: HapticAdapter = {
  tap: () => safe(() => Haptics.selectionAsync()),
  success: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
  error: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
  cancel: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  // NOTE: React Native / expo-haptics does not expose a vibrate-pattern
  // API comparable to `navigator.vibrate([on, off, on, …])`. We implement
  // a workaround using timed impacts for simple patterns.
  pattern: (pattern: number | number[]) => {
    if (typeof pattern === "number") {
      safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    }
    // Array patterns are handled via hapticSequence below
  },
};

setHapticAdapter(mobileHapticAdapter);

/* ═══════════════════════════════════════════════════════════════════════════
   ENHANCED HAPTIC UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

export type ImpactLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const IMPACT_MAP: Record<ImpactLevel, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
};

/**
 * Trigger impact feedback with specified intensity level.
 * Use for button presses, card interactions, drag operations.
 */
export function hapticImpact(level: ImpactLevel = "medium"): void {
  safe(() => Haptics.impactAsync(IMPACT_MAP[level]));
}

/**
 * Light impact — for subtle interactions like toggle switches, tab changes.
 */
export function hapticLight(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * Medium impact — for standard button presses, card selections.
 */
export function hapticMedium(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * Heavy impact — for significant actions like delete confirmations.
 */
export function hapticHeavy(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/**
 * Rigid impact — crisp, sharp feedback for precise interactions.
 */
export function hapticRigid(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

/**
 * Soft impact — gentle, cushioned feedback.
 */
export function hapticSoft(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/**
 * Selection feedback — the lightest haptic for UI selections.
 */
export function hapticSelection(): void {
  safe(() => Haptics.selectionAsync());
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATION HAPTICS
   ═══════════════════════════════════════════════════════════════════════════ */

export type NotificationType = "success" | "warning" | "error";

const NOTIFICATION_MAP: Record<
  NotificationType,
  Haptics.NotificationFeedbackType
> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/**
 * Trigger notification haptic feedback.
 */
export function hapticNotification(type: NotificationType): void {
  safe(() => Haptics.notificationAsync(NOTIFICATION_MAP[type]));
}

/* ═══════════════════════════════════════════════════════════════════════════
   HAPTIC SEQUENCES — Custom patterns for special events
   ═══════════════════════════════════════════════════════════════════════════ */

interface HapticStep {
  type: "impact" | "notification" | "selection";
  level?: ImpactLevel;
  notification?: NotificationType;
  delay?: number;
}

/**
 * Execute a sequence of haptic feedbacks with timing.
 * Useful for celebrations, achievements, and complex interactions.
 */
export async function hapticSequence(steps: HapticStep[]): Promise<void> {
  // Check reduced motion preference
  const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(
    () => false,
  );
  if (reduceMotion) {
    // Single light haptic for reduced motion users
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    return;
  }

  for (const step of steps) {
    if (step.delay) {
      await new Promise((resolve) => setTimeout(resolve, step.delay));
    }

    switch (step.type) {
      case "impact":
        safe(() => Haptics.impactAsync(IMPACT_MAP[step.level ?? "medium"]));
        break;
      case "notification":
        safe(() =>
          Haptics.notificationAsync(
            NOTIFICATION_MAP[step.notification ?? "success"],
          ),
        );
        break;
      case "selection":
        safe(() => Haptics.selectionAsync());
        break;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRE-DEFINED HAPTIC PATTERNS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Celebration haptic — triple burst for achievements and wins.
 */
export function hapticCelebration(): void {
  hapticSequence([
    { type: "notification", notification: "success" },
    { type: "impact", level: "medium", delay: 100 },
    { type: "impact", level: "light", delay: 100 },
  ]);
}

/**
 * Level up haptic — rising intensity pattern.
 */
export function hapticLevelUp(): void {
  hapticSequence([
    { type: "impact", level: "light" },
    { type: "impact", level: "medium", delay: 80 },
    { type: "impact", level: "heavy", delay: 80 },
  ]);
}

/**
 * Streak haptic — fire burst for streak achievements.
 */
export function hapticStreak(): void {
  hapticSequence([
    { type: "impact", level: "heavy" },
    { type: "notification", notification: "success", delay: 100 },
  ]);
}

/**
 * Goal complete haptic — satisfying completion feel.
 */
export function hapticGoalComplete(): void {
  hapticSequence([
    { type: "impact", level: "medium" },
    { type: "impact", level: "rigid", delay: 50 },
    { type: "notification", notification: "success", delay: 100 },
  ]);
}

/**
 * Delete/destructive action haptic — warning pattern.
 */
export function hapticDestructive(): void {
  hapticSequence([
    { type: "notification", notification: "warning" },
    { type: "impact", level: "heavy", delay: 150 },
  ]);
}

/**
 * Error haptic — double error pulse.
 */
export function hapticErrorPulse(): void {
  hapticSequence([
    { type: "notification", notification: "error" },
    { type: "notification", notification: "error", delay: 200 },
  ]);
}

/**
 * Swipe haptic — for gesture-based interactions.
 */
export function hapticSwipe(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * Drag start haptic — indicates drag operation started.
 */
export function hapticDragStart(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * Drop haptic — indicates successful drop.
 */
export function hapticDrop(): void {
  hapticSequence([
    { type: "impact", level: "heavy" },
    { type: "impact", level: "soft", delay: 50 },
  ]);
}

/**
 * Tick haptic — for incrementing values, scrolling through options.
 */
export function hapticTick(): void {
  safe(() => Haptics.selectionAsync());
}

/**
 * Toggle haptic — for switch state changes.
 */
export function hapticToggle(enabled: boolean): void {
  if (enabled) {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  } else {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REACT HOOK — useHaptic
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";

/**
 * React hook for haptic feedback with reduced motion awareness.
 * Returns memoized haptic trigger functions.
 */
export function useHaptic() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => sub.remove();
  }, []);

  const trigger = useCallback(
    (action: () => void) => {
      if (!reduceMotion) {
        action();
      }
    },
    [reduceMotion],
  );

  return {
    reduceMotion,
    tap: useCallback(() => trigger(hapticSelection), [trigger]),
    light: useCallback(() => trigger(hapticLight), [trigger]),
    medium: useCallback(() => trigger(hapticMedium), [trigger]),
    heavy: useCallback(() => trigger(hapticHeavy), [trigger]),
    success: useCallback(
      () => trigger(() => hapticNotification("success")),
      [trigger],
    ),
    warning: useCallback(
      () => trigger(() => hapticNotification("warning")),
      [trigger],
    ),
    error: useCallback(
      () => trigger(() => hapticNotification("error")),
      [trigger],
    ),
    celebration: useCallback(() => trigger(hapticCelebration), [trigger]),
    levelUp: useCallback(() => trigger(hapticLevelUp), [trigger]),
    streak: useCallback(() => trigger(hapticStreak), [trigger]),
    goalComplete: useCallback(() => trigger(hapticGoalComplete), [trigger]),
    destructive: useCallback(() => trigger(hapticDestructive), [trigger]),
    toggle: useCallback(
      (enabled: boolean) => trigger(() => hapticToggle(enabled)),
      [trigger],
    ),
  };
}
