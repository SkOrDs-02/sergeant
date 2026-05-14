/**
 * Sergeant Routine — Calendar `DayCell`.
 *
 * Single 7-column-wide cell inside the month grid. Renders an empty
 * placeholder when `day === null` (leading/trailing padding), and
 * an interactive day pill otherwise. Visual state composes three
 * exclusive flags: `selected`, `isToday`, neither.
 */

import { Pressable, Text, View } from "react-native";

import { dateKeyFromDate } from "@sergeant/routine-domain";

import type { MonthCursor } from "./types";

export interface DayCellProps {
  /** `null` for grid padding cells, day-of-month otherwise. */
  day: number | null;
  cursor: MonthCursor;
  selectedDay: string;
  todayKey: string;
  /** Map of date-key → scheduled-events-count for this month grid. */
  dayCounts: Map<string, number>;
  onSelectDay: (dateKey: string) => void;
}

export function DayCell({
  day,
  cursor,
  selectedDay,
  todayKey,
  dayCounts,
  onSelectDay,
}: DayCellProps) {
  if (day === null) {
    return <View className="w-[14.2857%] aspect-square p-0.5" />;
  }
  const dk = dateKeyFromDate(new Date(cursor.y, cursor.m, day));
  const count = dayCounts.get(dk) ?? 0;
  const isToday = dk === todayKey;
  const isSelected = dk === selectedDay;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Обрати день ${dk}`}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onSelectDay(dk)}
      className="w-[14.2857%] aspect-square p-0.5"
    >
      <View
        className={
          "flex-1 items-center justify-center rounded-xl border " +
          (isSelected
            ? "bg-cream-100 border-ink-900"
            : isToday
              ? "bg-cream-50 border-line"
              : "bg-transparent border-transparent")
        }
      >
        <Text
          className={
            "text-sm font-bold " +
            (isSelected || isToday ? "text-ink-900" : "text-ink-600")
          }
        >
          {day}
        </Text>
        {count > 0 ? (
          <View className="mt-0.5 h-1 w-1 rounded-full bg-ink-500" />
        ) : (
          <View className="mt-0.5 h-1 w-1 rounded-full bg-transparent" />
        )}
      </View>
    </Pressable>
  );
}
