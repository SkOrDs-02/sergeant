/**
 * Sergeant Finyk — `TransactionsPage` header row.
 *
 * Month nav + clear-filters chip + add button. Pure presentational —
 * the parent owns selection state and the hook backing the
 * filter clear behaviour.
 */
import { Pressable, Text, View } from "react-native";

interface TransactionsHeaderProps {
  testID: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  hasActiveFilter: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onClearFilters: () => void;
  onAdd: () => void;
}

export function TransactionsHeader({
  testID,
  monthLabel,
  isCurrentMonth,
  hasActiveFilter,
  onPrevMonth,
  onNextMonth,
  onClearFilters,
  onAdd,
}: TransactionsHeaderProps) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center">
        <Pressable
          onPress={onPrevMonth}
          accessibilityRole="button"
          accessibilityLabel="Попередній місяць"
          testID={`${testID}-prev-month`}
          className="w-9 h-9 items-center justify-center rounded-xl active:opacity-60"
        >
          <Text className="text-xl text-fg-muted">‹</Text>
        </Pressable>
        <Text className="text-sm font-semibold text-fg capitalize px-2">
          {monthLabel}
        </Text>
        <Pressable
          onPress={onNextMonth}
          disabled={isCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Наступний місяць"
          accessibilityState={{ disabled: isCurrentMonth }}
          testID={`${testID}-next-month`}
          className="w-9 h-9 items-center justify-center rounded-xl active:opacity-60"
        >
          <Text
            className={
              isCurrentMonth
                ? "text-xl text-fg-subtle"
                : "text-xl text-fg-muted"
            }
          >
            ›
          </Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-1.5">
        {hasActiveFilter && (
          <Pressable
            onPress={onClearFilters}
            accessibilityRole="button"
            accessibilityLabel="Скинути всі фільтри"
            testID={`${testID}-clear-filters`}
            className="bg-cream-100 border border-cream-300 rounded-full h-9 px-3 items-center justify-center active:opacity-70"
          >
            <Text className="text-fg-muted text-xs font-medium">✕ Скинути</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Додати витрату"
          testID={`${testID}-add`}
          className="bg-brand-500 rounded-full h-9 px-4 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-sm font-semibold">+ Додати</Text>
        </Pressable>
      </View>
    </View>
  );
}
