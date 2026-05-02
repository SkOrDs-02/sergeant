/**
 * Sergeant Design System — EmptyState (React Native)
 *
 * Mobile port of the web `EmptyState` component for displaying
 * friendly, informative empty states when no data is available.
 *
 * @see apps/web/src/shared/components/ui/EmptyState.tsx — canonical source
 *
 * Features:
 * - Staggered fade-in animation for visual polish
 * - Icon container with subtle background
 * - Optional action button
 * - Compact variant for inline/nested usage
 * - Respects reduced motion preferences
 */

import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";

import { colors } from "@/theme";

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}

export interface EmptyStateProps {
  /** Lucide icon component to display */
  icon?: LucideIcon;
  /** Main title text */
  title?: string;
  /** Description text below title */
  description?: string;
  /** Action button configuration */
  action?: EmptyStateAction;
  /** Additional classes for the container */
  className?: string;
  /** Use compact sizing for inline contexts */
  compact?: boolean;
  /** Disable entry animation */
  disableAnimation?: boolean;
  /** Custom icon color (defaults to muted) */
  iconColor?: string;
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

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  className,
  compact = false,
  disableAnimation = false,
  iconColor, // uses the muted text colour by default
}: EmptyStateProps) {
  const reduceMotion = useReduceMotion();
  const shouldAnimate = !disableAnimation && !reduceMotion;
  // `MobileColor` exposes `textMuted`, not `subtle` — see
  // `packages/design-tokens/mobile.d.ts`.
  const resolvedIconColor = iconColor ?? colors.textMuted;

  // Pulsing animation for the icon container
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!shouldAnimate || !IconComponent) return;

    // Start subtle pulsing animation after entrance
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1.05,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.8,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.6,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ).start();
    }, 800);

    return () => clearTimeout(timeout);
  }, [shouldAnimate, IconComponent, pulseScale, pulseOpacity]);

  // Animation values for staggered entrance
  const containerOpacity = useRef(
    new Animated.Value(shouldAnimate ? 0 : 1),
  ).current;
  const containerScale = useRef(
    new Animated.Value(shouldAnimate ? 0.95 : 1),
  ).current;
  const iconOpacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const iconScale = useRef(new Animated.Value(shouldAnimate ? 0.9 : 1)).current;
  const actionOpacity = useRef(
    new Animated.Value(shouldAnimate ? 0 : 1),
  ).current;
  const actionTranslateY = useRef(
    new Animated.Value(shouldAnimate ? 8 : 0),
  ).current;

  useEffect(() => {
    if (!shouldAnimate) return;

    // Staggered entrance animation
    Animated.sequence([
      // Container fade in
      Animated.parallel([
        Animated.spring(containerOpacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 100,
        }),
        Animated.spring(containerScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 100,
        }),
      ]),
      // Icon entrance (slight delay)
      Animated.parallel([
        Animated.spring(iconOpacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 120,
        }),
        Animated.spring(iconScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 120,
        }),
      ]),
      // Action button entrance
      Animated.parallel([
        Animated.spring(actionOpacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 100,
        }),
        Animated.spring(actionTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
          stiffness: 100,
        }),
      ]),
    ]).start();
  }, [
    shouldAnimate,
    containerOpacity,
    containerScale,
    iconOpacity,
    iconScale,
    actionOpacity,
    actionTranslateY,
  ]);

  const handleActionPress = () => {
    if (action?.onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      action.onPress();
    }
  };

  return (
    <Animated.View
      style={{
        opacity: containerOpacity,
        transform: [{ scale: containerScale }],
      }}
      className={cx(
        "flex items-center justify-center",
        compact ? "py-6 px-4 gap-2" : "py-12 px-6 gap-3",
        className,
      )}
    >
      {IconComponent && (
        <Animated.View
          style={{
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          }}
        >
          {/* Pulse ring behind icon */}
          <Animated.View
            style={{
              position: "absolute",
              top: -4,
              left: -4,
              right: -4,
              bottom: -4,
              borderRadius: 20,
              backgroundColor: resolvedIconColor,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
          />
          <View
            className={cx(
              "items-center justify-center rounded-2xl bg-surface-muted border border-line",
              compact ? "w-12 h-12" : "w-16 h-16",
            )}
          >
            <IconComponent
              size={compact ? 24 : 32}
              color={resolvedIconColor}
              strokeWidth={1.5}
            />
          </View>
        </Animated.View>
      )}

      {title && (
        <Text
          className={cx(
            "font-semibold text-fg text-center",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </Text>
      )}

      {description && (
        <Text
          className={cx(
            "text-fg-muted text-center leading-relaxed max-w-xs",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </Text>
      )}

      {action && (
        <Animated.View
          style={{
            opacity: actionOpacity,
            transform: [{ translateY: actionTranslateY }],
          }}
          className="mt-2"
        >
          <Pressable
            onPress={handleActionPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className={cx(
              "px-5 py-2.5 rounded-xl active:scale-95",
              action.variant === "secondary"
                ? "bg-surface-muted border border-line"
                : "bg-brand",
            )}
          >
            <Text
              className={cx(
                "font-semibold text-sm",
                action.variant === "secondary" ? "text-fg" : "text-white",
              )}
            >
              {action.label}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/**
 * Pre-configured empty states for common scenarios
 */
export function NoDataEmptyState({
  title = "Немає даних",
  description = "Тут поки що порожньо. Додайте перший запис!",
  ...props
}: Omit<EmptyStateProps, "title" | "description"> & {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} {...props} />;
}

export function ErrorEmptyState({
  title = "Щось пішло не так",
  description = "Спробуйте оновити сторінку або повторити пізніше.",
  onRetry,
  ...props
}: Omit<EmptyStateProps, "title" | "description" | "action"> & {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        onRetry ? { label: "Спробувати знову", onPress: onRetry } : undefined
      }
      {...props}
    />
  );
}

export function SearchEmptyState({
  query,
  onClear,
  ...props
}: Omit<EmptyStateProps, "title" | "description" | "action"> & {
  query?: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      title="Нічого не знайдено"
      description={
        query
          ? `За запитом "${query}" нічого не знайдено. Спробуйте інший запит.`
          : "Спробуйте змінити параметри пошуку."
      }
      action={
        onClear
          ? { label: "Очистити пошук", onPress: onClear, variant: "secondary" }
          : undefined
      }
      {...props}
    />
  );
}
