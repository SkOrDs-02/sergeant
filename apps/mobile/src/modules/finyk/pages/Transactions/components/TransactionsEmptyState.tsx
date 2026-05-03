/**
 * Sergeant Finyk — `TransactionsPage` empty state.
 *
 * Two flavours: "no tx in this month" and "no tx match active filter".
 * Primary CTA opens the manual-expense sheet on either path.
 */
import { Pressable, Text, View } from "react-native";

interface TransactionsEmptyStateProps {
  testID: string;
  hasActiveFilter: boolean;
  onAdd: () => void;
}

export function TransactionsEmptyState({
  testID,
  hasActiveFilter,
  onAdd,
}: TransactionsEmptyStateProps) {
  return (
    <View
      className="flex-1 items-center justify-center px-8"
      testID={`${testID}-empty`}
    >
      <Text className="text-5xl mb-3">🧾</Text>
      <Text className="text-base font-semibold text-fg mb-1 text-center">
        {hasActiveFilter
          ? "Нічого не знайдено"
          : "Немає транзакцій за цей місяць"}
      </Text>
      <Text className="text-sm text-fg-muted text-center mb-4">
        {hasActiveFilter
          ? "Спробуйте інший фільтр або очистіть пошук."
          : "Додайте першу витрату — і вона з'явиться тут."}
      </Text>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Додати першу витрату"
        testID={`${testID}-empty-add`}
        className="bg-brand-500 rounded-full h-11 px-5 items-center justify-center active:opacity-80"
      >
        <Text className="text-white text-sm font-semibold">
          + Додати витрату
        </Text>
      </Pressable>
    </View>
  );
}
