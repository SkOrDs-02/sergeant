/**
 * Lazy-loaded routine/habits report card for the mobile Hub-Reports
 * surface. Mirrors `apps/web/src/core/hub/RoutineCard.tsx`: reads the
 * routine state shard and aggregates habit-completion % per day.
 *
 * Migrated (dual-write teardown) to read from the SQLite warm cache
 * (`getCachedSqliteRoutineState` + `getCachedSqliteCompletions`) instead
 * of the now-tombstoned `hub_routine_v1` MMKV key. Reactivity is provided
 * by `useRoutineSqliteReadTick` so the card re-aggregates whenever the
 * routine cache is refreshed (boot warm-up or habit mutation).
 */

import { useMemo } from "react";
import { Text, View } from "react-native";

import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
} from "@/modules/routine/lib/sqliteReader";
import { useRoutineSqliteReadTick } from "@/modules/routine/lib/sqliteReadGate";

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
  const cacheTick = useRoutineSqliteReadTick();

  const { cur, prev, dates } = useMemo(() => {
    const sqliteState = getCachedSqliteRoutineState();
    const completionsCache = getCachedSqliteCompletions();
    const state: RoutineState | null =
      sqliteState.refreshedAt !== null || completionsCache.refreshedAt !== null
        ? {
            habits: sqliteState.habits,
            completions: completionsCache.completions,
          }
        : null;
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateHabits(state, curDates),
      prev: aggregateHabits(state, prevDates),
      dates: curDates,
    };
    // cacheTick is the reactivity dependency; period/offset control the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, offset, cacheTick]);

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
