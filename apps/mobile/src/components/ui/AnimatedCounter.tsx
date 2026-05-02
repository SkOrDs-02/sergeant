/**
 * Sergeant Design System — AnimatedCounter (React Native)
 *
 * Smoothly animates numeric value changes with spring physics.
 * Perfect for dashboard KPIs, counters, progress indicators.
 *
 * Features:
 * - Spring-based animation for natural feel
 * - Configurable number formatting (decimals, prefix, suffix)
 * - Haptic feedback on value changes (optional)
 * - Respects reduced motion preferences
 * - Supports currency formatting
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  type TextStyle,
} from "react-native";

export interface AnimatedCounterProps {
  /** Target value to animate to */
  value: number;
  /** Number of decimal places (default: 0) */
  decimals?: number;
  /** Prefix string (e.g., "$", "UAH ") */
  prefix?: string;
  /** Suffix string (e.g., "%", " kcal") */
  suffix?: string;
  /** Animation duration in ms (default: 800) */
  duration?: number;
  /** Trigger haptic feedback on change (default: false) */
  haptic?: boolean;
  /** Additional Tailwind classes */
  className?: string;
  /** Text style overrides */
  style?: TextStyle;
  /** Format number with thousands separators */
  separator?: boolean;
  /** Locale for number formatting (default: "uk-UA") */
  locale?: string;
}

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

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 800,
  haptic = false,
  className,
  style,
  separator = true,
  locale = "uk-UA",
}: AnimatedCounterProps) {
  const animatedValue = useRef(new Animated.Value(value)).current;
  const [displayValue, setDisplayValue] = useState(value);
  const reduceMotion = useReduceMotion();
  const prevValue = useRef(value);

  useEffect(() => {
    // Trigger haptic on significant value changes
    if (haptic && Math.abs(value - prevValue.current) > 0.01) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    prevValue.current = value;

    if (reduceMotion) {
      setDisplayValue(value);
      animatedValue.setValue(value);
      return;
    }

    // Animate to new value with easing
    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // Required for text interpolation
    }).start();

    // Update display value via listener
    const listenerId = animatedValue.addListener(({ value: v }) => {
      setDisplayValue(v);
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [value, duration, animatedValue, reduceMotion, haptic]);

  const formatNumber = (num: number): string => {
    const fixed = num.toFixed(decimals);
    if (!separator) return fixed;

    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(parseFloat(fixed));
    } catch {
      return fixed;
    }
  };

  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={`${prefix}${formatNumber(value)}${suffix}`}
      className={cx("font-bold tabular-nums", className)}
      style={style}
    >
      {prefix}
      {formatNumber(displayValue)}
      {suffix}
    </Text>
  );
}

/**
 * AnimatedPercentage — pre-configured counter for percentages
 */
export function AnimatedPercentage({
  value,
  ...props
}: Omit<AnimatedCounterProps, "suffix" | "decimals"> & {
  decimals?: number;
}) {
  return <AnimatedCounter value={value} suffix="%" decimals={0} {...props} />;
}

/**
 * AnimatedCurrency — pre-configured counter for currency values
 */
export function AnimatedCurrency({
  value,
  currency = "UAH",
  ...props
}: Omit<AnimatedCounterProps, "prefix" | "suffix"> & {
  currency?: "UAH" | "USD" | "EUR";
}) {
  const currencyConfig = {
    UAH: { prefix: "", suffix: " грн" },
    USD: { prefix: "$", suffix: "" },
    EUR: { prefix: "", suffix: " EUR" },
  };

  const config = currencyConfig[currency] ?? currencyConfig.UAH;

  return <AnimatedCounter value={value} decimals={2} {...config} {...props} />;
}
