/**
 * Sergeant Design System — FloatingActionButton (React Native)
 *
 * Material Design-inspired FAB with expandable quick actions.
 * Used for primary actions on dashboard and module screens.
 *
 * Features:
 * - Expandable menu with staggered animation
 * - Haptic feedback on interactions
 * - Module-specific theming
 * - Backdrop blur when expanded
 * - Accessibility support
 * - Mini and extended variants
 */

import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import {
  DollarSign,
  Dumbbell,
  Plus,
  Utensils,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";

export type FABVariant =
  | "primary"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";
export type FABSize = "mini" | "regular" | "extended";

export interface FABAction {
  /** Unique key */
  key: string;
  /** Icon component */
  icon: LucideIcon;
  /** Label text */
  label: string;
  /** Callback when pressed */
  onPress: () => void;
  /** Color variant (optional, uses parent variant if not specified) */
  variant?: FABVariant;
}

export interface FloatingActionButtonProps {
  /** Main button callback (if no actions provided) */
  onPress?: () => void;
  /** Expandable actions */
  actions?: FABAction[];
  /** Color variant */
  variant?: FABVariant;
  /** Size variant */
  size?: FABSize;
  /** Custom icon for main button */
  icon?: LucideIcon;
  /** Extended label (only for extended size) */
  label?: string;
  /** Position from bottom */
  bottom?: number;
  /** Position from right */
  right?: number;
  /** Disable the button */
  disabled?: boolean;
  /** Additional classes */
  className?: string;
  /** Auto-collapse after ms when expanded (default: 5000, 0 = no auto-collapse) */
  autoCollapseMs?: number;
}

const variantColors: Record<FABVariant, { bg: string; text: string }> = {
  primary: { bg: "#10b981", text: "#ffffff" },
  finyk: { bg: "#10b981", text: "#ffffff" },
  fizruk: { bg: "#14b8a6", text: "#ffffff" },
  routine: { bg: "#f97066", text: "#ffffff" },
  nutrition: { bg: "#84cc16", text: "#ffffff" },
};

const sizePx: Record<FABSize, { button: number; icon: number }> = {
  mini: { button: 40, icon: 20 },
  regular: { button: 56, icon: 24 },
  extended: { button: 48, icon: 20 },
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
 * FloatingActionButton — Main FAB component
 */
export function FloatingActionButton({
  onPress,
  actions = [],
  variant = "primary",
  size = "regular",
  icon: CustomIcon,
  label,
  bottom = 24,
  right = 24,
  disabled = false,
  className,
  autoCollapseMs = 5000,
}: FloatingActionButtonProps) {
  const reduceMotion = useReduceMotion();
  const [isExpanded, setIsExpanded] = useState(false);
  const autoCollapseTimer = useRef<NodeJS.Timeout | null>(null);

  const colors = variantColors[variant];
  const dimensions = sizePx[size];
  const hasActions = actions.length > 0;
  const Icon = CustomIcon || Plus;

  // Animation values
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Action animations
  const actionAnimations = useRef(
    actions.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
      scale: new Animated.Value(0.8),
    })),
  ).current;

  // Auto-collapse timer
  useEffect(() => {
    if (isExpanded && autoCollapseMs > 0) {
      autoCollapseTimer.current = setTimeout(() => {
        setIsExpanded(false);
        // Reset animations
        actionAnimations.forEach((anim) => {
          anim.opacity.setValue(0);
          anim.translateY.setValue(20);
          anim.scale.setValue(0.8);
        });
        rotation.setValue(0);
        backdropOpacity.setValue(0);
      }, autoCollapseMs);
    }

    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
      }
    };
  }, [isExpanded, autoCollapseMs, actionAnimations, rotation, backdropOpacity]);

  const toggleExpanded = useCallback(() => {
    const toExpanded = !isExpanded;
    setIsExpanded(toExpanded);

    Haptics.impactAsync(
      toExpanded
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});

    if (reduceMotion) {
      rotation.setValue(toExpanded ? 1 : 0);
      backdropOpacity.setValue(toExpanded ? 1 : 0);
      actionAnimations.forEach((anim) => {
        anim.opacity.setValue(toExpanded ? 1 : 0);
        anim.translateY.setValue(0);
        anim.scale.setValue(toExpanded ? 1 : 0.8);
      });
      return;
    }

    // Main button animation
    Animated.parallel([
      Animated.spring(rotation, {
        toValue: toExpanded ? 1 : 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150,
      }),
      Animated.timing(backdropOpacity, {
        toValue: toExpanded ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Staggered action animations
    if (toExpanded) {
      actionAnimations.forEach((anim, index) => {
        const delay = index * 50;
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(anim.opacity, {
              toValue: 1,
              useNativeDriver: true,
              damping: 20,
              stiffness: 100,
            }),
            Animated.spring(anim.translateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 18,
              stiffness: 100,
            }),
            Animated.spring(anim.scale, {
              toValue: 1,
              useNativeDriver: true,
              damping: 15,
              stiffness: 150,
            }),
          ]).start();
        }, delay);
      });
    } else {
      // Reverse animation for closing
      actionAnimations.forEach((anim) => {
        Animated.parallel([
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 20,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(anim.scale, {
            toValue: 0.8,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [isExpanded, reduceMotion, rotation, backdropOpacity, actionAnimations]);

  const handlePress = useCallback(() => {
    if (hasActions) {
      toggleExpanded();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onPress?.();
    }
  }, [hasActions, toggleExpanded, onPress]);

  const handleActionPress = useCallback(
    (action: FABAction) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIsExpanded(false);
      action.onPress();

      // Reset animations
      actionAnimations.forEach((anim) => {
        anim.opacity.setValue(0);
        anim.translateY.setValue(20);
        anim.scale.setValue(0.8);
      });
      rotation.setValue(0);
      backdropOpacity.setValue(0);
    },
    [actionAnimations, rotation, backdropOpacity],
  );

  const rotationInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  // Press animation
  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      damping: 20,
      stiffness: 300,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
  };

  return (
    <>
      {/* Backdrop */}
      {hasActions && isExpanded && (
        <Pressable onPress={toggleExpanded} className="absolute inset-0">
          <Animated.View
            style={{ opacity: backdropOpacity }}
            className="absolute inset-0 bg-overlay"
          />
        </Pressable>
      )}

      {/* FAB Container */}
      <View
        style={{ position: "absolute", bottom, right }}
        className={cx("items-end gap-3", className)}
      >
        {/* Action buttons */}
        {hasActions &&
          actions.map((action, index) => {
            const anim = actionAnimations[index];
            const actionColors = variantColors[action.variant || variant];
            const ActionIcon = action.icon;

            return (
              <Animated.View
                key={action.key}
                style={{
                  opacity: anim.opacity,
                  transform: [
                    { translateY: anim.translateY },
                    { scale: anim.scale },
                  ],
                }}
                className="flex-row items-center gap-3"
              >
                {/* Label */}
                <View className="px-3 py-1.5 rounded-lg bg-surface dark:bg-cream-800 shadow-sm">
                  <Text className="text-sm font-medium text-fg">
                    {action.label}
                  </Text>
                </View>

                {/* Mini FAB */}
                <Pressable
                  onPress={() => handleActionPress(action)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  style={{
                    width: sizePx.mini.button,
                    height: sizePx.mini.button,
                    backgroundColor: actionColors.bg,
                  }}
                  className="rounded-full items-center justify-center shadow-lg"
                >
                  <ActionIcon
                    size={sizePx.mini.icon}
                    color={actionColors.text}
                    strokeWidth={2.5}
                  />
                </Pressable>
              </Animated.View>
            );
          })}

        {/* Main FAB */}
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label || (hasActions ? "Швидкі дії" : "Додати")}
            accessibilityState={{ expanded: isExpanded, disabled }}
            style={{
              width: size === "extended" ? "auto" : dimensions.button,
              height: dimensions.button,
              backgroundColor: disabled ? "#9ca3af" : colors.bg,
            }}
            className={cx(
              "items-center justify-center shadow-xl",
              size === "extended"
                ? "px-5 rounded-full flex-row gap-2"
                : "rounded-full",
            )}
          >
            <Animated.View
              style={{
                transform: [
                  { rotate: hasActions ? rotationInterpolate : "0deg" },
                ],
              }}
            >
              {hasActions && isExpanded ? (
                <X
                  size={dimensions.icon}
                  color={colors.text}
                  strokeWidth={2.5}
                />
              ) : (
                <Icon
                  size={dimensions.icon}
                  color={colors.text}
                  strokeWidth={2.5}
                />
              )}
            </Animated.View>
            {size === "extended" && label && (
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.text }}
              >
                {label}
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

/**
 * Pre-configured FAB actions for modules
 */
export const moduleActions = {
  finyk: [
    {
      key: "add-expense",
      icon: DollarSign,
      label: "Витрата",
      onPress: () => {},
      variant: "finyk" as const,
    },
    {
      key: "add-income",
      icon: Plus,
      label: "Дохід",
      onPress: () => {},
      variant: "finyk" as const,
    },
  ],
  fizruk: [
    {
      key: "start-workout",
      icon: Dumbbell,
      label: "Тренування",
      onPress: () => {},
      variant: "fizruk" as const,
    },
    {
      key: "quick-log",
      icon: Zap,
      label: "Швидкий запис",
      onPress: () => {},
      variant: "fizruk" as const,
    },
  ],
  nutrition: [
    {
      key: "log-meal",
      icon: Utensils,
      label: "Їжа",
      onPress: () => {},
      variant: "nutrition" as const,
    },
    {
      key: "scan-barcode",
      icon: Plus,
      label: "Сканувати",
      onPress: () => {},
      variant: "nutrition" as const,
    },
  ],
};

/**
 * HubFAB — Pre-configured FAB for Hub dashboard
 */
export function HubFAB({
  onAddExpense,
  onAddHabit,
  onAddMeal,
  onStartWorkout,
}: {
  onAddExpense?: () => void;
  onAddHabit?: () => void;
  onAddMeal?: () => void;
  onStartWorkout?: () => void;
}) {
  const actions: FABAction[] = [];

  if (onAddExpense) {
    actions.push({
      key: "expense",
      icon: DollarSign,
      label: "Витрата",
      onPress: onAddExpense,
      variant: "finyk",
    });
  }

  if (onStartWorkout) {
    actions.push({
      key: "workout",
      icon: Dumbbell,
      label: "Тренування",
      onPress: onStartWorkout,
      variant: "fizruk",
    });
  }

  if (onAddMeal) {
    actions.push({
      key: "meal",
      icon: Utensils,
      label: "Їжа",
      onPress: onAddMeal,
      variant: "nutrition",
    });
  }

  if (onAddHabit) {
    actions.push({
      key: "habit",
      icon: Zap,
      label: "Звичка",
      onPress: onAddHabit,
      variant: "routine",
    });
  }

  return <FloatingActionButton actions={actions} variant="primary" />;
}
