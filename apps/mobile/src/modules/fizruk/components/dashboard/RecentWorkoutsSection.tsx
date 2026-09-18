/**
 * `RecentWorkoutsSection` — bottom-of-dashboard list of the last few
 * completed workouts. Uses the pure
 * `listRecentCompletedWorkouts` selector from
 * `@sergeant/fizruk-domain/domain/dashboard` so the ordering,
 * duration, and tonnage numbers stay consistent with web.
 */

import type { DashboardRecentWorkout } from "@sergeant/fizruk-domain/domain";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

export interface RecentWorkoutsSectionProps {
  recent: readonly DashboardRecentWorkout[];
  onSeeAll: () => void;
  testID?: string;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} год` : `${h} год ${m} хв`;
}

function formatTonnage(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  if (kg >= 1000) {
    const thousands = kg / 1000;
    const rounded =
      thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${rounded} т`;
  }
  return `${Math.round(kg)} кг`;
}

export function RecentWorkoutsSection({
  recent,
  onSeeAll,
  testID = "fizruk-dashboard-recent",
}: RecentWorkoutsSectionProps) {
  return (
    <View className="gap-2" testID={testID}>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm font-semibold text-fg">
          Останні тренування
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Усі тренування"
          onPress={onSeeAll}
          testID={`${testID}-all`}
        >
          {({ pressed }) => (
            <Text
              className={`text-xs font-semibold text-teal-700 ${pressed ? "opacity-60" : ""}`}
            >
              Усі
            </Text>
          )}
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <Card
          variant="default"
          radius="lg"
          padding="lg"
          className="items-center"
          testID={`${testID}-empty`}
        >
          <Text className="text-sm font-semibold text-fg">
            Ще жодного завершеного тренування
          </Text>
          <Text className="text-xs text-fg-muted text-center mt-1">
            Почни сесію, результати зʼявляться тут автоматично.
          </Text>
        </Card>
      ) : (
        <View className="gap-2">
          {recent.map((row) => (
            <Card
              key={`${row.startedAt}-${row.endedAt ?? "na"}`}
              variant="default"
              radius="lg"
              padding="md"
              testID={`${testID}-row-${row.startedAt}`}
            >
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-sm font-semibold text-fg"
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  <Text className="text-[11px] text-fg-muted mt-0.5">
                    {formatDateShort(row.endedAt)} ·{" "}
                    {formatDuration(row.durationSec)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-teal-700">
                    {formatTonnage(row.tonnageKg)}
                  </Text>
                  <Text className="text-[10px] text-fg-muted">тоннаж</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

export default RecentWorkoutsSection;
