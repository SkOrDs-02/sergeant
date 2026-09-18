/**
 * `WorkoutActivePanel` — top "active workout" card for the mobile
 * Фізрук / Workouts page.
 *
 * Mirrors the web status strip at `apps/web/src/modules/fizruk/pages/
 * Workouts.tsx` but trimmed to the widgets that make sense on mobile:
 *   - elapsed time (`elapsedSec`) in `hh:mm:ss` / `mm:ss`,
 *   - three quick-rest buttons backed by `REST_DEFAULTS` from the
 *     domain package (compound / isolation / cardio),
 *   - a start / finish CTA.
 *
 * Pure presentational — no store reads. The parent wires `onStart` /
 * `onFinish` / `onStartRest` and passes `elapsedSec` from
 * `useActiveFizrukWorkout`.
 */
import { REST_DEFAULTS } from "@sergeant/fizruk-domain/lib/restSettings";
import { memo } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface WorkoutActivePanelProps {
  activeWorkoutId: string | null;
  elapsedSec: number | null;
  onStart(): void;
  onFinish(): void;
  onStartRest(sec: number): void;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const WorkoutActivePanel = memo(function WorkoutActivePanel({
  activeWorkoutId,
  elapsedSec,
  onStart,
  onFinish,
  onStartRest,
  testID = "fizruk-workouts-active",
}: WorkoutActivePanelProps) {
  if (!activeWorkoutId) {
    return (
      <Card variant="fizruk-soft" radius="lg" padding="lg" testID={testID}>
        <View className="gap-3">
          <View>
            <Text className="text-xs font-semibold text-teal-800">
              Немає активного тренування
            </Text>
            <Text className="text-base text-fg mt-1">
              Почни сесію, щоб додавати вправи та запускати таймер відпочинку.
            </Text>
          </View>
          <Button
            variant="fizruk"
            size="md"
            onPress={onStart}
            accessibilityLabel="Почати тренування"
            testID={`${testID}-start`}
          >
            Почати тренування
          </Button>
        </View>
      </Card>
    );
  }

  const elapsedLabel =
    elapsedSec !== null ? formatElapsed(elapsedSec) : "00:00";

  return (
    <Card variant="fizruk-soft" radius="lg" padding="lg" testID={testID}>
      <View className="gap-3">
        <View>
          <Text className="text-xs font-semibold text-teal-800">
            Активне тренування
          </Text>
          <Text
            className="text-3xl font-extrabold text-fg"
            accessibilityLabel={`Пройшло ${elapsedLabel}`}
            testID={`${testID}-elapsed`}
          >
            {elapsedLabel}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-xs font-semibold text-fg">
            Швидкий відпочинок
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onStartRest(REST_DEFAULTS.compound)}
              accessibilityLabel={`Запустити таймер відпочинку ${REST_DEFAULTS.compound} секунд`}
              testID={`${testID}-rest-compound`}
            >
              {`Compound · ${REST_DEFAULTS.compound}s`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onStartRest(REST_DEFAULTS.isolation)}
              accessibilityLabel={`Запустити таймер відпочинку ${REST_DEFAULTS.isolation} секунд`}
              testID={`${testID}-rest-isolation`}
            >
              {`Isolation · ${REST_DEFAULTS.isolation}s`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onStartRest(REST_DEFAULTS.cardio)}
              accessibilityLabel={`Запустити таймер відпочинку ${REST_DEFAULTS.cardio} секунд`}
              testID={`${testID}-rest-cardio`}
            >
              {`Cardio · ${REST_DEFAULTS.cardio}s`}
            </Button>
          </View>
        </View>

        <Button
          variant="destructive"
          size="md"
          onPress={onFinish}
          accessibilityLabel="Завершити тренування"
          testID={`${testID}-finish`}
        >
          Завершити
        </Button>
      </View>
    </Card>
  );
});
