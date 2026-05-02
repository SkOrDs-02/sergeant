/**
 * Sergeant Design System — PullToRefresh (React Native)
 *
 * Custom pull-to-refresh indicator with branded animations.
 * Replaces the default RefreshControl with a more polished experience.
 *
 * Features:
 * - Custom spinner with brand colors
 * - Animated pull indicator with progress feedback
 * - Haptic feedback on refresh trigger
 * - Module-specific theming
 * - Works with ScrollView and FlatList
 */

import * as Haptics from "expo-haptics";
import { RefreshCw } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";

export type RefreshVariant =
  | "default"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export interface PullToRefreshProps {
  /** Whether currently refreshing */
  refreshing: boolean;
  /** Callback when refresh is triggered */
  onRefresh: () => void;
  /** Color variant */
  variant?: RefreshVariant;
  /** Custom title shown during refresh */
  title?: string;
  /** Disable haptic feedback */
  disableHaptics?: boolean;
}

const variantColors: Record<RefreshVariant, string> = {
  default: "#10b981",
  finyk: "#10b981",
  fizruk: "#14b8a6",
  routine: "#f97066",
  nutrition: "#84cc16",
};

/**
 * useRefreshControl — Hook for pull-to-refresh functionality
 */
export function useRefreshControl({
  refreshing,
  onRefresh,
  variant = "default",
  disableHaptics = false,
}: PullToRefreshProps): RefreshControlProps {
  const handleRefresh = useCallback(() => {
    if (!disableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onRefresh();
  }, [onRefresh, disableHaptics]);

  return {
    refreshing,
    onRefresh: handleRefresh,
    colors: [variantColors[variant]],
    tintColor: variantColors[variant],
    progressBackgroundColor: "#ffffff",
  };
}

/**
 * CustomRefreshControl — Branded refresh control component
 */
export function CustomRefreshControl({
  refreshing,
  onRefresh,
  variant = "default",
  title,
  disableHaptics = false,
}: PullToRefreshProps) {
  const refreshProps = useRefreshControl({
    refreshing,
    onRefresh,
    variant,
    disableHaptics,
  });

  return <RefreshControl {...refreshProps} title={title} />;
}

/**
 * AnimatedRefreshIndicator — Custom animated spinner for refresh
 */
export function AnimatedRefreshIndicator({
  progress,
  refreshing,
  variant = "default",
}: {
  progress: Animated.Value;
  refreshing: boolean;
  variant?: RefreshVariant;
}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const color = variantColors[variant];

  // Spin animation when refreshing
  React.useEffect(() => {
    if (refreshing) {
      const spin = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      );
      spin.start();
      return () => spin.stop();
    } else {
      rotation.setValue(0);
    }
  }, [refreshing, rotation]);

  const spinInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const pullRotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
    extrapolate: "clamp",
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.8, 1],
    extrapolate: "clamp",
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={{
        opacity,
        transform: [
          { scale },
          { rotate: refreshing ? spinInterpolate : pullRotation },
        ],
      }}
      className="items-center justify-center"
    >
      <RefreshCw size={24} color={color} strokeWidth={2.5} />
    </Animated.View>
  );
}

/**
 * PullToRefreshHeader — Header component for custom pull-to-refresh
 */
export function PullToRefreshHeader({
  progress,
  refreshing,
  variant = "default",
  height = 60,
}: {
  progress: Animated.Value;
  refreshing: boolean;
  variant?: RefreshVariant;
  height?: number;
}) {
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-height, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={{
        height,
        transform: [{ translateY }],
        position: "absolute",
        top: -height,
        left: 0,
        right: 0,
      }}
      className="items-center justify-center bg-cream-50"
    >
      <AnimatedRefreshIndicator
        progress={progress}
        refreshing={refreshing}
        variant={variant}
      />
    </Animated.View>
  );
}

/**
 * usePullToRefresh — Hook for implementing custom pull-to-refresh
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disableHaptics = false,
}: {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disableHaptics?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offsetY = event.nativeEvent.contentOffset.y;

      if (offsetY < 0) {
        const pullDistance = Math.abs(offsetY);
        const normalizedProgress = Math.min(pullDistance / threshold, 1);
        progress.setValue(normalizedProgress);

        if (normalizedProgress >= 1 && !triggered.current && !refreshing) {
          triggered.current = true;
          if (!disableHaptics) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              () => {},
            );
          }
        }
      } else {
        progress.setValue(0);
      }
    },
    [progress, threshold, refreshing, disableHaptics],
  );

  const handleScrollEnd = useCallback(async () => {
    if (triggered.current && !refreshing) {
      setRefreshing(true);
      progress.setValue(1);

      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        triggered.current = false;
        Animated.timing(progress, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    } else {
      triggered.current = false;
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [onRefresh, refreshing, progress]);

  return {
    progress,
    refreshing,
    handlers: {
      onScroll: handleScroll,
      onScrollEndDrag: handleScrollEnd,
      scrollEventThrottle: 16,
    },
  };
}

// Need to import React for useEffect
import React from "react";
