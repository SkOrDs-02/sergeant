/**
 * Tiny dependency-free sparkline rendered with `<View>` bars.
 *
 * Used by `LimitBudgetRow` and `GoalBudgetRow` to satisfy the
 * "per-row trend visualization" requirement without pulling in the
 * heavier `victory-native` chart for every row.
 */
import { memo } from "react";
import { View } from "react-native";

export interface SparklineProps {
  values: readonly number[];
  /** Visual height in px. */
  height?: number;
  /** Tone used for the bars. */
  tone?: "neutral" | "positive" | "warn" | "danger";
  testID?: string;
}

const TONE_CLASSES: Record<NonNullable<SparklineProps["tone"]>, string> = {
  neutral: "bg-fg-subtle",
  positive: "bg-teal-700",
  warn: "bg-amber-500",
  danger: "bg-danger",
};

function SparklineImpl({
  values,
  height = 18,
  tone = "neutral",
  testID,
}: SparklineProps) {
  const safe = Array.isArray(values) ? values : [];
  if (safe.length === 0) {
    return (
      <View
        testID={testID}
        style={{ height }}
        className="w-full rounded bg-cream-100"
      />
    );
  }
  const max = Math.max(...safe, 1);
  const cls = TONE_CLASSES[tone];
  return (
    <View
      testID={testID}
      style={{ height }}
      className="w-full flex-row items-end gap-[1px]"
    >
      {safe.map((v, i) => {
        const ratio = max > 0 ? Math.max(0.05, v / max) : 0.05;
        return (
          <View
            key={i}
            style={{ height: `${ratio * 100}%` }}
            className={`flex-1 rounded-sm ${cls}`}
          />
        );
      })}
    </View>
  );
}

export const Sparkline = memo(SparklineImpl);
