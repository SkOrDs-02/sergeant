import { computeWorkoutSummary } from "@sergeant/fizruk-domain/domain";
import { useMemo } from "react";
import { Text, View } from "react-native";

import type { FizrukWorkout } from "../../hooks/useFizrukWorkouts";

export interface RecentWorkoutRowProps {
  workout: FizrukWorkout;
  isActive: boolean;
  testID?: string;
}

export function RecentWorkoutRow({
  workout,
  isActive,
  testID,
}: RecentWorkoutRowProps) {
  const summary = useMemo(
    () => computeWorkoutSummary(workout as never),
    [workout],
  );
  const started = new Date(workout.startedAt);
  const dateLabel = started.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
  const parts: string[] = [];
  if (summary.itemCount > 0) parts.push(`${summary.itemCount} вправ`);
  if (summary.setCount > 0) parts.push(`${summary.setCount} сетів`);
  const durMin = summary.durationSec
    ? Math.max(1, Math.round(summary.durationSec / 60))
    : null;
  if (durMin !== null) parts.push(`${durMin} хв`);
  const subtitle = parts.length ? parts.join(" · ") : "порожнє тренування";

  return (
    <View
      className="px-3 py-3 rounded-xl border border-cream-300 bg-cream-50 flex-row items-center justify-between"
      testID={testID}
    >
      <View className="flex-1 pr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-fg">{dateLabel}</Text>
          {isActive ? (
            <Text className="text-[10px] uppercase font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
              Активне
            </Text>
          ) : !summary.isFinished ? (
            <Text className="text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              Чернетка
            </Text>
          ) : null}
        </View>
        <Text className="text-xs text-fg-muted mt-0.5" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
