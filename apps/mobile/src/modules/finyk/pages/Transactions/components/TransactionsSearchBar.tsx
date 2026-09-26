/**
 * Sergeant Finyk — `TransactionsPage` search input.
 *
 * Live-search field with a clear chip. The parent owns the value and
 * the (text → lowercase) reducer that feeds `useTransactionsFeed`.
 */
import { Pressable, Text, TextInput, View } from "react-native";

interface TransactionsSearchBarProps {
  testID: string;
  value: string;
  onChange: (value: string) => void;
}

export function TransactionsSearchBar({
  testID,
  value,
  onChange,
}: TransactionsSearchBarProps) {
  return (
    <View className="bg-cream-100 border border-cream-300 rounded-2xl px-3 flex-row items-center">
      <Text className="text-fg-subtle mr-2">🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Пошук по операціях…"
        placeholderTextColor="#a8a29e"
        className="flex-1 py-2.5 text-sm text-fg"
        accessibilityLabel="Пошук операцій"
        testID={`${testID}-search`}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange("")}
          accessibilityRole="button"
          accessibilityLabel="Очистити пошук"
          hitSlop={8}
        >
          <Text className="text-fg-subtle px-1">✕</Text>
        </Pressable>
      )}
    </View>
  );
}
