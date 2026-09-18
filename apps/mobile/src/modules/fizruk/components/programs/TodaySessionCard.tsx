/**
 * `TodaySessionCard` — the "Сьогоднішня сесія" hero card on the
 * Fizruk Programs screen.
 *
 * Branches across three states:
 *  1. No active program → muted empty-state nudging activation.
 *  2. Active program, today is a rest day → "Сьогодні — вихідний".
 *  3. Active program + scheduled session today → session title +
 *     "Почати" button that wires into `useActiveFizrukWorkout`.
 *
 * The component is purely presentational — the hosting page is
 * responsible for starting the workout when `onStart` fires.
 */

import type {
  TodayProgramSession,
  TrainingProgramDef,
} from "@sergeant/fizruk-domain/domain";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface TodaySessionCardProps {
  activeProgram: TrainingProgramDef | null;
  todaySession: TodayProgramSession | null;
  onStart: (session: TodayProgramSession) => void;
  testID?: string;
}

export function TodaySessionCard({
  activeProgram,
  todaySession,
  onStart,
  testID = "today-session-card",
}: TodaySessionCardProps) {
  if (!activeProgram) {
    return (
      <Card variant="default" radius="lg" padding="lg" testID={testID}>
        <View className="gap-1.5">
          <Text className="text-xs font-semibold text-fg-muted">
            Сьогоднішня сесія
          </Text>
          <Text
            className="text-base font-semibold text-fg"
            testID={`${testID}-empty`}
          >
            Активуй програму, щоб побачити план на сьогодні
          </Text>
          <Text className="text-sm text-fg-muted leading-snug">
            Обери програму нижче, її сесії автоматично зʼявлятимуться тут за
            днем тижня.
          </Text>
        </View>
      </Card>
    );
  }

  if (!todaySession) {
    return (
      <Card variant="fizruk-soft" radius="lg" padding="lg" testID={testID}>
        <View className="gap-1.5">
          <Text className="text-xs font-semibold text-teal-700">
            {activeProgram.name}
          </Text>
          <Text
            className="text-base font-semibold text-fg"
            testID={`${testID}-rest`}
          >
            Сьогодні: вихідний
          </Text>
          <Text className="text-sm text-fg-muted leading-snug">
            Наступна сесія – згідно графіка програми. Відпочинок – частина
            прогресу.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card variant="fizruk" radius="xl" padding="lg" testID={testID}>
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-xs font-semibold text-teal-100">
            Сьогоднішня сесія
          </Text>
          <Text
            className="text-lg font-bold text-white"
            testID={`${testID}-title`}
          >
            {todaySession.session.name}
          </Text>
          <Text className="text-sm text-teal-100">
            {activeProgram.name} · {todaySession.session.exerciseIds.length}{" "}
            вправ
          </Text>
        </View>
        <Button
          variant="secondary"
          size="lg"
          onPress={() => onStart(todaySession)}
          testID={`${testID}-start`}
        >
          Почати
        </Button>
      </View>
    </Card>
  );
}
