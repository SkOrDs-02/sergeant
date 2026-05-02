/**
 * Sergeant Nutrition — NutritionBottomNav (React Native)
 *
 * Four-tab segmented control for the Nutrition module (mobile). Uses Lucide
 * icons with animated active indicator, matching RoutineBottomNav patterns.
 *
 * Tabs: Сьогодні / Журнал / Вода / Покупки
 */
import { Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import {
  UtensilsCrossed,
  NotebookPen,
  Droplets,
  ShoppingCart,
} from "lucide-react-native";

import { hapticTap } from "@sergeant/shared";

export type NutritionMainTab = "dashboard" | "log" | "water" | "shopping";

type IconComponent = typeof UtensilsCrossed;

interface NavItem {
  id: NutritionMainTab;
  label: string;
  Icon: IconComponent;
}

const NAV: readonly NavItem[] = [
  { id: "dashboard", label: "Сьогодні", Icon: UtensilsCrossed },
  { id: "log", label: "Журнал", Icon: NotebookPen },
  { id: "water", label: "Вода", Icon: Droplets },
  { id: "shopping", label: "Покупки", Icon: ShoppingCart },
];

export interface NutritionBottomNavProps {
  mainTab: NutritionMainTab;
  onSelectTab: (tab: NutritionMainTab) => void;
  testID?: string;
}

/** Single animated tab button */
function NavTab({
  item,
  selected,
  onPress,
  testID,
}: {
  item: NavItem;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const progress = useSharedValue(selected ? 1 : 0);

  // Animate indicator opacity when selection changes
  if (selected) {
    progress.value = withTiming(1, { duration: 180 });
  } else {
    progress.value = withTiming(0, { duration: 180 });
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.5, 1]) }],
  }));

  // Lime-based colors for Nutrition module
  const iconColor = selected ? "#65a30d" : "#a8a29e";

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={item.label}
      testID={testID}
      onPress={onPress}
      className="flex-1 items-center justify-center py-2 min-h-[56px] gap-1"
    >
      <item.Icon
        size={22}
        color={iconColor}
        strokeWidth={selected ? 2.2 : 1.8}
      />
      <Text
        className={`text-xs ${
          selected
            ? "text-lime-700 font-semibold dark:text-lime-400"
            : "text-fg-muted font-normal"
        }`}
      >
        {item.label}
      </Text>
      {/* Active indicator dot */}
      <Animated.View
        style={indicatorStyle}
        className="absolute bottom-1.5 w-1 h-1 rounded-full bg-lime-600"
      />
    </Pressable>
  );
}

export function NutritionBottomNav({
  mainTab,
  onSelectTab,
  testID,
}: NutritionBottomNavProps) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Розділи Харчування"
      testID={testID}
      className="flex-row items-stretch border-t border-line bg-panel dark:bg-cream-900"
    >
      {NAV.map((item) => {
        const selected = item.id === mainTab;
        return (
          <NavTab
            key={item.id}
            item={item}
            selected={selected}
            onPress={() => {
              if (selected) return;
              hapticTap();
              onSelectTab(item.id);
            }}
            testID={testID ? `${testID}-${item.id}` : undefined}
          />
        );
      })}
    </View>
  );
}
