/**
 * `CalendarGrid` — сітка клітинок місяця для `PlanCalendar`. Рендерить
 * повний тижнево-місячний grid: порожні заглушки + кнопки-дні з
 * індикаторами шаблону, запланованих тренувань і відновлення.
 * Чисто презентаційний.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  dateKeyFromYMD,
  describeDayRecovery,
  type DayRecoveryForecast,
  type DayRecoveryStatus,
  type PlannedWorkoutLike,
} from "@sergeant/fizruk-domain/domain/plan/index";
import type { WorkoutTemplate } from "@sergeant/fizruk-domain/domain/types";

/** Tailwind background colour for a recovery dot. */
function recoveryDotClass(
  status: DayRecoveryStatus | null | undefined,
): string {
  switch (status) {
    case "overworked":
      return "bg-red-500";
    case "ready":
      return "bg-emerald-500";
    case "fresh":
      return "bg-line";
    default:
      return "";
  }
}

export interface CalendarGridProps {
  /** Year of the current month cursor. */
  year: number;
  /** Month index (0-based) of the current month cursor. */
  month: number;
  /**
   * Flat array of day-numbers (1-based) or `null` for padding cells,
   * as returned by `monthGrid()`.
   */
  cells: ReadonlyArray<number | null>;
  /** Date key of today for highlighting. */
  todayKey: string;
  /** Map from dateKey → monthly plan day (templateId). */
  days: Record<string, { templateId: string | null } | undefined>;
  /** All known workout templates to resolve template names. */
  templates: readonly WorkoutTemplate[];
  /** Aggregated planned workouts by dateKey. */
  plannedByDate: Record<string, PlannedWorkoutLike[] | undefined>;
  /** Recovery forecast keyed by dateKey. */
  recoveryForecast: Record<string, DayRecoveryForecast | undefined>;
  /** Called when the user taps a numbered day cell. */
  onDayPress: (day: number) => void;
}

function CalendarGridImpl({
  year,
  month,
  cells,
  todayKey,
  days,
  templates,
  plannedByDate,
  recoveryForecast,
  onDayPress,
}: CalendarGridProps) {
  return (
    <View className="flex-row flex-wrap">
      {cells.map((day, i) => {
        if (day == null) {
          return (
            <View key={`e-${i}`} className="w-[14.2857%] p-0.5">
              <View className="min-h-[52px] rounded-xl bg-panelHi/40" />
            </View>
          );
        }

        const key = dateKeyFromYMD(year, month, day);
        const tid = days[key]?.templateId;
        const tpl = tid ? (templates.find((t) => t.id === tid) ?? null) : null;
        const planned = plannedByDate[key] ?? [];
        const isToday = key === todayKey;
        const hasPlan = planned.length > 0;

        const borderClass = isToday
          ? "border-emerald-500 bg-emerald-50"
          : hasPlan
            ? "border-emerald-400/60 bg-emerald-50/60"
            : "border-line bg-panelHi/40";

        const forecast = recoveryForecast[key] ?? null;
        const dotClass = recoveryDotClass(forecast?.status);
        const recoveryLabel = forecast
          ? `. ${describeDayRecovery(forecast)}`
          : "";
        const a11yLabel = `День ${day}${recoveryLabel}`;

        return (
          <View key={key} className="w-[14.2857%] p-0.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={a11yLabel}
              testID={`plan-day-${key}`}
              onPress={() => onDayPress(day)}
              className={`min-h-[52px] rounded-xl border ${borderClass} p-1 items-center active:opacity-70`}
            >
              <View className="flex-row items-center gap-1">
                <Text className="text-xs font-bold text-fg">{day}</Text>
                {forecast ? (
                  <View
                    testID={`plan-day-${key}-recovery-${forecast.status}`}
                    className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
                  />
                ) : null}
              </View>
              {tpl ? (
                <Text
                  numberOfLines={1}
                  className="text-[9px] text-fg-muted leading-tight mt-0.5"
                >
                  {tpl.name}
                </Text>
              ) : null}
              {hasPlan ? (
                <Text className="text-[9px] text-emerald-700 font-bold leading-tight mt-0.5">
                  {planned.length > 1 ? `🏋 ×${planned.length}` : "🏋"}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export const CalendarGrid = memo(CalendarGridImpl);
