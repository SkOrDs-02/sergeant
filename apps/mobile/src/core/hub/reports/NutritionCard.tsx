/**
 * Lazy-loaded nutrition/kcal report card for the mobile Hub-Reports
 * surface. Mirrors `apps/web/src/core/hub/NutritionCard.tsx`: reads the
 * nutrition meal-log shard and sums kcal per day, with the average taken
 * over days that have at least one logged meal.
 */

import { useMemo } from "react";
import { Text, View } from "react-native";

import { safeReadLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  aggregateKcal,
  datesInRange,
  getPeriodRange,
  type NutritionLog,
  type Period,
} from "./hubReports.aggregation";
import { ReportBarChart, ReportDelta } from "./ReportChart";
import { ReportCardShell } from "./ReportCardShell";

export interface NutritionCardProps {
  period: Period;
  offset: number;
}

export default function NutritionCard({ period, offset }: NutritionCardProps) {
  const { cur, prev, dates } = useMemo(() => {
    const log = safeReadLS<NutritionLog>(STORAGE_KEYS.NUTRITION_LOG, {});
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateKcal(log, curDates),
      prev: aggregateKcal(log, prevDates),
      dates: curDates,
    };
  }, [period, offset]);

  const formattedAvg = cur.avg.toLocaleString("uk-UA");
  const formattedPrevAvg = prev.avg.toLocaleString("uk-UA");

  return (
    <ReportCardShell
      moduleKey="nutrition"
      emoji="🥗"
      title="Харчування (ккал)"
      collapsedStat={
        <>
          <Text className="text-base font-bold text-text">
            {formattedAvg} ккал
          </Text>
          <ReportDelta cur={cur.avg} prev={prev.avg} higherIsBetter />
        </>
      }
    >
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-extrabold text-text">
          {formattedAvg} ккал
        </Text>
        <ReportDelta cur={cur.avg} prev={prev.avg} higherIsBetter />
      </View>
      <Text className="text-xs text-muted">
        Середнє/день · минулий: {formattedPrevAvg} ккал
      </Text>
      <ReportBarChart
        key={`${period}-${offset}`}
        data={cur.daily}
        dates={dates}
        colorClass="bg-chart-nutrition"
        unit=" ккал"
      />
    </ReportCardShell>
  );
}
