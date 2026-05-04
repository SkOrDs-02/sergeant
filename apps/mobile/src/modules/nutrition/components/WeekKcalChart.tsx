/**
 * 7-денна mini-bar-chart ккал. Mirror web `MiniBar` з
 * `NutritionDashboard.tsx`. Сегмент для "сьогодні" підсвічується
 * bg-nutrition full, інші — bg-nutrition/30.
 */
import { Text, View } from "react-native";

import type { MacrosRow } from "@sergeant/nutrition-domain";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const CHART_HEIGHT = 48;

export interface WeekKcalChartProps {
  rows: MacrosRow[];
  targetKcal: number;
  todayIso: string;
}

export function WeekKcalChart({
  rows,
  targetKcal,
  todayIso,
}: WeekKcalChartProps) {
  const max = Math.max(targetKcal || 1, ...rows.map((r) => r.kcal || 0));

  return (
    <View className="flex-row items-end gap-1 h-16">
      {rows.map((r) => {
        const ratio = max > 0 ? r.kcal / max : 0;
        const height = Math.max(3, ratio * CHART_HEIGHT);
        const isToday = r.date === todayIso;
        const [y, m, d] = r.date.split("-").map(Number);
        const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
        const label = DAY_LABELS[(dt.getDay() + 6) % 7];
        return (
          <View key={r.date} className="flex-1 items-center gap-0.5">
            <View
              style={{ height: CHART_HEIGHT, justifyContent: "flex-end" }}
              className="w-full items-center"
            >
              <View
                style={{
                  height,
                  width: 18,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
                className={isToday ? "bg-lime-500" : "bg-lime-500/30"}
              />
            </View>
            <Text
              className={
                isToday
                  ? "text-[9px] leading-none text-fg font-bold"
                  : "text-[9px] leading-none text-fg-subtle"
              }
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
