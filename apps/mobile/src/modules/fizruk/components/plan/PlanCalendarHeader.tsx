/**
 * `PlanCalendarHeader` — навігація місяця + рядок заголовку тижня для
 * `PlanCalendar`. Чисто презентаційний; вся логіка курсора та станів
 * управляється батьківським компонентом.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

export interface PlanCalendarHeaderProps {
  /** Localised month title (e.g. "березень 2025"). */
  monthTitle: string;
  /** Human-readable summary of assigned template days. */
  templateSummary: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToday: () => void;
}

function PlanCalendarHeaderImpl({
  monthTitle,
  templateSummary,
  onPrevMonth,
  onNextMonth,
  onGoToday,
}: PlanCalendarHeaderProps) {
  return (
    <>
      {/* Month navigation row */}
      <View className="flex-row items-center justify-between gap-2 mb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Попередній місяць"
          onPress={onPrevMonth}
          className="w-10 h-10 rounded-xl border border-line items-center justify-center"
        >
          <Text className="text-lg text-fg">‹</Text>
        </Pressable>
        <Text className="text-base font-bold text-fg capitalize">
          {monthTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Наступний місяць"
          onPress={onNextMonth}
          className="w-10 h-10 rounded-xl border border-line items-center justify-center"
        >
          <Text className="text-lg text-fg">›</Text>
        </Pressable>
      </View>

      {/* Template summary + Today quick-action */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-[11px] text-fg-muted">{templateSummary}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Перейти до поточного місяця"
          onPress={onGoToday}
          className="px-2 py-1 rounded-lg active:opacity-60"
        >
          <Text className="text-xs font-semibold text-teal-700">Сьогодні</Text>
        </Pressable>
      </View>

      {/* Day-of-week labels */}
      <View className="flex-row mb-1">
        {WEEKDAYS.map((w) => (
          <View key={w} className="w-[14.2857%] items-center">
            <Text className="text-[10px] font-semibold text-fg-subtle">
              {w}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

export const PlanCalendarHeader = memo(PlanCalendarHeaderImpl);
