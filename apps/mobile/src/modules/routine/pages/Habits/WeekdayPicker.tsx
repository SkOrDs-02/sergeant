/**
 * Sergeant Routine — WeekdayPicker (React Native)
 *
 * Mobile port of
 * `apps/web/src/modules/routine/components/settings/WeekdayPicker.tsx`.
 *
 * Parity notes:
 *  - Same `weekdays` / `onChange` prop contract as web.
 *  - Same toggle rule: tapping an already-selected day removes it
 *    UNLESS it's the last remaining day (at least one weekday must
 *    always be selected so the habit is schedulable).
 *  - Labels come from `@sergeant/routine-domain` `WEEKDAY_LABELS` so
 *    localisation / ordering stays in lock-step with web.
 *
 * Intentional differences from web:
 *  - `<button>` → `Pressable`. NativeWind classes pick up the same
 *    visual accent (cream surface, rose routine tint).
 *  - `role="radiogroup"` is not reused — this is a multi-select chip
 *    row, not a radio group (the web copy also uses a plain `<div>`).
 *    Instead we annotate each chip with `accessibilityRole="checkbox"`
 *    + `accessibilityState.checked` so VoiceOver / TalkBack read the
 *    state out loud.
 */

import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { WEEKDAY_LABELS } from "@sergeant/routine-domain";

export interface WeekdayPickerProps {
  weekdays: number[] | null | undefined;
  onChange: (next: number[]) => void;
  /** Accessibility hint / test hook. */
  testID?: string;
}

export const WeekdayPicker = memo(function WeekdayPicker({
  weekdays,
  onChange,
  testID,
}: WeekdayPickerProps) {
  // Memo-stabilise the derived array so `toggle`'s useCallback deps
  // don't churn on every parent render.
  const active = useMemo(() => weekdays || [], [weekdays]);

  const toggle = useCallback(
    (wd: number) => {
      const cur = [...active];
      const i = cur.indexOf(wd);
      if (i >= 0) {
        // Keep at least one weekday selected — parity with web.
        if (cur.length <= 1) return;
        cur.splice(i, 1);
      } else {
        cur.push(wd);
      }
      cur.sort((a, b) => a - b);
      onChange(cur);
    },
    [active, onChange],
  );

  return (
    <View testID={testID}>
      <Text className="text-xs text-fg-muted mb-2">Дні тижня</Text>
      <View className="flex-row flex-wrap gap-2">
        {WEEKDAY_LABELS.map((label, wd) => {
          const on = active.includes(wd);
          return (
            <Pressable
              key={label}
              onPress={() => toggle(wd)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              testID={testID ? `${testID}-day-${wd}` : undefined}
              className={
                on
                  ? "min-h-[40px] px-3 rounded-xl border border-rose-500 bg-rose-500 justify-center"
                  : "min-h-[40px] px-3 rounded-xl border border-cream-300 bg-cream-50 justify-center"
              }
            >
              <Text
                className={
                  on
                    ? "text-xs font-semibold text-white"
                    : "text-xs font-semibold text-fg"
                }
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});
