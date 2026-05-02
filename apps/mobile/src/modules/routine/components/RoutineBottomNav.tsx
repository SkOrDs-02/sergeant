/**
 * Sergeant Routine — RoutineBottomNav (React Native)
 *
 * Mobile port of `apps/web/src/modules/routine/components/RoutineBottomNav.tsx`.
 *
 * Three-tab segmented control rendered at the bottom of the Routine
 * module shell. Mirrors the web component's 3 tabs (calendar / stats /
 * settings) and the same `RoutineMainTab` id space so the type is
 * compatible across platforms.
 *
 * Differences from web (intentional — see Phase 5 PR 1 body):
 *  - No dependency on a shared `ModuleBottomNav` primitive (web pulls it
 *    from `@shared/components/ui/ModuleBottomNav`). Mobile has no
 *    equivalent yet; we render the 3 buttons inline with NativeWind
 *    classes. Extract-to-shared is a follow-up once other modules
 *    (Finyk / Fizruk / Nutrition) port their own bottom navs.
 *  - Icons are emoji glyphs instead of inline SVG. A native SVG system
 *    (react-native-svg) lands with the Heatmap PR (Phase 5 PR 5); until
 *    then, emoji keeps the shell dependency-free.
 *  - 44×44 min tap targets per HIG / Material; respects
 *    `accessibilityRole="tab"` + `accessibilityState={{ selected }}`
 *    for VoiceOver / TalkBack parity with web's `role="tab"`.
 */

import { Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { Calendar, BarChart2, SlidersHorizontal } from "lucide-react-native";

import { hapticTap } from "@sergeant/shared";

export type RoutineMainTab = "calendar" | "stats" | "settings";

type IconComponent = typeof Calendar;

interface NavItem {
  id: RoutineMainTab;
  label: string;
  Icon: IconComponent;
}

const NAV: readonly NavItem[] = [
  { id: "calendar", label: "Календар", Icon: Calendar },
  { id: "stats", label: "Статистика", Icon: BarChart2 },
  { id: "settings", label: "Налаштування", Icon: SlidersHorizontal },
];

export interface RoutineBottomNavProps {
  mainTab: RoutineMainTab;
  onSelectTab: (tab: RoutineMainTab) => void;
  /** Optional root `testID` — children derive stable sub-ids. */
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

  const iconColor = selected ? "#c23a3a" : "#a8a29e";

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
            ? "text-coral-700 font-semibold"
            : "text-fg-muted font-normal"
        }`}
      >
        {item.label}
      </Text>
      {/* Active indicator dot */}
      <Animated.View
        style={indicatorStyle}
        className="absolute bottom-1.5 w-1 h-1 rounded-full bg-coral-600"
      />
    </Pressable>
  );
}

export function RoutineBottomNav({
  mainTab,
  onSelectTab,
  testID,
}: RoutineBottomNavProps) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Розділи Рутини"
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
