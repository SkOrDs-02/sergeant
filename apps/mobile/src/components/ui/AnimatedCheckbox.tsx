/**
 * Sergeant Design System — AnimatedCheckbox (React Native)
 *
 * Animated checkbox component for habit tracking and task completion.
 * Features a satisfying completion animation with optional confetti burst.
 *
 * Features:
 * - Animated checkmark drawing with stroke-dashoffset
 * - Scale bounce on completion
 * - Optional confetti particles for celebrations
 * - Haptic feedback on state change
 * - Multiple color variants for different modules
 * - Respects reduced motion preferences
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type CheckboxVariant =
  | "default"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type CheckboxSize = "sm" | "md" | "lg";

export interface AnimatedCheckboxProps {
  /** Checked state */
  checked: boolean;
  /** Callback when toggled */
  onToggle?: (checked: boolean) => void;
  /** Color variant */
  variant?: CheckboxVariant;
  /** Size variant */
  size?: CheckboxSize;
  /** Disable the checkbox */
  disabled?: boolean;
  /** Show confetti on check */
  showConfetti?: boolean;
  /** Additional classes */
  className?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
}

const variantColors: Record<
  CheckboxVariant,
  { bg: string; border: string; check: string }
> = {
  default: { bg: "#10b981", border: "#10b981", check: "#ffffff" },
  finyk: { bg: "#10b981", border: "#10b981", check: "#ffffff" },
  fizruk: { bg: "#14b8a6", border: "#14b8a6", check: "#ffffff" },
  routine: { bg: "#f97066", border: "#f97066", check: "#ffffff" },
  nutrition: { bg: "#84cc16", border: "#84cc16", check: "#ffffff" },
};

const sizePx: Record<CheckboxSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
};

const strokeWidths: Record<CheckboxSize, number> = {
  sm: 2,
  md: 2.5,
  lg: 3,
};

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
 * ConfettiParticle — Small celebration particle
 */
function ConfettiParticle({
  delay,
  color,
  size,
}: {
  delay: number;
  color: string;
  size: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const angle = Math.random() * Math.PI * 2;
    const distance = size * 0.8 + Math.random() * size * 0.5;
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance;

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateX, {
          toValue: targetX,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: targetY,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 10,
            stiffness: 200,
          }),
          Animated.timing(scale, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay, opacity, translateX, translateY, scale, size]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

export function AnimatedCheckbox({
  checked,
  onToggle,
  variant = "default",
  size = "md",
  disabled = false,
  showConfetti = false,
  className,
  accessibilityLabel = "Позначити як виконане",
}: AnimatedCheckboxProps) {
  const reduceMotion = useReduceMotion();
  const colors = variantColors[variant];
  const dimension = sizePx[size];
  const strokeWidth = strokeWidths[size];

  // Animation values
  const scale = useRef(new Animated.Value(1)).current;
  const bgOpacity = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const checkProgress = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const borderScale = useRef(new Animated.Value(checked ? 0 : 1)).current;

  // Confetti state
  const [showParticles, setShowParticles] = useState(false);

  // SVG measurements
  const radius = (dimension - strokeWidth) / 2;
  const center = dimension / 2;

  // Checkmark path (centered within the circle)
  const checkSize = dimension * 0.45;
  const checkPadding = (dimension - checkSize) / 2;
  const checkPath = `M ${checkPadding + checkSize * 0.15} ${checkPadding + checkSize * 0.5} L ${checkPadding + checkSize * 0.4} ${checkPadding + checkSize * 0.75} L ${checkPadding + checkSize * 0.85} ${checkPadding + checkSize * 0.25}`;
  const checkPathLength = checkSize * 1.5; // Approximate

  useEffect(() => {
    if (reduceMotion) {
      bgOpacity.setValue(checked ? 1 : 0);
      checkProgress.setValue(checked ? 1 : 0);
      borderScale.setValue(checked ? 0 : 1);
      return;
    }

    if (checked) {
      // Check animation sequence
      Animated.sequence([
        // Scale down slightly
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        // Fill in background and scale up with bounce
        Animated.parallel([
          Animated.timing(bgOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(borderScale, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 8,
            stiffness: 200,
          }),
        ]),
        // Draw checkmark
        Animated.timing(checkProgress, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Uncheck animation
      Animated.parallel([
        Animated.timing(checkProgress, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(borderScale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [checked, reduceMotion, bgOpacity, checkProgress, borderScale, scale]);

  const handlePress = () => {
    if (disabled) return;

    const newChecked = !checked;

    // Haptic feedback
    if (newChecked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      // Show confetti
      if (showConfetti && !reduceMotion) {
        setShowParticles(true);
        setTimeout(() => setShowParticles(false), 600);
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    onToggle?.(newChecked);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      className={cx("relative", className)}
    >
      <Animated.View
        style={{
          width: dimension,
          height: dimension,
          transform: [{ scale }],
        }}
      >
        <Svg width={dimension} height={dimension}>
          {/* Unchecked border */}
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={disabled ? "#d1d5db" : "#e5e7eb"}
            strokeWidth={strokeWidth}
            opacity={borderScale}
          />

          {/* Filled background */}
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            fill={disabled ? "#9ca3af" : colors.bg}
            stroke={disabled ? "#9ca3af" : colors.border}
            strokeWidth={strokeWidth}
            opacity={bgOpacity}
          />

          {/* Animated checkmark */}
          <AnimatedPath
            d={checkPath}
            fill="transparent"
            stroke={colors.check}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={checkPathLength}
            strokeDashoffset={checkProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [checkPathLength, 0],
            })}
          />
        </Svg>

        {/* Confetti particles */}
        {showParticles && (
          <View
            className="absolute inset-0 items-center justify-center"
            pointerEvents="none"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <ConfettiParticle
                key={i}
                delay={i * 30}
                color={i % 2 === 0 ? colors.bg : "#fbbf24"}
                size={dimension}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * HabitCheckbox — Pre-configured checkbox for habit tracking
 */
export function HabitCheckbox({
  checked,
  onToggle,
  habitName,
  disabled = false,
  className,
}: {
  checked: boolean;
  onToggle?: (checked: boolean) => void;
  habitName: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <AnimatedCheckbox
      checked={checked}
      onToggle={onToggle}
      variant="routine"
      size="md"
      showConfetti={true}
      disabled={disabled}
      accessibilityLabel={`${habitName}: ${checked ? "виконано" : "не виконано"}`}
      className={className}
    />
  );
}
