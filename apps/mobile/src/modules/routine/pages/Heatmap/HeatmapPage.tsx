/**
 * Sergeant Routine — HeatmapPage (React Native).
 *
 * Top-level screen hosting the `HabitHeatmap` matrix inside the
 * existing Routine module shell. Rendered for the `stats` tab of
 * `RoutineApp` (Phase 5 / PR Heatmap) — same in-component tab pattern
 * that the Settings tab uses for `HabitsPage`.
 *
 * Responsibilities:
 *  - Read `habits` + `completions` from `useRoutineStore` (MMKV-backed).
 *  - Empty-state when the user has no active habits at all — matches
 *    the copy style used by Calendar's empty banner.
 *  - Delegate rendering to the `HabitHeatmap` component (pure view),
 *    which in turn delegates aggregation to `@sergeant/routine-domain`.
 */

import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { countActiveDays, buildHeatmapGrid } from "@sergeant/routine-domain";

import { useRoutineStore } from "../../lib/routineStore";
import { HabitHeatmap } from "../../components/HabitHeatmap";

export interface HeatmapPageProps {
  /** Optional test-id root. Defaults to `"heatmap-page"`. */
  testID?: string;
  /** Optional "today" override — injected by tests, defaults to `new Date()`. */
  today?: Date;
}

export function HeatmapPage({
  testID = "heatmap-page",
  today,
}: HeatmapPageProps) {
  const { routine } = useRoutineStore();

  const activeHabits = useMemo(
    () => routine.habits.filter((h) => !h.archived),
    [routine.habits],
  );

  const grid = useMemo(
    () =>
      buildHeatmapGrid(activeHabits, routine.completions, today ?? new Date()),
    [activeHabits, routine.completions, today],
  );

  const activeDayCount = useMemo(() => countActiveDays(grid), [grid]);

  return (
    <SafeAreaView
      className="flex-1 bg-bg dark:bg-bg"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">📊</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">Хітмеп</Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-2">
        Активність виконання звичок за останній рік. Тап по клітинці — деталі
        дня.
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
      >
        {activeHabits.length === 0 ? (
          <View
            testID={`${testID}-empty`}
            className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-6 items-center"
          >
            <Text className="text-sm font-semibold text-fg">
              Поки немає звичок
            </Text>
            <Text className="text-xs text-fg-muted mt-1 text-center">
              Додай звичку на вкладці «Налаштування», щоб побачити свою
              активність тут.
            </Text>
          </View>
        ) : activeDayCount === 0 ? (
          <>
            <View
              testID={`${testID}-empty-completions`}
              className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-6 items-center"
            >
              <Text className="text-sm font-semibold text-fg">
                Ще немає виконаних днів
              </Text>
              <Text className="text-xs text-fg-muted mt-1 text-center">
                Відмічай виконання звичок на вкладці «Календар» — тут зʼявиться
                карта активності.
              </Text>
            </View>
            <HabitHeatmap
              habits={activeHabits}
              completions={routine.completions}
              today={today}
            />
          </>
        ) : (
          <HabitHeatmap
            habits={activeHabits}
            completions={routine.completions}
            today={today}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default HeatmapPage;
