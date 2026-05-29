/**
 * Lazy-loaded routine/habits report card for the mobile Hub-Reports
 * surface. Mirrors `apps/web/src/core/hub/RoutineCard.tsx`: reads the
 * routine state shard and aggregates habit-completion % per day.
 *
 * Reads via the legacy `hub_routine_v1` MMKV key, the same cross-module
 * read path `coachSnapshot.ts` uses on native (the SQLite `routine_*`
 * tables are canonical for the routine module itself, but the legacy key
 * remains the shared cross-module read shard mirrored from web).
 */

import { useMemo } from "react";
import { Text, View } from "react-native";

import { safeReadLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  aggregateHabits,
  datesInRange,
  getPeriodRange,
  type Period,
  type RoutineState,
} from "./hubReports.aggregation";
import { ReportBarChart, ReportDelta } from "./ReportChart";
import { ReportCardShell } from "./ReportCardShell";

export interface RoutineCardProps {
  period: Period;
  offset: number;
}

export default function RoutineCard({ period, offset }: RoutineCardProps) {
  const { cur, prev, dates } = useMemo(() => {
    const state = safeReadLS<RoutineState | null>(STORAGE_KEYS.ROUTINE, null);
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateHabits(state, curDates),
      prev: aggregateHabits(state, prevDates),
      dates: curDates,
    };
  }, [period, offset]);

  return (
    <ReportCardShell
      moduleKey="habits"
      emoji="✅"
      title="Рутина (звички)"
      collapsedStat={
        <>
          <Text className="text-base font-bold text-text">{cur.pct}%</Text>
          <ReportDelta cur={cur.pct} prev={prev.pct} higherIsBetter />
        </>
      }
    >
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-extrabold text-text">{cur.pct}%</Text>
        <ReportDelta cur={cur.pct} prev={prev.pct} higherIsBetter />
      </View>
      <Text className="text-xs text-muted">Минулий: {prev.pct}%</Text>
      <ReportBarChart
        key={`${period}-${offset}`}
        data={cur.daily}
        dates={dates}
        colorClass="bg-chart-routine"
        maxValue={100}
        unit="%"
      />
    </ReportCardShell>
  );
}
