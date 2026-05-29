/**
 * Lazy-loaded fizruk/workout report card for the mobile Hub-Reports
 * surface. Mirrors `apps/web/src/core/hub/FitnessCard.tsx`: reads the
 * `fizruk_workouts_v1` MMKV shard and aggregates cur/prev independently
 * so the page can render this card without blocking on other modules.
 */

import { useMemo } from "react";
import { Text, View } from "react-native";

import { safeReadStringLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  aggregateWorkouts,
  datesInRange,
  getPeriodRange,
  type Period,
} from "./hubReports.aggregation";
import { ReportBarChart, ReportDelta } from "./ReportChart";
import { ReportCardShell } from "./ReportCardShell";

export interface FitnessCardProps {
  period: Period;
  offset: number;
}

export default function FitnessCard({ period, offset }: FitnessCardProps) {
  const { cur, prev, dates } = useMemo(() => {
    const raw = safeReadStringLS(STORAGE_KEYS.FIZRUK_WORKOUTS);
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateWorkouts(raw, curDates),
      prev: aggregateWorkouts(raw, prevDates),
      dates: curDates,
    };
  }, [period, offset]);

  const formattedCurrent = cur.count.toLocaleString("uk-UA");
  const formattedPrev = prev.count.toLocaleString("uk-UA");

  return (
    <ReportCardShell
      moduleKey="workouts"
      emoji="🏋️"
      title="Фізрук (тренування)"
      collapsedStat={
        <>
          <Text className="text-base font-bold text-text">
            {formattedCurrent} трен.
          </Text>
          <ReportDelta cur={cur.count} prev={prev.count} higherIsBetter />
        </>
      }
    >
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-extrabold text-text">
          {formattedCurrent} трен.
        </Text>
        <ReportDelta cur={cur.count} prev={prev.count} higherIsBetter />
      </View>
      <Text className="text-xs text-muted">Минулий: {formattedPrev} трен.</Text>
      <ReportBarChart
        key={`${period}-${offset}`}
        data={cur.daily}
        dates={dates}
        colorClass="bg-chart-fizruk"
        unit=" трен."
      />
    </ReportCardShell>
  );
}
