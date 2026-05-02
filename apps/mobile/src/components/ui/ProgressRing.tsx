/**
 * Sergeant Design System — ProgressRing (React Native)
 *
 * Mobile port of the web ProgressRing component using react-native-svg.
 * Radial progress indicator with animated fill and optional center label.
 *
 * @see apps/web/src/shared/components/ui/ProgressRing.tsx — canonical source
 *
 * Features:
 * - Smooth spring animation when value changes
 * - Multiple size presets (sm, md, lg, xl)
 * - Module-specific color variants
 * - Animated center label support
 * - Respects reduced motion preferences
 * - Haptic feedback on completion (100%)
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated as RNAnimated, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useColorScheme } from "nativewind";
import { AnimatedCounter } from "./AnimatedCounter";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingVariant =
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "kcal"
  | "protein"
  | "fat"
  | "carbs";

export type ProgressRingSize = "sm" | "md" | "lg" | "xl";

const variantColors: Record<ProgressRingVariant, string> = {
  accent: "#10b981", // emerald-500
  success: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
  info: "#0ea5e9", // sky-500
  finyk: "#10b981", // emerald-500
  fizruk: "#14b8a6", // teal-500
  routine: "#f97066", // coral-500
  nutrition: "#92cc17", // lime-500
  kcal: "#f97316", // orange-500
  protein: "#3b82f6", // blue-500
  fat: "#eab308", // yellow-500
  carbs: "#22c55e", // green-500
};

const trackColorLight = "#e5e5e5"; // cream-200
const trackColorDark = "#44403c"; // cream-700

const sizePx: Record<ProgressRingSize, number> = {
  sm: 48,
  md: 72,
  lg: 96,
  xl: 128,
};

const labelTextSize: Record<ProgressRingSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-2xl",
};

export interface ProgressRingProps {
  /** Current progress value (0 to max) */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Ring size preset */
  size?: ProgressRingSize;
  /** Stroke thickness (defaults to size / 12) */
  strokeWidth?: number;
  /** Color variant */
  variant?: ProgressRingVariant;
  /** Custom center label (ReactNode or string) */
  label?: ReactNode;
  /** Show percentage text in center (default: true) */
  showPercent?: boolean;
  /** Animate the counter text */
  animateLabel?: boolean;
  /** Additional container classes */
  className?: string;
  /** Trigger haptic on 100% completion */
  hapticOnComplete?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function ProgressRing({
  value,
  max = 100,
  size = "md",
  strokeWidth,
  variant = "accent",
  label,
  showPercent = true,
  animateLabel = true,
  className,
  hapticOnComplete = true,
}: ProgressRingProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const prevValue = useRef(value);
  const { colorScheme } = useColorScheme();
  const trackColor = colorScheme === "dark" ? trackColorDark : trackColorLight;

  // Glow animation for 100% completion
  const glowOpacity = useRef(new RNAnimated.Value(0)).current;
  const glowScale = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  const diameter = sizePx[size];
  const stroke = strokeWidth ?? Math.max(2, Math.round(diameter / 12));
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = clamped / safeMax;
  const targetDashOffset = circumference * (1 - pct);

  // Animated progress
  const progress = useSharedValue(circumference);

  useEffect(() => {
    // Haptic feedback and glow on reaching 100%
    if (hapticOnComplete && pct >= 1 && prevValue.current / safeMax < 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      // Trigger glow animation
      if (!reduceMotion) {
        RNAnimated.sequence([
          RNAnimated.parallel([
            RNAnimated.timing(glowOpacity, {
              toValue: 0.6,
              duration: 300,
              useNativeDriver: true,
            }),
            RNAnimated.timing(glowScale, {
              toValue: 1.15,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          RNAnimated.parallel([
            RNAnimated.timing(glowOpacity, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
            RNAnimated.timing(glowScale, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      }
    }
    prevValue.current = value;

    if (reduceMotion) {
      progress.value = targetDashOffset;
    } else {
      progress.value = withSpring(targetDashOffset, {
        damping: 15,
        stiffness: 100,
      });
    }
  }, [
    targetDashOffset,
    progress,
    reduceMotion,
    pct,
    safeMax,
    hapticOnComplete,
    value,
    glowOpacity,
    glowScale,
  ]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  const percentText = Math.round(pct * 100);

  const displayLabel =
    label !== undefined ? (
      label
    ) : showPercent ? (
      animateLabel ? (
        <AnimatedCounter
          value={percentText}
          suffix="%"
          className={cx("font-semibold text-fg", labelTextSize[size])}
        />
      ) : (
        <Animated.Text
          className={cx(
            "font-semibold tabular-nums text-fg",
            labelTextSize[size],
          )}
        >
          {percentText}%
        </Animated.Text>
      )
    ) : null;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        now: clamped,
        min: 0,
        max: safeMax,
        text: `${percentText}%`,
      }}
      className={cx("items-center justify-center", className)}
      style={{ width: diameter, height: diameter }}
    >
      {/* Glow effect on completion */}
      <RNAnimated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: variantColors[variant],
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />
      <Svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        {/* Track circle (background) */}
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
          opacity={0.3}
        />
        {/* Progress circle (animated) */}
        <AnimatedCircle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={variantColors[variant]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      {/* Center label */}
      {displayLabel != null && (
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          {displayLabel}
        </View>
      )}
    </View>
  );
}

/**
 * ProgressRingGroup — displays multiple rings concentrically
 * Useful for macro nutrition displays (kcal, protein, fat, carbs)
 */
export interface ProgressRingGroupItem {
  value: number;
  max: number;
  variant: ProgressRingVariant;
  label?: string;
}

export function ProgressRingGroup({
  items,
  size = "xl",
  className,
}: {
  items: ProgressRingGroupItem[];
  size?: ProgressRingSize;
  className?: string;
}) {
  const { colorScheme } = useColorScheme();
  const trackColor = colorScheme === "dark" ? trackColorDark : trackColorLight;
  const diameter = sizePx[size];
  const baseStroke = Math.max(2, Math.round(diameter / 16));

  return (
    <View
      className={cx("items-center justify-center", className)}
      style={{ width: diameter, height: diameter }}
    >
      {items.map((item, index) => {
        // Each ring is slightly smaller
        const ringSize = diameter - index * (baseStroke * 2.5);
        const radius = (ringSize - baseStroke) / 2;
        const circumference = 2 * Math.PI * radius;
        const pct = Math.min(item.value / (item.max || 1), 1);
        const dashOffset = circumference * (1 - pct);

        return (
          <View
            key={index}
            className="absolute"
            style={{
              width: ringSize,
              height: ringSize,
            }}
          >
            <Svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              style={{ transform: [{ rotate: "-90deg" }] }}
            >
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={trackColor}
                strokeWidth={baseStroke}
                opacity={0.2}
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={variantColors[item.variant]}
                strokeWidth={baseStroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}
