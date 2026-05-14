/**
 * Sergeant Routine — Calendar `MonthHeader`.
 *
 * Title strip with prev/next month arrows and a «Сьогодні»
 * shortcut. The `NavButton` is intentionally co-located here —
 * it's only used by the header and has no other consumers.
 */

import { Pressable, Text, View, type PressableProps } from "react-native";

import { formatMonthTitle } from "./formatters";
import type { MonthCursor } from "./types";

export interface MonthHeaderProps {
  cursor: MonthCursor;
  onShift: (delta: number) => void;
  onToday: () => void;
}

export function MonthHeader({ cursor, onShift, onToday }: MonthHeaderProps) {
  return (
    <View className="flex-row items-center gap-2 px-1">
      <NavButton
        accessibilityLabel="Попередній місяць"
        onPress={() => onShift(-1)}
        glyph="‹"
      />
      <View className="flex-1 items-center">
        <Text className="text-base font-bold text-ink-900 capitalize">
          {formatMonthTitle(cursor)}
        </Text>
      </View>
      <NavButton
        accessibilityLabel="Наступний місяць"
        onPress={() => onShift(1)}
        glyph="›"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Перейти на сьогодні"
        onPress={onToday}
        className="ml-1 min-h-[36px] items-center justify-center rounded-xl border border-line bg-cream-50 px-3"
      >
        <Text className="text-xs font-bold text-ink-900">Сьогодні</Text>
      </Pressable>
    </View>
  );
}

interface NavButtonProps extends Pick<PressableProps, "onPress"> {
  glyph: string;
  accessibilityLabel: string;
}

function NavButton({ onPress, glyph, accessibilityLabel }: NavButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel"
    >
      <Text className="text-lg font-bold text-ink-700">{glyph}</Text>
    </Pressable>
  );
}
