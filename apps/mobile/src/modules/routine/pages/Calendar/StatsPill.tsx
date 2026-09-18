/**
 * Sergeant Routine — Calendar `StatsPill`.
 *
 * Three-chip stats strip: current streak, completion ratio for the
 * focused range, and today's day-progress counter. `StatChip` is
 * co-located because no other Calendar surface uses it.
 */

import { Text, View } from "react-native";
import {
  CalendarDays,
  CircleCheck,
  Flame,
  type LucideIcon,
} from "lucide-react-native";
import { moduleColors } from "@sergeant/design-tokens/tokens";

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
        icon={Flame}
        label="Серія"
        value={`${streak} дн.`}
        testID="routine-calendar-streak"
      />
      <StatChip
        icon={CircleCheck}
        label="Виконано"
        value={`${rate.completed}/${rate.scheduled} · ${pct}%`}
        testID="routine-calendar-completion"
      />
      <StatChip
        icon={CalendarDays}
        label="День"
        value={`${dayProgress.completed}/${dayProgress.scheduled}`}
        testID="routine-calendar-day-progress"
      />
    </View>
  );
}

interface StatChipProps {
  /** F7 (анти-слоп 2026-09-01): stroke-іконка замість емодзі в підписі. */
  icon: LucideIcon;
  label: string;
  value: string;
  testID?: string;
}

function StatChip({ icon: Icon, label, value, testID }: StatChipProps) {
  return (
    <View
      className="flex-1 rounded-xl border border-line bg-panel px-3 py-2"
      testID={testID}
    >
      <View className="flex-row items-center gap-1">
        <Icon
          size={12}
          color={moduleColors.routine.primary}
          strokeWidth={2.5}
        />
        <Text
          className="text-2xs font-bold uppercase text-ink-500"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
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
