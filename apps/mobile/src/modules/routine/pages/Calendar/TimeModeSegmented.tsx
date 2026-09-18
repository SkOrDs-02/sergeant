/**
 * Sergeant Routine — Calendar `TimeModeSegmented`.
 *
 * Three-segment switch (Сьогодні / Тиждень / Місяць) used at the
 * top of the mobile Calendar page. Pure controlled component:
 * parent owns the `TimeMode` state.
 */

import { Pressable, Text, View } from "react-native";

import type { TimeMode } from "./types";

export interface TimeModeSegmentedProps {
  value: TimeMode;
  onChange: (next: TimeMode) => void;
}

const ITEMS: ReadonlyArray<{ id: TimeMode; label: string }> = [
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
];

export function TimeModeSegmented({ value, onChange }: TimeModeSegmentedProps) {
  return (
    <View className="flex-row rounded-2xl bg-panel border border-line p-1">
      {ITEMS.map((it) => {
        const active = value === it.id;
        return (
          <Pressable
            key={it.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={it.label}
            onPress={() => onChange(it.id)}
            className={
              "flex-1 min-h-[40px] items-center justify-center rounded-xl px-3 " +
              (active ? "bg-cream-50" : "bg-transparent")
            }
          >
            <Text
              className={
                "text-sm font-bold " +
                (active ? "text-ink-900" : "text-ink-500")
              }
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
