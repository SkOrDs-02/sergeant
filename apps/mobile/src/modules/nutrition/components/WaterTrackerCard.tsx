/**
 * Water tracker card — mobile port
 * web: apps/web/src/modules/nutrition/components/WaterTrackerCard.tsx
 *
 * Рендерить секцію "Вода": поточне ml, progress-bar, 4 quick-add
 * кнопки (200 / 300 / 500 / 750 ml), reset з confirm-tap.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { hapticTap } from "@sergeant/shared";

import { Card } from "@/components/ui/Card";

import { useWaterTracker } from "../hooks/useWaterTracker";

const QUICK_ML = [200, 300, 500, 750] as const;

// Дзеркалить web: один знак після коми округлював цілі, задані з точністю
// до мілілітра (2350 мл → «2.4 л»).
function fmt(ml: number): string {
  if (ml < 1000) return `${ml} мл`;
  const litres = (ml / 1000).toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  });
  return `${litres} л`;
}

export interface WaterTrackerCardProps {
  goalMl?: number;
  testID?: string;
}

export function WaterTrackerCard({
  goalMl = 2000,
  testID,
}: WaterTrackerCardProps) {
  const { todayMl, add, reset } = useWaterTracker();
  const [resetPending, setResetPending] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pct = goalMl > 0 ? Math.min(100, (todayMl / goalMl) * 100) : 0;
  const done = todayMl >= goalMl && goalMl > 0;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const handleResetPress = () => {
    if (resetPending) {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      reset();
      setResetPending(false);
      return;
    }
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
    }
    setResetPending(true);
    resetTimerRef.current = setTimeout(() => {
      setResetPending(false);
      resetTimerRef.current = null;
    }, 2500);
  };

  return (
    <Card testID={testID}>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg leading-none">💧</Text>
          <View>
            <Text className="text-sm font-semibold text-fg leading-none">
              Вода
            </Text>
            <Text className="text-xs text-fg-muted mt-0.5">
              {fmt(todayMl)}
              {goalMl > 0 ? ` / ${fmt(goalMl)}` : ""}
              {done ? " ✓" : ""}
            </Text>
          </View>
        </View>
        {todayMl > 0 ? (
          <Pressable
            onPress={handleResetPress}
            accessibilityRole="button"
            accessibilityLabel={
              resetPending
                ? "Підтвердити скидання води за сьогодні"
                : "Скинути воду за сьогодні"
            }
            testID={testID ? `${testID}-reset` : undefined}
            className="px-2 py-1 rounded-lg"
          >
            <Text className="text-xs text-fg-muted">
              {resetPending ? "Скинути?" : "↺"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {goalMl > 0 ? (
        <View className="h-2 bg-panelHi rounded-full overflow-hidden mb-3">
          <View
            style={{ width: `${pct}%` }}
            className={`h-full rounded-full ${
              done ? "bg-lime-500" : "bg-sky-500"
            }`}
          />
        </View>
      ) : null}

      <View className="flex-row gap-1.5">
        {QUICK_ML.map((ml) => (
          <Pressable
            key={ml}
            accessibilityRole="button"
            accessibilityLabel={`Додати ${ml} мл води`}
            testID={testID ? `${testID}-add-${ml}` : undefined}
            onPress={() => {
              hapticTap();
              add(ml);
            }}
            className="flex-1 h-9 rounded-xl items-center justify-center bg-sky-500/10 border border-sky-500/20"
          >
            <Text className="text-xs font-semibold text-sky-700">
              +{ml < 1000 ? ml : `${ml / 1000}л`}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
