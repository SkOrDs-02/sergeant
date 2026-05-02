/**
 * Sergeant Design System — StreakFlame (React Native)
 *
 * Animated flame icon for displaying streak counts in the Routine module.
 * Features a subtle pulsing glow animation to draw attention to active streaks.
 *
 * Features:
 * - Animated pulse/glow effect for active streaks
 * - Multiple size variants
 * - Haptic feedback on milestone streaks (7, 14, 30, 60, 90, 365 days)
 * - Respects reduced motion preferences
 * - Particle effects for celebration moments
 */

import * as Haptics from "expo-haptics";
import { Flame } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { AnimatedCounter } from "./AnimatedCounter";

export type StreakFlameSize = "sm" | "md" | "lg" | "xl";

export interface StreakFlameProps {
  /** Current streak count in days */
  days: number;
  /** Size variant */
  size?: StreakFlameSize;
  /** Show the days count label */
  showLabel?: boolean;
  /** Custom label suffix (default: "днів") */
  labelSuffix?: string;
  /** Disable animation */
  disableAnimation?: boolean;
  /** Trigger celebration animation (for milestone reached) */
  celebrate?: boolean;
  /** Additional container classes */
  className?: string;
}

const sizePx: Record<StreakFlameSize, number> = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 56,
};

const labelSize: Record<StreakFlameSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-2xl",
};

const MILESTONES = [7, 14, 30, 60, 90, 180, 365];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function useReduceMotion(): boolean {
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

  return reduceMotion;
}

/**
 * FlameParticle — Small particle for celebration effect
 */
function FlameParticle({ delay, color }: { delay: number; color: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: -30 - Math.random() * 20,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: (Math.random() - 0.5) * 40,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0,
            duration: 550,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay, opacity, translateY, translateX, scale]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

/**
 * StreakFlame — Animated flame with streak counter
 */
export function StreakFlame({
  days,
  size = "md",
  showLabel = true,
  labelSuffix = "днів",
  disableAnimation = false,
  celebrate = false,
  className,
}: StreakFlameProps) {
  const reduceMotion = useReduceMotion();
  const shouldAnimate = !disableAnimation && !reduceMotion && days > 0;

  // Animation values
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  // Celebration state
  const [showParticles, setShowParticles] = useState(false);
  const prevDays = useRef(days);

  // Determine flame color based on streak length
  const getFlameColor = () => {
    if (days >= 365) return "#dc2626"; // red-600 (legendary)
    if (days >= 90) return "#ea580c"; // orange-600
    if (days >= 30) return "#f97316"; // orange-500
    if (days >= 7) return "#fb923c"; // orange-400
    return "#fdba74"; // orange-300
  };

  const flameColor = getFlameColor();

  // Check for milestone reached
  useEffect(() => {
    if (days > prevDays.current && MILESTONES.includes(days)) {
      // Milestone reached!
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 1000);
    }
    prevDays.current = days;
  }, [days]);

  // Trigger celebration
  useEffect(() => {
    if (celebrate && !reduceMotion) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 1000);
    }
  }, [celebrate, reduceMotion]);

  // Pulsing animation for active streaks
  useEffect(() => {
    if (!shouldAnimate) {
      scale.setValue(1);
      glowOpacity.setValue(0.3);
      rotation.setValue(0);
      return;
    }

    // Continuous pulse
    const pulseAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        // Subtle wobble
        Animated.sequence([
          Animated.timing(rotation, {
            toValue: 0.02,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(rotation, {
            toValue: -0.02,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(rotation, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [shouldAnimate, scale, glowOpacity, rotation]);

  const iconSize = sizePx[size];
  const isInactive = days === 0;

  // Generate label text
  const getLabelText = () => {
    if (days === 1) return "день";
    if (days >= 2 && days <= 4) return "дні";
    return labelSuffix;
  };

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Серія: ${days} ${getLabelText()}`}
      className={cx("items-center gap-1", className)}
    >
      <View className="relative items-center justify-center">
        {/* Glow effect */}
        {shouldAnimate && (
          <Animated.View
            style={{
              position: "absolute",
              width: iconSize * 1.6,
              height: iconSize * 1.6,
              borderRadius: iconSize * 0.8,
              backgroundColor: flameColor,
              opacity: glowOpacity,
            }}
          />
        )}

        {/* Flame icon */}
        <Animated.View
          style={{
            transform: [
              { scale },
              {
                rotate: rotation.interpolate({
                  inputRange: [-1, 1],
                  outputRange: ["-15deg", "15deg"],
                }),
              },
            ],
          }}
        >
          <Flame
            size={iconSize}
            color={isInactive ? "#a8a29e" : flameColor}
            fill={isInactive ? "transparent" : flameColor}
            strokeWidth={1.5}
          />
        </Animated.View>

        {/* Celebration particles */}
        {showParticles && (
          <View className="absolute" pointerEvents="none">
            {Array.from({ length: 8 }).map((_, i) => (
              <FlameParticle
                key={i}
                delay={i * 50}
                color={i % 2 === 0 ? "#fbbf24" : "#f97316"}
              />
            ))}
          </View>
        )}
      </View>

      {/* Days label */}
      {showLabel && (
        <View className="flex-row items-baseline gap-0.5">
          <AnimatedCounter
            value={days}
            className={cx(
              "font-bold tabular-nums",
              labelSize[size],
              isInactive ? "text-fg-subtle" : "text-fg",
            )}
          />
          <Text
            className={cx(
              "font-medium",
              size === "sm" ? "text-xs" : "text-xs",
              isInactive ? "text-fg-subtle" : "text-fg-muted",
            )}
          >
            {getLabelText()}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * StreakBadge — Compact streak display for lists/cards
 */
export function StreakBadge({
  days,
  className,
}: {
  days: number;
  className?: string;
}) {
  const isActive = days > 0;
  const isMilestone = MILESTONES.includes(days);

  return (
    <View
      className={cx(
        "flex-row items-center gap-1 px-2 py-1 rounded-full",
        isActive
          ? isMilestone
            ? "bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700"
            : "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700"
          : "bg-cream-100 dark:bg-cream-800 border border-line",
        className,
      )}
    >
      <Flame
        size={14}
        color={isActive ? "#f97316" : "#a8a29e"}
        fill={isActive ? "#f97316" : "transparent"}
        strokeWidth={2}
      />
      <Text
        className={cx(
          "text-xs font-semibold tabular-nums",
          isActive ? "text-orange-700 dark:text-orange-400" : "text-fg-muted",
        )}
      >
        {days}
      </Text>
    </View>
  );
}
