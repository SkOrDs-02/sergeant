/**
 * `ExerciseNewPRBanner` — celebratory banner rendered when the latest
 * workout on this exercise beats the prior best 1RM.
 */
import { memo } from "react";
import { Text, View } from "react-native";

export interface ExerciseNewPRBannerProps {
  /** Optional root testID. */
  testID?: string;
}

const ExerciseNewPRBannerImpl = function ExerciseNewPRBanner({
  testID = "fizruk-exercise-new-pr",
}: ExerciseNewPRBannerProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel="Новий особистий рекорд"
      className="flex-row items-center gap-2.5 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3"
    >
      <Text className="text-xl leading-none">🏆</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-yellow-800">
          Новий особистий рекорд!
        </Text>
        <Text className="text-xs text-yellow-700/80 mt-0.5">
          Найкращий результат за всю історію
        </Text>
      </View>
    </View>
  );
};

export const ExerciseNewPRBanner = memo(ExerciseNewPRBannerImpl);
