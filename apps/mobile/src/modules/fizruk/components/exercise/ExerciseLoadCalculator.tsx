/**
 * `ExerciseLoadCalculator` — three-zone percent-of-1RM table
 * (Сила / Гіпертрофія / Витривалість). Pure presentational: the
 * zones are produced by
 * `@sergeant/fizruk-domain/domain/workouts.buildLoadCalculatorZones`.
 */
import type { LoadCalculatorZone } from "@sergeant/fizruk-domain/domain";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

export interface ExerciseLoadCalculatorProps {
  zones: readonly LoadCalculatorZone[];
  /** Optional root testID. */
  testID?: string;
}

const TONE_CLASSES: Record<LoadCalculatorZone["tone"], string> = {
  strength: "border-amber-200 bg-amber-50",
  hypertrophy: "border-teal-200 bg-teal-50",
  endurance: "border-sky-200 bg-sky-50",
};

const TONE_TEXT: Record<LoadCalculatorZone["tone"], string> = {
  strength: "text-amber-800",
  hypertrophy: "text-teal-800",
  endurance: "text-sky-800",
};

const ExerciseLoadCalculatorImpl = function ExerciseLoadCalculator({
  zones,
  testID = "fizruk-exercise-load",
}: ExerciseLoadCalculatorProps) {
  if (zones.length === 0) return null;
  return (
    <Card variant="default" radius="lg" padding="md" testID={testID}>
      <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
        Калькулятор навантаження
      </Text>
      <View className="gap-2">
        {zones.map((zone) => (
          <View
            key={zone.tone}
            testID={`${testID}-${zone.tone}`}
            className={`rounded-xl border px-3 py-2 ${TONE_CLASSES[zone.tone]}`}
          >
            <View className="flex-row items-baseline justify-between">
              <Text className={`text-sm font-bold ${TONE_TEXT[zone.tone]}`}>
                {zone.goal}
              </Text>
              <Text className={`text-[10px] ${TONE_TEXT[zone.tone]}`}>
                {zone.desc}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-x-3 gap-y-1 mt-1">
              {zone.entries.map((entry) => (
                <Text
                  key={`${zone.tone}-${entry.percent}`}
                  className={`text-xs tabular-nums ${TONE_TEXT[zone.tone]}`}
                  testID={`${testID}-${zone.tone}-${entry.percent}`}
                >
                  {`${entry.percent}% → ${entry.kg} кг`}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
};

export const ExerciseLoadCalculator = memo(ExerciseLoadCalculatorImpl);
