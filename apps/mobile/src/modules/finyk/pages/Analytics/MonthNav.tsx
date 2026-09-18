/**
 * MonthNav — « <month-year> » stepper used by the Analytics screen.
 *
 * Mobile port of the `MonthNav` sub-component from
 * `apps/web/src/modules/finyk/pages/Analytics.tsx`. Keeps the same
 * 1-based month contract (1..12) and the "disable next when we're on
 * the current calendar month" guard so users can't paginate into
 * the future.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

export interface MonthNavProps {
  year: number;
  /** 1-based month (1..12). */
  month: number;
  onChange: (year: number, month: number) => void;
  /** `Date.now()` seam so jest tests can pin "today". */
  now?: Date;
}

function MonthNavComponent({ year, month, onChange, now }: MonthNavProps) {
  const today = now ?? new Date();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;
  const label = new Date(year, month - 1, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const go = (delta: number): void => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    onChange(y, m);
  };

  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={() => go(-1)}
        accessibilityRole="button"
        accessibilityLabel="Попередній місяць"
        testID="finyk-analytics-month-prev"
        className="w-10 h-10 rounded-xl border border-cream-300 items-center justify-center active:opacity-60"
      >
        <Text className="text-base text-fg-muted">‹</Text>
      </Pressable>
      <Text
        className="text-sm font-semibold text-fg capitalize"
        testID="finyk-analytics-month-label"
      >
        {label}
      </Text>
      <Pressable
        onPress={() => go(1)}
        disabled={isCurrentMonth}
        accessibilityRole="button"
        accessibilityLabel="Наступний місяць"
        accessibilityState={{ disabled: isCurrentMonth }}
        testID="finyk-analytics-month-next"
        className={
          "w-10 h-10 rounded-xl border border-cream-300 items-center justify-center " +
          (isCurrentMonth ? "opacity-30" : "active:opacity-60")
        }
      >
        <Text className="text-base text-fg-muted">›</Text>
      </Pressable>
    </View>
  );
}

export const MonthNav = memo(MonthNavComponent);
