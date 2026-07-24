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
  // AI-CONTEXT: lazy `useState` (not `useRef(...).current`) — the
  // Animated.Value is created once on mount and its identity never changes,
  // which keeps render free of ref reads (react-hooks/refs) without touching
  // animation behavior.
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const [translateX] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.5));

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

  // Animation values (lazy useState — see AI-CONTEXT in FlameParticle)
  const [scale] = useState(() => new Animated.Value(1));

  // Celebration state
  const [showParticles, setShowParticles] = useState(false);
  const prevDays = useRef(days);
  const [prevCelebrate, setPrevCelebrate] = useState(celebrate);

  // Determine flame color based on streak length.
  // Uses coral scale from design-tokens (routine module hue) instead of
  // raw orange/red hardcodes — keeps streak tiers inside the brand palette.
  const getFlameColor = () => {
    if (days >= 365) return "#a13333"; // coral-800 — legendary, AA on white
    if (days >= 90) return "#c23a3a"; // coral-700
    if (days >= 30) return "#e64d4d"; // coral-600
    if (days >= 7) return "#f97066"; // coral-500
    return "#ff8c78"; // coral-400
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

  // Trigger celebration — detect rising edge of `celebrate` at render time
  // to avoid `react-hooks/set-state-in-effect` (initiative 0021).
  if (celebrate !== prevCelebrate) {
    setPrevCelebrate(celebrate);
    if (celebrate && !reduceMotion) {
      setShowParticles(true);
    }
  }

  useEffect(() => {
    if (!celebrate || reduceMotion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    const timer = setTimeout(() => setShowParticles(false), 1000);
    return () => clearTimeout(timer);
  }, [celebrate, reduceMotion]);

  // Entrance animation: icon bounces in on mount when streak is active.
  // No persistent loop — the flame is static by default, animates only on
  // celebrate (milestone reached) via the particles system above.
  useEffect(() => {
    if (!shouldAnimate) {
      scale.setValue(1);
      return;
    }

    // Single bounce-in on mount
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.15,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 180,
      }),
    ]).start();
  }, [shouldAnimate, scale]);

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
        {/* Flame icon */}
        <Animated.View style={{ transform: [{ scale }] }}>
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
                color={i % 2 === 0 ? "#fbbf24" : "#f97066"} // amber-400 / coral-500
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
        color={isActive ? "#f97066" : "#a8a29e"} // coral-500 / stone-400
        fill={isActive ? "#f97066" : "transparent"}
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
