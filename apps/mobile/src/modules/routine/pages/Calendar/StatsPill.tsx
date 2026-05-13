/**
 * Sergeant Routine — Calendar `StatsPill`.
 *
 * Three-chip stats strip: current streak, completion ratio for the
 * focused range, and today's day-progress counter. `StatChip` is
 * co-located because no other Calendar surface uses it.
 */

import { Text, View } from "react-native";

export interface StatsPillProps {
  streak: number;
  rate: { completed: number; scheduled: number; rate: number };
  dayProgress: { completed: number; scheduled: number };
}

export function StatsPill({ streak, rate, dayProgress }: StatsPillProps) {
  const pct = Math.round(rate.rate * 100);
  return (
    <View className="flex-row gap-2">
      <StatChip
        label="🔥 Серія"
        value={`${streak} дн.`}
        testID="routine-calendar-streak"
      />
      <StatChip
        label="✅ Виконано"
        value={`${rate.completed}/${rate.scheduled} · ${pct}%`}
        testID="routine-calendar-completion"
      />
      <StatChip
        label="📅 День"
        value={`${dayProgress.completed}/${dayProgress.scheduled}`}
        testID="routine-calendar-day-progress"
      />
    </View>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  testID?: string;
}

function StatChip({ label, value, testID }: StatChipProps) {
  return (
    <View
      className="flex-1 rounded-xl border border-line bg-panel px-3 py-2"
      testID={testID}
    >
      <Text
        className="text-2xs font-bold uppercase text-ink-500"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className="text-sm font-bold text-ink-900 mt-0.5"
        numberOfLines={1}
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Text>
    </View>
  );
}
