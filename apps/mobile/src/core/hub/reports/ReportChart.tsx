/**
 * Shared bar chart + delta indicator for the mobile Hub-Reports cards.
 *
 * Mirrors the per-card `BarChart` / `Delta` sub-components from
 * `apps/web/src/core/hub/FitnessCard.tsx` et al. On web each lazy card
 * inlines its own copy to keep the chunk self-contained; on native the
 * cards are tiny so a single shared component keeps the surface small
 * without coupling card data.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { TrendingDown, TrendingUp } from "lucide-react-native";

import { localDateKey } from "./hubReports.aggregation";

const DAY_NAMES_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

function labelStep(count: number): number {
  if (count <= 7) return 1;
  if (count <= 15) return 2;
  return Math.ceil(count / 8);
}

function formatLabel(dateStr: string, isWeek: boolean): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isWeek) return DAY_NAMES_UK[d.getDay()] ?? "";
  return String(d.getDate());
}

function formatTooltip(dateStr: string, value: number, unit: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}: ${value.toLocaleString("uk-UA")}${unit}`;
}

export interface ReportBarChartProps {
  data: Record<string, number>;
  dates: string[];
  /** NativeWind background colour class for the bars. */
  colorClass: string;
  maxValue?: number;
  unit?: string;
}

export function ReportBarChart({
  data,
  dates,
  colorClass,
  maxValue,
  unit = "",
}: ReportBarChartProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const vals = dates.map((d) => data[d] ?? 0);
  const max = maxValue || Math.max(...vals, 1);
  const hasData = vals.some((v) => v > 0);
  const isWeek = dates.length <= 7;

  if (!hasData) {
    return (
      <View className="h-24 items-center justify-center">
        <Text className="text-xs text-muted">Немає даних</Text>
      </View>
    );
  }

  const step = labelStep(dates.length);
  const todayKey = localDateKey();
  const selectedDate = selected !== null ? dates[selected] : undefined;
  const selectedVal = selected !== null ? vals[selected] : undefined;

  return (
    <View>
      <View className="mb-1 h-4 items-center justify-center">
        {selectedDate !== undefined && selectedVal !== undefined ? (
          <Text className="text-center text-2xs text-text">
            {formatTooltip(selectedDate, selectedVal, unit)}
          </Text>
        ) : null}
      </View>

      <View
        className="h-20 flex-row items-end gap-0.5"
        accessibilityLabel="Графік"
      >
        {vals.map((v, i) => {
          const dk = dates[i];
          if (dk === undefined) return null;
          const pct = Math.max(0, Math.min(100, (v / max) * 100));
          const isToday = dk === todayKey;
          const isSelected = selected === i;
          return (
            <Pressable
              key={dk}
              accessibilityRole="button"
              onPress={() => setSelected(isSelected ? null : i)}
              className="h-full flex-1 items-center justify-end"
            >
              <View
                className={`w-full rounded-t-sm ${colorClass} ${
                  isToday || isSelected ? "opacity-100" : "opacity-60"
                }`}
                style={{
                  height: `${pct}%`,
                  minHeight: v > 0 ? 2 : 0,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View className="mt-1 flex-row gap-0.5">
        {dates.map((d, i) => {
          const show = i % step === 0 || i === dates.length - 1;
          return (
            <Text
              key={d}
              className={`flex-1 text-center text-2xs leading-tight ${
                selected === i ? "font-medium text-text" : "text-muted"
              }`}
            >
              {show ? formatLabel(d, isWeek) : ""}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

export interface ReportDeltaProps {
  cur: number;
  prev: number;
  higherIsBetter?: boolean;
}

export function ReportDelta({
  cur,
  prev,
  higherIsBetter = true,
}: ReportDeltaProps) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return <Text className="text-xs text-muted">—</Text>;

  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  const positive = higherIsBetter ? diff >= 0 : diff <= 0;
  const sign = diff >= 0 ? "+" : "";
  const trendingUp = diff >= 0;
  const colorClass = positive ? "text-success" : "text-danger";
  const iconColor = positive ? "#16a34a" : "#ef4444";

  return (
    <View className="flex-row items-center gap-0.5">
      {trendingUp ? (
        <TrendingUp size={10} color={iconColor} />
      ) : (
        <TrendingDown size={10} color={iconColor} />
      )}
      <Text className={`text-2xs ${colorClass}`}>
        {sign}
        {pct}%
      </Text>
    </View>
  );
}
