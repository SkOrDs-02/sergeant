/**
 * Sergeant Design System — CoachTip (React Native)
 *
 * Contextual coaching tips that appear to guide users.
 * Used for onboarding, feature discovery, and smart suggestions.
 *
 * Features:
 * - Animated entrance with spring physics
 * - Multiple positioning options (top, bottom, left, right)
 * - Dismissible with swipe or tap
 * - Smart coach suggestions with AI-powered content
 * - Module-specific theming
 * - Respects reduced motion preferences
 */

import * as Haptics from "expo-haptics";
import {
  ArrowRight,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Pressable,
  Text,
  View,
} from "react-native";

export type CoachTipVariant =
  | "default"
  | "suggestion"
  | "insight"
  | "goal"
  | "celebration";

export type CoachTipPosition = "top" | "bottom" | "left" | "right";

export interface CoachTipProps {
  /** Tip title */
  title?: string;
  /** Tip message content */
  message: string;
  /** Visual variant */
  variant?: CoachTipVariant;
  /** Action button label */
  actionLabel?: string;
  /** Action button callback */
  onAction?: () => void;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Auto-dismiss after ms (0 = no auto-dismiss) */
  autoDismissMs?: number;
  /** Show dismiss button */
  showDismiss?: boolean;
  /** Additional classes */
  className?: string;
}

export interface CoachTipSpotlightProps extends CoachTipProps {
  /** Position relative to target element */
  position?: CoachTipPosition;
  /** Whether the tip is visible */
  visible: boolean;
  /** Target element position (for positioning) */
  targetRect?: { x: number; y: number; width: number; height: number };
}

const variantConfig: Record<
  CoachTipVariant,
  { icon: LucideIcon; bgClass: string; iconColor: string; borderClass: string }
> = {
  default: {
    icon: Lightbulb,
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "#f59e0b",
    borderClass: "border-amber-200 dark:border-amber-800",
  },
  suggestion: {
    icon: Sparkles,
    bgClass: "bg-violet-50 dark:bg-violet-950/30",
    iconColor: "#8b5cf6",
    borderClass: "border-violet-200 dark:border-violet-800",
  },
  insight: {
    icon: TrendingUp,
    bgClass: "bg-sky-50 dark:bg-sky-950/30",
    iconColor: "#0ea5e9",
    borderClass: "border-sky-200 dark:border-sky-800",
  },
  goal: {
    icon: Target,
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "#10b981",
    borderClass: "border-emerald-200 dark:border-emerald-800",
  },
  celebration: {
    icon: Sparkles,
    bgClass: "bg-orange-50 dark:bg-orange-950/30",
    iconColor: "#f97316",
    borderClass: "border-orange-200 dark:border-orange-800",
  },
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
 * CoachTip — Contextual tip card
 */
export function CoachTip({
  title,
  message,
  variant = "default",
  actionLabel,
  onAction,
  onDismiss,
  autoDismissMs = 0,
  showDismiss = true,
  className,
}: CoachTipProps) {
  const reduceMotion = useReduceMotion();
  const config = variantConfig[variant];
  const Icon = config.icon;

  // Animation values
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 10)).current;
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.95)).current;

  // Entrance animation
  useEffect(() => {
    if (reduceMotion) return;

    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 100,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 100,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 100,
      }),
    ]).start();
  }, [reduceMotion, opacity, translateY, scale]);

  // Auto-dismiss timer
  useEffect(() => {
    if (autoDismissMs > 0 && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDismiss?.();
  }, [onDismiss]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onAction?.();
  }, [onAction]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }, { scale }],
      }}
      className={cx(
        "rounded-2xl border p-4",
        config.bgClass,
        config.borderClass,
        className,
      )}
      accessibilityRole="alert"
    >
      <View className="flex-row gap-3">
        {/* Icon */}
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: `${config.iconColor}20` }}
        >
          <Icon size={18} color={config.iconColor} strokeWidth={2} />
        </View>

        {/* Content */}
        <View className="flex-1 gap-1">
          {title && (
            <Text className="text-sm font-semibold text-fg">{title}</Text>
          )}
          <Text className="text-sm text-fg-muted leading-relaxed">
            {message}
          </Text>

          {/* Action button */}
          {actionLabel && onAction && (
            <Pressable
              onPress={handleAction}
              className="flex-row items-center gap-1 mt-2"
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: config.iconColor }}
              >
                {actionLabel}
              </Text>
              <ArrowRight size={14} color={config.iconColor} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* Dismiss button */}
        {showDismiss && onDismiss && (
          <Pressable
            onPress={handleDismiss}
            accessibilityLabel="Закрити підказку"
            accessibilityRole="button"
            className="w-6 h-6 items-center justify-center rounded-full bg-cream-200/50 dark:bg-cream-700/50 active:bg-cream-300 dark:active:bg-cream-600"
          >
            <X size={14} className="text-fg-muted" strokeWidth={2} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * CoachTipSpotlight — Positioned tip with optional spotlight effect
 */
export function CoachTipSpotlight({
  visible,
  position = "bottom",
  targetRect,
  ...props
}: CoachTipSpotlightProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(visible ? 1 : 0);
      return;
    }

    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, opacity]);

  if (!visible) return null;

  // Calculate position based on target rect
  const getPositionStyle = () => {
    if (!targetRect) return {};

    const { width: screenWidth } = Dimensions.get("window");
    const tipWidth = screenWidth - 32; // 16px padding on each side
    const arrowOffset = 16;

    switch (position) {
      case "top":
        return {
          position: "absolute" as const,
          bottom: targetRect.y + targetRect.height + arrowOffset,
          left: 16,
          right: 16,
        };
      case "bottom":
        return {
          position: "absolute" as const,
          top: targetRect.y + targetRect.height + arrowOffset,
          left: 16,
          right: 16,
        };
      case "left":
        return {
          position: "absolute" as const,
          top: targetRect.y,
          right: screenWidth - targetRect.x + arrowOffset,
          width: tipWidth * 0.6,
        };
      case "right":
        return {
          position: "absolute" as const,
          top: targetRect.y,
          left: targetRect.x + targetRect.width + arrowOffset,
          width: tipWidth * 0.6,
        };
      default:
        return {};
    }
  };

  return (
    <Animated.View style={[{ opacity }, getPositionStyle()]}>
      <CoachTip {...props} />
    </Animated.View>
  );
}

/**
 * useCoachTips — Hook for managing coach tip state
 */
export function useCoachTips(_initialTips: string[] = []) {
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [activeTip, setActiveTip] = useState<string | null>(null);

  const dismissTip = useCallback((tipId: string) => {
    setDismissedTips((prev) => new Set([...prev, tipId]));
    setActiveTip(null);
  }, []);

  const showTip = useCallback(
    (tipId: string) => {
      if (!dismissedTips.has(tipId)) {
        setActiveTip(tipId);
      }
    },
    [dismissedTips],
  );

  const isTipDismissed = useCallback(
    (tipId: string) => dismissedTips.has(tipId),
    [dismissedTips],
  );

  const isTipActive = useCallback(
    (tipId: string) => activeTip === tipId,
    [activeTip],
  );

  const resetTips = useCallback(() => {
    setDismissedTips(new Set());
    setActiveTip(null);
  }, []);

  return {
    activeTip,
    dismissTip,
    showTip,
    isTipDismissed,
    isTipActive,
    resetTips,
  };
}

/**
 * SmartCoachTip — AI-powered contextual suggestions
 */
export function SmartCoachTip({
  context: _context,
  suggestions,
  onSelect,
  onDismiss,
  className,
}: {
  context: string;
  suggestions: Array<{ id: string; message: string; action?: string }>;
  onSelect?: (id: string) => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSuggestion = suggestions[currentIndex];

  if (!currentSuggestion) return null;

  const handleNext = () => {
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleAction = () => {
    onSelect?.(currentSuggestion.id);
  };

  return (
    <View className={className}>
      <CoachTip
        title={`Порада ${currentIndex + 1}/${suggestions.length}`}
        message={currentSuggestion.message}
        variant="suggestion"
        actionLabel={currentSuggestion.action || "Спробувати"}
        onAction={handleAction}
        onDismiss={onDismiss}
      />
      {suggestions.length > 1 && currentIndex < suggestions.length - 1 && (
        <Pressable onPress={handleNext} className="mt-2 py-2 items-center">
          <Text className="text-sm text-fg-muted">
            Показати наступну пораду
          </Text>
        </Pressable>
      )}
    </View>
  );
}
