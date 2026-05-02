/**
 * LoadingOverlay — full-screen or inline loading indicator with optional message.
 *
 * Use for:
 * - API calls in progress
 * - Form submissions
 * - Page transitions
 * - Heavy computations
 *
 * @example
 * ```tsx
 * <LoadingOverlay
 *   visible={isLoading}
 *   message="Завантаження даних..."
 * />
 * ```
 */
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Modal,
  Text,
  View,
} from "react-native";

import { colors } from "@/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";

export interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Optional loading message */
  message?: string;
  /** Whether to show as a modal overlay (default) or inline */
  inline?: boolean;
  /** Test ID for testing */
  testID?: string;
  /** Background style: blur, dim, or transparent */
  background?: "blur" | "dim" | "transparent";
  /** Size of the spinner */
  size?: "small" | "large";
  /** Color of the spinner */
  color?: string;
}

export function LoadingOverlay({
  visible,
  message,
  inline = false,
  testID = "loading-overlay",
  background = "dim",
  size = "large",
  color = colors.accent,
}: LoadingOverlayProps) {
  const reduceMotion = useReduceMotion();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Announce to screen readers
      AccessibilityInfo.announceForAccessibility(message || "Завантаження…");

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: reduceMotion ? 0 : 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: reduceMotion ? 0 : 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, reduceMotion, fadeAnim, message]);

  const backgroundStyle = {
    blur: "bg-white/80 dark:bg-black/80",
    dim: "bg-black/40",
    transparent: "bg-transparent",
  }[background];

  const content = (
    <Animated.View
      style={{ opacity: fadeAnim }}
      className={`flex-1 items-center justify-center ${inline ? "" : backgroundStyle}`}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={message || "Завантаження"}
      accessibilityLiveRegion="polite"
      accessibilityViewIsModal={!inline}
    >
      <View className="items-center gap-4 p-6 rounded-2xl bg-panel shadow-lg">
        <ActivityIndicator size={size} color={color} />
        {message && (
          <Text className="text-fg text-sm font-medium text-center max-w-[200px]">
            {message}
          </Text>
        )}
      </View>
    </Animated.View>
  );

  if (inline) {
    return visible ? content : null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        // Prevent back button from closing
      }}
    >
      {content}
    </Modal>
  );
}

/**
 * Inline loading indicator — smaller, for use within cards or sections.
 */
export function InlineLoader({
  message,
  size = "small",
  testID = "inline-loader",
}: {
  message?: string;
  size?: "small" | "large";
  testID?: string;
}) {
  return (
    <View
      className="flex-row items-center justify-center gap-2 py-4"
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={message || "Завантаження"}
    >
      <ActivityIndicator size={size} color={colors.accent} />
      {message && <Text className="text-fg-muted text-sm">{message}</Text>}
    </View>
  );
}

/**
 * Full-page loading state with centered spinner.
 */
export function FullPageLoader({
  message,
  testID = "full-page-loader",
}: {
  message?: string;
  testID?: string;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      message || "Завантаження сторінки…",
    );
  }, [message]);

  return (
    <View
      className="flex-1 bg-bg items-center justify-center"
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={message || "Завантаження сторінки"}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      {message && (
        <Text className="text-fg-muted text-sm mt-4 text-center px-6">
          {message}
        </Text>
      )}
    </View>
  );
}

export default LoadingOverlay;
