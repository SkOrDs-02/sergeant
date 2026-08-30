/**
 * `ExerciseHeader` — title + primary-muscle chips for the Exercise
 * detail screen. Pure presentational; the caller resolves uk-UA
 * muscle labels via `@sergeant/fizruk-domain/data`.
 */
import { memo } from "react";
import { Text, View } from "react-native";

export interface ExerciseHeaderProps {
  title: string;
  muscleLabels: readonly string[];
  /** Short textual description of the exercise (optional). */
  description?: string | null;
  /** Optional root testID. */
  testID?: string;
}

const ExerciseHeaderImpl = function ExerciseHeader({
  title,
  muscleLabels,
  description,
  testID = "fizruk-exercise-header",
}: ExerciseHeaderProps) {
  return (
    <View testID={testID} className="gap-2">
      <Text
        className="text-xl font-bold text-fg leading-tight"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {muscleLabels.length > 0 ? (
        <View
          className="flex-row flex-wrap gap-1.5"
          testID={`${testID}-muscles`}
          accessibilityLabel={`Цільові мʼязи: ${muscleLabels.join(", ")}`}
        >
          {muscleLabels.map((m) => (
            <View
              key={m}
              className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200"
            >
              <Text className="text-xs font-semibold text-teal-700">{m}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-xs text-fg-muted">{"Профіль вправи"}</Text>
      )}
      {description ? (
        <Text className="text-xs text-fg-muted leading-snug">
          {description}
        </Text>
      ) : null}
    </View>
  );
};

export const ExerciseHeader = memo(ExerciseHeaderImpl);
