import { View } from "react-native";

import { cx } from "./style";

export function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={cx(
            "rounded-full",
            i === current ? "h-1.5 w-6 bg-brand-500" : "h-1.5 w-1.5 bg-line",
          )}
        />
      ))}
    </View>
  );
}
