/**
 * Sergeant Design System — Tabs (React Native)
 *
 * Mobile port of the web `Tabs` primitive. Provides a tablist with a
 * controlled `value` + `onChange` API across both style treatments
 * (`underline` and `pill`) and the module variant palette.
 *
 * @see apps/web/src/shared/components/ui/Tabs.tsx — canonical source of truth
 *
 * Differences from web (intentional):
 * - No roving-tabindex or arrow-key navigation (RN relies on touch /
 *   VoiceOver / TalkBack swipe navigation; the underlying tab array is
 *   flat with individual Pressable elements).
 * - Scrollable row uses a plain `<View>` (callers wrap in a
 *   `ScrollView horizontal` if they expect overflow).
 * - Underline style has a smooth animated indicator that slides between
 *   tabs using Reanimated layout animations.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

export type TabsVariant =
  | "accent"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type TabsStyle = "underline" | "pill";

export type TabsSize = "sm" | "md";

export interface TabsItem<Value extends string = string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
  /** Badge count to show on the tab */
  badge?: number;
  /** Badge variant for styling */
  badgeVariant?: "default" | "dot";
}

export interface TabsProps<Value extends string = string> {
  items: ReadonlyArray<TabsItem<Value>>;
  value: Value;
  onChange: (next: Value) => void;
  variant?: TabsVariant;
  style?: TabsStyle;
  size?: TabsSize;
  className?: string;
}

const pillActive: Record<TabsVariant, string> = {
  accent: "bg-brand-50",
  finyk: "bg-finyk-soft",
  fizruk: "bg-fizruk-soft",
  routine: "bg-routine-surface",
  nutrition: "bg-nutrition-soft",
};

const pillActiveText: Record<TabsVariant, string> = {
  accent: "text-brand-strong",
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
};

const underlineActiveText: Record<TabsVariant, string> = pillActiveText;

/** Underline indicator color for each variant (using Tailwind token names) */
const indicatorColor: Record<TabsVariant, string> = {
  accent: "bg-accent",
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
};

const sizes: Record<TabsSize, string> = {
  sm: "h-9 px-3",
  md: "h-11 px-4",
};

const textSizes: Record<TabsSize, string> = {
  sm: "text-xs",
  md: "text-sm",
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

interface TabLayout {
  x: number;
  width: number;
}

export function Tabs<Value extends string = string>({
  items,
  value,
  onChange,
  variant = "accent",
  style: tabStyle = "underline",
  size = "md",
  className,
}: TabsProps<Value>) {
  // For underline style: track each tab's position and width for the animated indicator
  const [tabLayouts, setTabLayouts] = useState<Map<Value, TabLayout>>(
    new Map(),
  );
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const isFirstRender = useRef(true);

  // Update indicator position when value changes
  useEffect(() => {
    const layout = tabLayouts.get(value);
    if (layout) {
      if (isFirstRender.current) {
        // No animation on first render
        indicatorX.value = layout.x;
        indicatorWidth.value = layout.width;
        isFirstRender.current = false;
      } else {
        indicatorX.value = withTiming(layout.x, { duration: 200 });
        indicatorWidth.value = withTiming(layout.width, { duration: 200 });
      }
    }
  }, [value, tabLayouts, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const handleTabLayout = (itemValue: Value, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setTabLayouts((prev) => {
      const next = new Map(prev);
      next.set(itemValue, { x, width });
      return next;
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      className={cx(
        "flex-row items-center relative",
        tabStyle === "pill" ? "bg-surface-muted rounded-xl p-1 gap-1" : "gap-1",
        tabStyle === "underline" ? "border-b border-line" : undefined,
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        const activeCls =
          tabStyle === "pill"
            ? cx(pillActive[variant], pillActiveText[variant])
            : underlineActiveText[variant];
        const inactiveCls = "text-fg-muted";

        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{
              selected: isActive,
              disabled: Boolean(item.disabled),
            }}
            disabled={item.disabled}
            onPress={() => onChange(item.value)}
            onLayout={(e) => handleTabLayout(item.value, e)}
            className={cx(
              "items-center justify-center rounded-lg",
              sizes[size],
              tabStyle === "pill" && isActive ? activeCls : undefined,
              tabStyle === "pill" && !isActive ? inactiveCls : undefined,
              item.disabled ? "opacity-50" : undefined,
            )}
          >
            <View className="flex-row items-center gap-1.5">
              {typeof item.label === "string" ||
              typeof item.label === "number" ? (
                <Text
                  className={cx(
                    "font-semibold",
                    textSizes[size],
                    isActive
                      ? tabStyle === "pill"
                        ? pillActiveText[variant]
                        : underlineActiveText[variant]
                      : "text-fg-muted",
                  )}
                >
                  {item.label}
                </Text>
              ) : (
                item.label
              )}
              {/* Badge */}
              {item.badge !== undefined && item.badge > 0 ? (
                item.badgeVariant === "dot" ? (
                  <View className="w-2 h-2 rounded-full bg-danger" />
                ) : (
                  <View
                    className={cx(
                      "min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center",
                      isActive ? "bg-brand" : "bg-cream-300 dark:bg-cream-600",
                    )}
                  >
                    <Text
                      className={cx(
                        "text-[10px] font-bold tabular-nums",
                        isActive ? "text-white" : "text-fg-muted",
                      )}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </Text>
                  </View>
                )
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {/* Animated underline indicator */}
      {tabStyle === "underline" && (
        <Animated.View
          style={indicatorStyle}
          className={cx(
            "absolute bottom-0 left-0 h-0.5 rounded-full",
            indicatorColor[variant],
          )}
        />
      )}
    </View>
  );
}
