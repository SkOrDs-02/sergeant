/**
 * ProgressKPIs — top-of-page KPI strip for the Fizruk Progress screen.
 *
 * Mobile port of the `<h1>` header block plus the PR / Заміри tiles
 * in `apps/web/src/modules/fizruk/pages/Progress.tsx`. All numbers
 * come from `@sergeant/fizruk-domain`'s pure `computeProgressKpis`
 * selector so web and mobile stay in sync.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import {
  formatLatestWorkoutLabel,
  NO_LATEST_WORKOUT_LABEL,
  type ProgressKpis,
} from "@sergeant/fizruk-domain/domain";

import { Card } from "@/components/ui/Card";

export interface ProgressKPIsProps {
  kpis: ProgressKpis;
}

const ProgressKPIsImpl = function ProgressKPIs({ kpis }: ProgressKPIsProps) {
  const latestLabel = formatLatestWorkoutLabel(kpis.latestWorkoutIso);
  const subtitle =
    latestLabel !== NO_LATEST_WORKOUT_LABEL
      ? `Останнє: ${latestLabel} · ${kpis.prsCount} PR`
      : "Аналітика тренувань";

  return (
    <Card radius="lg" padding="lg" testID="fizruk-progress-kpis">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-xl font-bold text-fg">{"Прогрес"}</Text>
          <Text className="text-xs text-fg-muted mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View className="flex-row items-center gap-4">
          <View className="items-center" testID="fizruk-progress-prs-stat">
            <Text className="text-xs text-fg-muted">{"PR"}</Text>
            <Text className="text-base font-extrabold text-fg tabular-nums">
              {kpis.prsCount}
            </Text>
          </View>
          <View className="items-center" testID="fizruk-progress-entries-stat">
            <Text className="text-xs text-fg-muted">{"Заміри"}</Text>
            <Text className="text-base font-extrabold text-fg tabular-nums">
              {kpis.entriesCount}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
};

export const ProgressKPIs = memo(ProgressKPIsImpl);
