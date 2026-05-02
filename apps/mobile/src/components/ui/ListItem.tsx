/**
 * Sergeant Design System - ListItem (React Native)
 *
 * Optimized list item component with proper touch targets (min 48px height),
 * haptic feedback, and accessibility support.
 *
 * Features:
 * - Minimum 48px touch target height (exceeds WCAG 2.5.5 minimum of 44px)
 * - Optional haptic feedback on press
 * - Leading icon/avatar slot
 * - Trailing action/chevron slot
 * - Subtitle support
 * - Disabled and selected states
 */

import { forwardRef, type ReactNode } from "react";
import {
  Pressable,
  type PressableProps,
  Text,
  View,
  type View as RNView,
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { hapticTap } from "@sergeant/shared";
import { colors } from "@/theme";
import { SectionHeading } from "./SectionHeading";

export type ListItemSize = "sm" | "md" | "lg";

const sizes: Record<
  ListItemSize,
  { container: string; title: string; subtitle: string }
> = {
  sm: {
    container: "min-h-[48px] py-2.5 px-4",
    title: "text-sm",
    subtitle: "text-xs",
  },
  md: {
    container: "min-h-[56px] py-3 px-4",
    title: "text-base",
    subtitle: "text-sm",
  },
  lg: {
    container: "min-h-[64px] py-4 px-4",
    title: "text-lg",
    subtitle: "text-sm",
  },
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface ListItemProps extends Omit<
  PressableProps,
  "children" | "style"
> {
  /** Primary text content */
  title: string;
  /** Secondary text below title */
  subtitle?: string;
  /** Size preset - affects height and text size */
  size?: ListItemSize;
  /** Leading content (icon, avatar, checkbox) */
  leading?: ReactNode;
  /** Trailing content (action button, badge, switch) */
  trailing?: ReactNode;
  /** Show chevron arrow on right side */
  showChevron?: boolean;
  /** Selected/active state styling */
  selected?: boolean;
  /** Enable haptic feedback on press */
  hapticFeedback?: boolean;
  /** Additional container classes */
  className?: string;
}

export const ListItem = forwardRef<RNView, ListItemProps>(function ListItem(
  {
    title,
    subtitle,
    size = "md",
    leading,
    trailing,
    showChevron = false,
    selected = false,
    hapticFeedback = true,
    disabled,
    className,
    onPress,
    ...props
  },
  ref,
) {
  const sizeStyles = sizes[size];
  const { colorScheme } = useColorScheme();

  const handlePress = (
    event: Parameters<NonNullable<PressableProps["onPress"]>>[0],
  ) => {
    if (hapticFeedback && !disabled) {
      hapticTap();
    }
    onPress?.(event);
  };

  // Use different pressed overlay for light vs dark mode
  const pressedBg =
    colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";

  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected }}
      className={cx(
        "flex-row items-center",
        sizeStyles.container,
        selected && "bg-panelHi",
        disabled && "opacity-50",
        className,
      )}
      style={({ pressed }) =>
        pressed && !disabled ? { backgroundColor: pressedBg } : undefined
      }
      {...props}
    >
      {leading && <View className="mr-3">{leading}</View>}

      <View className="flex-1 justify-center">
        <Text
          className={cx(
            sizeStyles.title,
            "font-medium text-fg",
            disabled && "text-muted",
          )}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            className={cx(sizeStyles.subtitle, "text-muted mt-0.5")}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {trailing && <View className="ml-3">{trailing}</View>}

      {showChevron && (
        <ChevronRight
          size={20}
          color={colors.textMuted}
          strokeWidth={2}
          className="ml-2"
        />
      )}
    </Pressable>
  );
});

export interface ListSectionProps {
  /** Section header title */
  title?: string;
  /** Section footer text */
  footer?: string;
  /** List items */
  children: ReactNode;
  /** Additional container classes */
  className?: string;
}

/**
 * ListSection - Groups ListItem components with optional header and footer
 */
export function ListSection({
  title,
  footer,
  children,
  className,
}: ListSectionProps) {
  return (
    <View className={cx("mb-6", className)}>
      {title && (
        <SectionHeading size="xs" variant="muted" className="px-4 mb-2">
          {title}
        </SectionHeading>
      )}
      <View className="bg-panel rounded-2xl border border-line overflow-hidden">
        {children}
      </View>
      {footer && (
        <Text className="text-xs text-subtle px-4 mt-2">{footer}</Text>
      )}
    </View>
  );
}

/**
 * ListDivider - Horizontal divider between list items
 */
export function ListDivider() {
  return <View className="h-px bg-line ml-4" />;
}
