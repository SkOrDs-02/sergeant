/**
 * Sergeant Routine — Calendar `WeekHeader`.
 *
 * Static `Пн … Нд` row above the month grid. Extracted as a named
 * component because the audit (`P2.2b`) calls it out explicitly,
 * and because it makes the grid view body straightforward to
 * inspect in isolation.
 */

import { Text, View } from "react-native";

import { WEEK_HEADERS } from "./constants";

export function WeekHeader() {
  return (
    <View className="flex-row">
      {WEEK_HEADERS.map((w) => (
        <View key={w} className="flex-1 py-1 items-center">
          <Text className="text-2xs font-semibold text-ink-500">{w}</Text>
        </View>
      ))}
    </View>
  );
}
