/**
 * Sergeant Design System — BackButton (React Native)
 *
 * Unified back navigation button component used across all screens
 * that require manual navigation back (modals, nested stacks, etc.).
 *
 * Features:
 * - Multiple variants: default (cream bg), ghost, overlay (for images)
 * - Three sizes with guaranteed 44px minimum touch target (WCAG 2.5.5)
 * - Automatic navigation via expo-router when autoNavigate is true
 * - Haptic feedback on press
 * - Full accessibility support with Ukrainian labels
 *
 * Usage:
 * ```tsx
 * // Simple back button with auto navigation
 * <BackButton />
 *
 * // Custom handler
 * <BackButton onPress={() => router.replace('/home')} autoNavigate={false} />
 *
 * // Overlay variant for image backgrounds
 * <BackButton variant="overlay" />
 * ```
 */

import { forwardRef } from "react";
import { Pressable, type PressableProps, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

import { hapticTap } from "@sergeant/shared";
import { colors } from "@/theme";

export type BackButtonVariant = "default" | "ghost" | "overlay";
export type BackButtonSize = "sm" | "md" | "lg";

const variants: Record<BackButtonVariant, string> = {
  default:
    "bg-cream-100 border border-cream-200 dark:bg-cream-800 dark:border-cream-700",
  ghost: "bg-transparent",
  overlay: "bg-black/30",
};

const sizes: Record<BackButtonSize, { button: string; icon: number }> = {
  sm: { button: "h-10 w-10", icon: 20 },
  md: { button: "h-11 w-11", icon: 24 },
  lg: { button: "h-14 w-14", icon: 28 },
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface BackButtonProps extends Omit<PressableProps, "children"> {
  /** Visual variant. Defaults to "default". */
  variant?: BackButtonVariant;
  /** Size preset. All sizes maintain minimum 44px touch target. Defaults to "md". */
  size?: BackButtonSize;
  /** If true, uses router.back() automatically. Defaults to true. */
  autoNavigate?: boolean;
  /** Custom icon color. Auto-resolved based on variant if not provided. */
  iconColor?: string;
  /** Additional classes for the button container. */
  className?: string;
}

export const BackButton = forwardRef<View, BackButtonProps>(function BackButton(
  {
    variant = "default",
    size = "md",
    autoNavigate = true,
    iconColor,
    className,
    onPress,
    disabled,
    ...props
  },
  ref,
) {
  const router = useRouter();

  const handlePress = (
    e: Parameters<NonNullable<PressableProps["onPress"]>>[0],
  ) => {
    if (disabled) return;
    hapticTap();
    if (onPress) {
      onPress(e);
    } else if (autoNavigate) {
      router.back();
    }
  };

  // Resolve icon color based on variant
  const resolvedIconColor =
    iconColor ?? (variant === "overlay" ? "#ffffff" : colors.text);

  const sizeConfig = sizes[size];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel="Повернутися назад"
      accessibilityState={{ disabled: !!disabled }}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      className={cx(
        "items-center justify-center rounded-full",
        "active:opacity-70 active:scale-95",
        // Ensure minimum 44px touch target
        "min-h-[44px] min-w-[44px]",
        sizeConfig.button,
        variants[variant],
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <ChevronLeft
        size={sizeConfig.icon}
        color={resolvedIconColor}
        strokeWidth={2}
      />
    </Pressable>
  );
});

export default BackButton;
