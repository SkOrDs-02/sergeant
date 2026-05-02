/**
 * Sergeant Design System — RefreshFeedback (React Native)
 *
 * Visual feedback component that shows what was updated after
 * a pull-to-refresh action. Displays as a brief toast-like
 * notification with update summary.
 *
 * Features:
 * - Shows count of updated items per category
 * - Auto-dismisses after a configurable duration
 * - Slide-in animation from top
 * - Haptic feedback on show
 */

import * as Haptics from "expo-haptics";
import { Check, RefreshCw } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface RefreshResult {
  /** Module or category name */
  category: string;
  /** Number of items updated */
  count: number;
  /** Icon to show (optional) */
  icon?: React.ReactNode;
}

export interface RefreshFeedbackProps {
  /** Whether to show the feedback */
  visible: boolean;
  /** Results of the refresh operation */
  results: RefreshResult[];
  /** Duration to show in ms (default: 2500) */
  duration?: number;
  /** Called when feedback is dismissed */
  onDismiss?: () => void;
  /** Custom title (default: "Оновлено") */
  title?: string;
}

export function RefreshFeedback({
  visible,
  results,
  duration = 2500,
  onDismiss,
  title = "Оновлено",
}: RefreshFeedbackProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Trigger haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      // Show animation
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      // Progress bar countdown
      progress.setValue(1);
      Animated.timing(progress, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start();

      // Auto dismiss
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss?.();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss, translateY, opacity, progress]);

  if (!visible) return null;

  const totalUpdates = results.reduce((sum, r) => sum + r.count, 0);
  const hasUpdates = totalUpdates > 0;

  return (
    <Animated.View
      style={{
        transform: [{ translateY }],
        opacity,
        position: "absolute",
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 90,
      }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View className="overflow-hidden rounded-2xl bg-success shadow-lg">
        <View className="px-4 py-3 flex-row items-center gap-3">
          <View className="w-8 h-8 rounded-xl bg-white/20 items-center justify-center">
            {hasUpdates ? (
              <Check size={18} color="#fff" strokeWidth={2.5} />
            ) : (
              <RefreshCw size={18} color="#fff" strokeWidth={2} />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white">{title}</Text>
            {hasUpdates ? (
              <View className="flex-row flex-wrap gap-x-2 mt-0.5">
                {results
                  .filter((r) => r.count > 0)
                  .map((result, index) => (
                    <Text
                      key={result.category}
                      className="text-xs text-white/80"
                    >
                      {result.category}: {result.count}
                      {index < results.filter((r) => r.count > 0).length - 1
                        ? ","
                        : ""}
                    </Text>
                  ))}
              </View>
            ) : (
              <Text className="text-xs text-white/80 mt-0.5">
                Дані актуальні
              </Text>
            )}
          </View>
        </View>
        {/* Progress bar */}
        <Animated.View
          style={{
            width: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
            height: 3,
            backgroundColor: "rgba(255,255,255,0.4)",
          }}
        />
      </View>
    </Animated.View>
  );
}

/**
 * Hook for managing refresh feedback state.
 */
export function useRefreshFeedback() {
  const [visible, setVisible] = useState(false);
  const [results, setResults] = useState<RefreshResult[]>([]);

  const show = (refreshResults: RefreshResult[]) => {
    setResults(refreshResults);
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
  };

  return {
    visible,
    results,
    show,
    hide,
    props: {
      visible,
      results,
      onDismiss: hide,
    },
  };
}
