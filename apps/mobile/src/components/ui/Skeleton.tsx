/**
 * Sergeant Design System — Skeleton (React Native)
 *
 * Mobile port of the web `Skeleton` / `SkeletonText` placeholders.
 * Used while async data is in flight — a soft, pulsing panel that
 * reserves layout space without shifting the page.
 *
 * @see apps/web/src/shared/components/ui/Skeleton.tsx — canonical source of truth
 *
 * Features:
 * - Shimmer animation: A subtle light gradient sweeps across the skeleton
 *   for a modern, polished loading effect (inspired by Facebook/Instagram).
 * - Pulse fallback: Falls back to opacity pulse when shimmer is disabled.
 * - SkeletonCard: Pre-composed card skeleton for dashboard loading states.
 * - SkeletonAvatar: Circular skeleton for profile pictures.
 * - WCAG 2.3.3 / Apple HIG reduced-motion contract respected.
 *
 * Parity notes:
 * - Same `SkeletonProps` shape (`className`).
 * - Both `Skeleton` (block) and `SkeletonText` (inline-line) are
 *   exported with the same roles as on web.
 * - Same default visuals: `bg-panelHi`, `rounded-2xl` for the block,
 *   `rounded-lg h-3` for the text line.
 *
 * Differences from web (intentional):
 * - Shimmer effect uses `LinearGradient` + `Animated.loop` for translateX.
 * - `aria-hidden="true"` → `accessibilityElementsHidden` + an
 *   `importantForAccessibility="no-hide-descendants"` pair so both
 *   iOS and Android screen-readers skip the placeholder.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  StyleSheet,
  View,
} from "react-native";

export interface SkeletonProps {
  className?: string;
  /** Use shimmer effect instead of pulse. Default: true */
  shimmer?: boolean;
  /**
   * Optional explicit pixel size. When set on `SkeletonAvatar`, drives both
   * width and height (and the matching half-circle radius). Plain `Skeleton`
   * / `SkeletonText` ignore this and rely on `className`.
   */
  size?: number;
}

export interface SkeletonCardProps {
  className?: string;
  /** Number of text lines to show. Default: 3 */
  lines?: number;
  /** Show avatar circle. Default: false */
  showAvatar?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Ignore — default to motion-enabled
      });

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}

function useShimmer(): Animated.Value {
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      translateX.stopAnimation();
      translateX.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [translateX, reduceMotion]);

  return translateX;
}

function usePulse(): Animated.AnimatedInterpolation<number> | 1 {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  if (reduceMotion) return 1;
  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.6],
  });
}

const shimmerStyles = StyleSheet.create({
  shimmerContainer: {
    overflow: "hidden",
  },
  shimmerGradient: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
  },
});

function ShimmerOverlay() {
  const translateX = useShimmer();
  return (
    <Animated.View
      style={[shimmerStyles.shimmerGradient, { transform: [{ translateX }] }]}
    >
      <LinearGradient
        colors={[
          "transparent",
          "rgba(255, 255, 255, 0.4)",
          "rgba(255, 255, 255, 0.6)",
          "rgba(255, 255, 255, 0.4)",
          "transparent",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export function Skeleton({ className, shimmer = true }: SkeletonProps) {
  const opacity = usePulse();
  const reduceMotion = useReduceMotion();

  if (shimmer && !reduceMotion) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={shimmerStyles.shimmerContainer}
        className={cx("bg-cream-200 rounded-2xl", className)}
      >
        <ShimmerOverlay />
      </View>
    );
  }

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity }}
      className={cx("bg-cream-200 rounded-2xl", className)}
    />
  );
}

export function SkeletonText({ className, shimmer = true }: SkeletonProps) {
  const opacity = usePulse();
  const reduceMotion = useReduceMotion();

  if (shimmer && !reduceMotion) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={shimmerStyles.shimmerContainer}
        className={cx("bg-cream-200 rounded-lg h-3", className)}
      >
        <ShimmerOverlay />
      </View>
    );
  }

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity }}
      className={cx("bg-cream-200 rounded-lg h-3", className)}
    />
  );
}

/**
 * SkeletonAvatar — circular skeleton for profile pictures and icons.
 *
 * Use either `size` (pixel value, drives width/height/radius via inline
 * style) or `className` (Tailwind utilities) — not both.
 */
export function SkeletonAvatar({
  className,
  shimmer = true,
  size,
}: SkeletonProps) {
  const opacity = usePulse();
  const reduceMotion = useReduceMotion();
  const sizeStyle =
    typeof size === "number"
      ? { width: size, height: size, borderRadius: size / 2 }
      : undefined;
  const fallbackClass = sizeStyle
    ? "bg-cream-200 rounded-full"
    : "bg-cream-200 rounded-full w-12 h-12";

  if (shimmer && !reduceMotion) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[shimmerStyles.shimmerContainer, sizeStyle]}
        className={cx(fallbackClass, className)}
      >
        <ShimmerOverlay />
      </View>
    );
  }

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ opacity }, sizeStyle]}
      className={cx(fallbackClass, className)}
    />
  );
}

/**
 * SkeletonCard — pre-composed card skeleton for dashboard loading states.
 * Mimics typical card layouts with optional avatar, title, and text lines.
 */
export function SkeletonCard({
  className,
  lines = 3,
  showAvatar = false,
}: SkeletonCardProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cx(
        "bg-cream-50 rounded-2xl p-4 border border-cream-200",
        className,
      )}
    >
      {showAvatar && (
        <View className="flex-row items-center gap-3 mb-4">
          <SkeletonAvatar className="w-10 h-10" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-3/4 rounded-lg" />
            <Skeleton className="h-3 w-1/2 rounded-lg" />
          </View>
        </View>
      )}
      {!showAvatar && <Skeleton className="h-5 w-2/3 rounded-lg mb-3" />}
      <View className="gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonText
            key={i}
            className={cx("h-3", i === lines - 1 ? "w-4/5" : "w-full")}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * SkeletonList — renders multiple skeleton cards for list loading states.
 */
export function SkeletonList({
  count = 3,
  showAvatar = false,
  className,
}: {
  count?: number;
  showAvatar?: boolean;
  className?: string;
}) {
  return (
    <View className={cx("gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} showAvatar={showAvatar} lines={2} />
      ))}
    </View>
  );
}
