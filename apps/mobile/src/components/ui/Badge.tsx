/**
 * Sergeant Design System — Badge (React Native)
 *
 * Mobile port of the web `Badge` primitive. Compact pill for status,
 * counts and labels.
 *
 * @see apps/web/src/shared/components/ui/Badge.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same `BadgeVariant` enum (neutral/accent/success/warning/danger/info +
 *   four module brand colours).
 * - Same `BadgeTone` (soft / solid / outline) and `BadgeSize` (xs/sm/md).
 * - Same API surface: `variant`, `tone`, `size`, `dot`, `className`, children.
 *
 * Differences from web (intentional):
 * - Wraps `<View>` + inner `<Text>` (NativeWind cannot colour-inherit
 *   through nested Text on RN, so callers pass plain strings — we wrap
 *   them ourselves). JSX children (e.g. leading icon) render as siblings.
 * - Dot is a plain `<View>` with `bg-current` approximation via the
 *   variant's text tint (drops back to the shared tone-fg palette).
 * - Status bg-*-soft tokens resolve through the same semantic CSS
 *   variables as web (see `apps/mobile/global.css`).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Text, View, type ViewProps } from "react-native";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type BadgeTone = "soft" | "solid" | "outline";

export type BadgeSize = "xs" | "sm" | "md";

const solidVariants: Record<BadgeVariant, string> = {
  neutral: "bg-fg-muted/90",
  accent: "bg-brand-strong",
  success: "bg-success-strong",
  warning: "bg-warning-strong",
  danger: "bg-danger-strong",
  info: "bg-info-strong",
  finyk: "bg-finyk-strong",
  fizruk: "bg-fizruk-strong",
  routine: "bg-routine-strong",
  nutrition: "bg-nutrition-strong",
};

const softVariants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted border border-line",
  accent: "bg-success-soft border border-success/30",
  success: "bg-success-soft border border-success/30",
  warning: "bg-warning-soft border border-warning/30",
  danger: "bg-danger-soft border border-danger/30",
  info: "bg-info-soft border border-info/30",
  finyk: "bg-finyk-soft border border-finyk/30",
  fizruk: "bg-fizruk-soft border border-fizruk/30",
  routine: "bg-routine-surface border border-routine/30",
  nutrition: "bg-nutrition-soft border border-nutrition/30",
};

const outlineVariants: Record<BadgeVariant, string> = {
  neutral: "border border-line bg-transparent",
  accent: "border border-accent/60 bg-transparent",
  success: "border border-success/60 bg-transparent",
  warning: "border border-warning/60 bg-transparent",
  danger: "border border-danger/60 bg-transparent",
  info: "border border-info/60 bg-transparent",
  finyk: "border border-finyk/60 bg-transparent",
  fizruk: "border border-fizruk/60 bg-transparent",
  routine: "border border-routine/60 bg-transparent",
  nutrition: "border border-nutrition/60 bg-transparent",
};

const solidText: Record<BadgeVariant, string> = {
  neutral: "text-surface",
  accent: "text-white",
  success: "text-white",
  warning: "text-white",
  danger: "text-white",
  info: "text-white",
  finyk: "text-white",
  fizruk: "text-white",
  routine: "text-white",
  nutrition: "text-white",
};

const softText: Record<BadgeVariant, string> = {
  neutral: "text-fg-muted",
  accent: "text-brand-700",
  success: "text-brand-700",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  finyk: "text-finyk-strong",
  fizruk: "text-fizruk-strong",
  routine: "text-routine-strong",
  nutrition: "text-nutrition-strong",
};

const outlineText: Record<BadgeVariant, string> = softText;

const sizes: Record<BadgeSize, string> = {
  xs: "h-5 px-1.5 rounded-md",
  sm: "h-6 px-2 rounded-lg",
  md: "h-7 px-2.5 rounded-xl",
};

const textSizes: Record<BadgeSize, string> = {
  xs: "text-2xs",
  sm: "text-xs",
  md: "text-xs",
};

const dotSizes: Record<BadgeSize, string> = {
  xs: "w-1.5 h-1.5 mr-1",
  sm: "w-1.5 h-1.5 mr-1",
  md: "w-2 h-2 mr-1.5",
};

// RN has no CSS `currentColor`, so the leading status dot uses an
// explicit bg per variant. Solid tone shows a contrasting dot (white on
// filled bg); soft/outline render the variant's accent tint.
const solidDot: Record<BadgeVariant, string> = {
  neutral: "bg-surface",
  accent: "bg-white",
  success: "bg-white",
  warning: "bg-white",
  danger: "bg-white",
  info: "bg-white",
  finyk: "bg-white",
  fizruk: "bg-white",
  routine: "bg-white",
  nutrition: "bg-white",
};

const softDot: Record<BadgeVariant, string> = {
  neutral: "bg-fg-muted",
  accent: "bg-brand",
  success: "bg-brand",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Leading dot (useful for status indicators). */
  dot?: boolean;
  /** Animate the dot with a pulse effect (for live/new indicators). */
  pulse?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Badge({
  variant = "neutral",
  tone = "soft",
  size = "sm",
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}: BadgeProps) {
  // Pulse animation for live indicators
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || !dot) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.8,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse, dot, pulseScale, pulseOpacity]);
  const containerMap =
    tone === "solid"
      ? solidVariants
      : tone === "outline"
        ? outlineVariants
        : softVariants;
  const textMap =
    tone === "solid" ? solidText : tone === "outline" ? outlineText : softText;
  const dotMap = tone === "solid" ? solidDot : softDot;

  return (
    <View
      className={cx(
        "flex-row items-center self-start",
        sizes[size],
        containerMap[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <View className="relative">
          {pulse && (
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }}
              className={cx("rounded-full", dotSizes[size], dotMap[variant])}
            />
          )}
          <View
            accessibilityElementsHidden
            className={cx("rounded-full", dotSizes[size], dotMap[variant])}
          />
        </View>
      )}
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cx("font-semibold", textSizes[size], textMap[variant])}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
