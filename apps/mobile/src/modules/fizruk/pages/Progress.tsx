/**
 * Fizruk / Progress — mobile screen (Phase 6 · PR-D).
 *
 * Mobile port of `apps/web/src/modules/fizruk/pages/Progress.tsx`
 * scoped to the PR-D deliverables (body-weight timeseries +
 * body-composition timeseries + KPI strip). Photo progress and the
 * JSON / CSV backup surfaces land in later Phase 6 PRs (PR-E).
 *
 * All numeric selectors (weight trend, body-fat trend, KPIs) come
 * from `@sergeant/fizruk-domain`'s pure `domain/progress/*` module so
 * web and mobile stay in sync.
 */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  buildBodyFatTrend,
  buildWeightTrend,
  computeProgressKpis,
} from "@sergeant/fizruk-domain/domain";

import { Card } from "@/components/ui/Card";

import { MeasurementsChartSection } from "../components/progress/MeasurementsChartSection";
import { ProgressKPIs } from "../components/progress/ProgressKPIs";
import { WeightChartSection } from "../components/progress/WeightChartSection";
import type { FizrukProgressData } from "./useFizrukProgressData";
import { useFizrukProgressData } from "./useFizrukProgressData";

export interface ProgressProps {
  /**
   * Optional dependency-injected data override — used by jest tests
   * and storybook fixtures. Production callers should leave this
   * unset so `useFizrukProgressData()` runs.
   */
  data?: FizrukProgressData;
}

export function Progress({ data }: ProgressProps = {}) {
  const hookData = useFizrukProgressData();
  const { workouts, entries } = data ?? hookData;

  const weightTrend = useMemo(() => buildWeightTrend(entries), [entries]);
  const bodyFatTrend = useMemo(() => buildBodyFatTrend(entries), [entries]);
  const kpis = useMemo(
    () => computeProgressKpis(workouts, entries.length),
    [workouts, entries.length],
  );

  const hasAny = workouts.length > 0 || entries.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-cream-50" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        testID="fizruk-progress-scroll"
      >
        <ProgressKPIs kpis={kpis} />

        {!hasAny && (
          <Card
            radius="lg"
            padding="xl"
            className="items-center"
            testID="fizruk-progress-empty"
          >
            <Text className="text-3xl mb-2">{"📈"}</Text>
            <Text className="text-sm font-semibold text-fg mb-1">
              {"Даних ще немає"}
            </Text>
            <Text className="text-xs text-fg-muted text-center">
              {"Додай тренування або заміри, і тут зʼявиться аналітика"}
            </Text>
          </Card>
        )}

        {hasAny && (
          <>
            <WeightChartSection weightTrend={weightTrend} />
            <MeasurementsChartSection bodyFatTrend={bodyFatTrend} />
            <View testID="fizruk-progress-phase-hint" className="pt-1">
              <Text className="text-[10px] text-fg-subtle text-center">
                {
                  "Фаза 6 · PR-D: графіки (victory-native). Фотопрогрес і бекап – у PR-E."
                }
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default Progress;
