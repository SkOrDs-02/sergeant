/**
 * Sergeant Routine — Calendar `EventRow`.
 *
 * Single habit/event row inside the grouped event list. Habits are
 * tappable check-circles; non-habit events (Fizruk plan, Finyk
 * subscriptions) render as read-only text rows.
 */

import { Pressable, Text, View } from "react-native";

import type { HubCalendarEvent } from "@sergeant/routine-domain";

export interface EventRowProps {
  event: HubCalendarEvent;
  onToggle: () => void;
  testID?: string;
}

export function EventRow({ event, onToggle, testID }: EventRowProps) {
  const isHabit = event.sourceKind === "habit";
  const completed = !!event.completed;
  return (
    <Pressable
      accessibilityRole={isHabit ? "checkbox" : "text"}
      accessibilityLabel={event.title}
      accessibilityState={isHabit ? { checked: completed } : undefined}
      testID={testID}
      onPress={isHabit ? onToggle : undefined}
      className={
        "flex-row items-center gap-3 rounded-xl border px-3 py-2 " +
        (completed ? "bg-cream-50 border-line" : "bg-panel border-line")
      }
    >
      <View
        testID={testID ? `${testID}-indicator` : undefined}
        className={
          "h-6 w-6 rounded-full border-2 items-center justify-center " +
          (completed
            ? "bg-ink-900 border-ink-900"
            : "bg-transparent border-ink-500")
        }
      >
        {completed ? (
          <Text
            testID={testID ? `${testID}-check` : undefined}
            className="text-xs font-bold text-cream-50"
          >
            ✓
          </Text>
        ) : null}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={
            "text-sm font-bold " +
            (completed ? "text-ink-500 line-through" : "text-ink-900")
          }
          numberOfLines={1}
        >
          {event.title}
        </Text>
        {event.subtitle ? (
          <Text className="text-xs text-ink-500" numberOfLines={1}>
            {event.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
