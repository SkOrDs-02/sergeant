/**
 * `WorkoutJournalSection` — mobile journal list for the Фізрук /
 * Workouts page.
 *
 * Pure presentational: accepts a sorted-by-date list of workouts and
 * groups them into sections via
 * `@sergeant/fizruk-domain/domain/workouts.buildWorkoutJournalSections`.
 * The parent owns CRUD and the active-workout wiring.
 */
import {
  buildWorkoutJournalSections,
  computeWorkoutSummary,
  formatWorkoutDateLabel,
} from "@sergeant/fizruk-domain/domain";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

/**
 * Minimum shape the journal reads on a workout. Both the mobile
 * `FizrukWorkout` shape (with optional fields on items) and the
 * domain `Workout` type are assignable to this contract.
 */
export interface WorkoutLike {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items?: ReadonlyArray<unknown>;
}

export interface WorkoutJournalSectionProps<W extends WorkoutLike> {
  workouts: readonly W[];
  activeWorkoutId?: string | null;
  onPressWorkout?(workout: W): void;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

function JournalEmpty({ testID }: { testID: string }) {
  return (
    <Card variant="flat" radius="lg" padding="lg" testID={testID}>
      <Text className="text-sm font-semibold text-fg">
        Журнал поки порожній
      </Text>
      <Text className="text-xs text-fg-muted mt-1">
        Щойно ти додаси перше тренування і додаси в нього вправи, воно
        з&apos;явиться тут згруповане по днях.
      </Text>
    </Card>
  );
}

function formatDurationLabel(sec: number | null): string | null {
  if (sec === null) return null;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h} год ${String(mm).padStart(2, "0")} хв`;
}

function WorkoutRow<W extends WorkoutLike>({
  workout,
  isActive,
  onPress,
  testID,
}: {
  workout: W;
  isActive: boolean;
  onPress?: () => void;
  testID: string;
}) {
  const summary = useMemo(() => computeWorkoutSummary(workout), [workout]);
  const duration = formatDurationLabel(summary.durationSec);
  const parts: string[] = [];
  if (summary.itemCount > 0) parts.push(`${summary.itemCount} вправ`);
  if (summary.setCount > 0) parts.push(`${summary.setCount} сетів`);
  if (summary.tonnageKg > 0) parts.push(`${Math.round(summary.tonnageKg)} кг`);
  if (duration) parts.push(duration);
  const subtitle = parts.length ? parts.join(" · ") : "порожнє тренування";

  const startedAt = workout.startedAt
    ? new Date(workout.startedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Тренування ${startedAt}, ${subtitle}`}
      onPress={onPress}
      testID={testID}
      className="px-3 py-3 rounded-xl border border-cream-300 bg-cream-50 flex-row items-center justify-between"
    >
      <View className="flex-1 pr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-fg">{startedAt}</Text>
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
      <Text className="text-fg-subtle text-lg">›</Text>
    </Pressable>
  );
}

export const WorkoutJournalSection = memo(function WorkoutJournalSection<
  W extends WorkoutLike,
>({
  workouts,
  activeWorkoutId = null,
  onPressWorkout,
  testID = "fizruk-workouts-journal",
}: WorkoutJournalSectionProps<W>) {
  const sections = useMemo(
    () => buildWorkoutJournalSections(workouts),
    [workouts],
  );

  if (sections.length === 0) {
    return <JournalEmpty testID={`${testID}-empty`} />;
  }

  return (
    <View className="gap-3" testID={testID}>
      {sections.map((section) => (
        <View key={section.dateKey || "unknown"} className="gap-2">
          <Text
            className="text-xs font-semibold uppercase text-fg-muted px-1"
            testID={`${testID}-heading-${section.dateKey || "unknown"}`}
          >
            {formatWorkoutDateLabel(section.dateKey)}
          </Text>
          <View className="gap-2">
            {section.workouts.map((workout) => (
              <WorkoutRow
                key={workout.id}
                workout={workout}
                isActive={workout.id === activeWorkoutId}
                onPress={
                  onPressWorkout ? () => onPressWorkout(workout) : undefined
                }
                testID={`${testID}-row-${workout.id}`}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}) as <W extends WorkoutLike>(
  props: WorkoutJournalSectionProps<W>,
) => JSX.Element;
