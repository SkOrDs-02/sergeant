/**
 * Sergeant Routine — Calendar `GroupedEventList`.
 *
 * Renders the time-of-day-grouped event sections (Ранок / День /
 * Вечір / Будь-коли) returned by `groupEventsForList`, or an
 * empty banner when the focused range has no events at all.
 */

import { Text, View } from "react-native";

import type { HubCalendarEvent } from "@sergeant/routine-domain";

import { EventRow } from "./EventRow";

export interface GroupedEventListProps {
  grouped: Array<[string, HubCalendarEvent[]]>;
  onToggleHabit: (habitId: string, dateKey: string) => void;
  testID?: string;
}

export function GroupedEventList({
  grouped,
  onToggleHabit,
  testID,
}: GroupedEventListProps) {
  if (grouped.length === 0) {
    return (
      <View
        testID={testID ? `${testID}-empty` : undefined}
        className="rounded-2xl border border-line bg-panel p-4 items-center"
      >
        <Text className="text-sm text-ink-500">
          Немає подій для цього діапазону.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-3" testID={testID}>
      {grouped.map(([head, rows]) => (
        <View key={head} className="gap-2">
          <Text className="text-2xs font-bold uppercase text-ink-500">
            {head}
          </Text>
          <View className="gap-2">
            {rows.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                testID={
                  testID && e.habitId
                    ? `${testID}-habit-${e.habitId}`
                    : testID
                      ? `${testID}-event-${e.id}`
                      : undefined
                }
                onToggle={() =>
                  e.habitId ? onToggleHabit(e.habitId, e.date) : undefined
                }
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
