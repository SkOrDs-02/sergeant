/**
 * Sergeant Routine — Calendar `MonthGridView`.
 *
 * 6×7 month grid host. Stays a thin layout shell after the
 * `WeekHeader` / `DayCell` extraction (P2.2b) — its only job is
 * to ask `@sergeant/routine-domain` for the month grid layout and
 * fan-out cells to the dedicated `DayCell` component.
 */

import { View } from "react-native";

import { monthGrid } from "@sergeant/routine-domain";

import { DayCell } from "./DayCell";
import { WeekHeader } from "./WeekHeader";
import type { MonthCursor } from "./types";

export interface MonthGridViewProps {
  cursor: MonthCursor;
  selectedDay: string;
  todayKey: string;
  dayCounts: Map<string, number>;
  onSelectDay: (dateKey: string) => void;
}

export function MonthGridView({
  cursor,
  selectedDay,
  todayKey,
  dayCounts,
  onSelectDay,
}: MonthGridViewProps) {
  const { cells } = monthGrid(cursor.y, cursor.m);
  return (
    <View className="rounded-2xl border border-line bg-panel p-2">
      <WeekHeader />
      <View className="flex-row flex-wrap">
        {cells.map((d, idx) => (
          <DayCell
            // Padding cells share `null` but a stable key — fall back to
            // the slot index. Real day cells use the date-key directly so
            // `react` can keep cell identity across month shifts.
            key={d === null ? `empty_${idx}` : `${cursor.y}-${cursor.m}-${d}`}
            day={d}
            cursor={cursor}
            selectedDay={selectedDay}
            todayKey={todayKey}
            dayCounts={dayCounts}
            onSelectDay={onSelectDay}
          />
        ))}
      </View>
    </View>
  );
}
