/**
 * Sergeant Design System — CelebrationModal haptic patterns
 *
 * Dispatches a celebration-type-specific haptic sequence via
 * `expo-haptics`. Triple-success bursts for achievements/confetti,
 * rising light→medium→heavy for level-ups, fire-burst for streaks,
 * single notification for goal/success.
 *
 * Errors are swallowed: haptics may be unavailable on simulators or
 * older devices, and a celebration must never fail because of that.
 */

import * as Haptics from "expo-haptics";
import type { CelebrationType } from "./types";

export const triggerHapticPattern = async (
  type: CelebrationType,
): Promise<void> => {
  try {
    switch (type) {
      case "confetti":
      case "achievement":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 100);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 200);
        break;
      case "levelUp":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 80);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 160);
        break;
      case "streak":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(async () => {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }, 100);
        break;
      case "goal":
      case "success":
      default:
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        break;
    }
  } catch {
    // Haptics not available — silent fallback.
  }
};
