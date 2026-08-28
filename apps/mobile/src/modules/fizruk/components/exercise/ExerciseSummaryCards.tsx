/**
 * `ExerciseSummaryCards` — two side-by-side cards shown under the
 * header on the Exercise detail screen:
 *   1. Personal record (best 1RM estimate + matching set).
 *   2. Suggested next top set (progressive-overload helper from
 *      `@sergeant/fizruk-domain`).
 */
import type {
  ExerciseBestSet,
  ExerciseBestSummary,
  SuggestedNextSet,
} from "@sergeant/fizruk-domain/domain";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

export interface ExerciseSummaryCardsProps {
  best: ExerciseBestSummary;
  suggestedNext: SuggestedNextSet | null;
  /** Optional root testID. */
  testID?: string;
}

function formatKg(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(decimals));
  return `${rounded} кг`;
}

function formatDateShort(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function describeBestSet(set: ExerciseBestSet | null): string {
  if (!set) return "Немає силових сетів";
  return `${set.weightKg ?? 0} × ${set.reps ?? 0} повт.`;
}

const ExerciseSummaryCardsImpl = function ExerciseSummaryCards({
  best,
  suggestedNext,
  testID = "fizruk-exercise-summary",
}: ExerciseSummaryCardsProps) {
  const prDate = formatDateShort(best.bestSet?.at);

  return (
    <View className="flex-row gap-3" testID={testID}>
      <View className="flex-1">
        <Card
          variant="default"
          radius="lg"
          padding="md"
          testID={`${testID}-pr`}
        >
          <Text className="text-[10px] uppercase font-bold text-fg-muted">
            Особистий рекорд
          </Text>
          <Text className="text-2xl font-extrabold text-fg mt-1 tabular-nums">
            {best.best1rm > 0 ? formatKg(best.best1rm, 0) : "—"}
          </Text>
          <Text className="text-xs text-fg-muted mt-1">
            {describeBestSet(best.bestSet)}
          </Text>
          {prDate ? (
            <Text className="text-[10px] text-fg-subtle mt-1">{prDate}</Text>
          ) : null}
        </Card>
      </View>

      <View className="flex-1">
        <Card
          variant="default"
          radius="lg"
          padding="md"
          testID={`${testID}-next`}
        >
          <Text className="text-[10px] uppercase font-bold text-fg-muted">
            Наступного разу
          </Text>
          <Text className="text-2xl font-extrabold text-fg mt-1 tabular-nums">
            {suggestedNext ? formatKg(suggestedNext.weightKg, 1) : "—"}
          </Text>
          <Text className="text-xs text-fg-muted mt-1">
            {suggestedNext
              ? `× ${suggestedNext.reps} повт.`
              : "Заповни сети, щоб зʼявилась рекомендація"}
          </Text>
          {suggestedNext?.altWeightKg != null &&
          suggestedNext.altReps != null ? (
            <Text className="text-[10px] text-teal-700 mt-1">
              {`або ${formatKg(suggestedNext.altWeightKg, 1)} × ${suggestedNext.altReps} повт.`}
            </Text>
          ) : null}
          {suggestedNext && best.lastTop ? (
            <Text className="text-[10px] text-fg-subtle mt-1">
              {`зараз: ${best.lastTop.weightKg ?? 0} × ${best.lastTop.reps ?? 0}`}
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
};

export const ExerciseSummaryCards = memo(ExerciseSummaryCardsImpl);
