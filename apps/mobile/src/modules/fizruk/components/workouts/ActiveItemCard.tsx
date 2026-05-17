import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

import type { FizrukWorkoutItem } from "../../hooks/useFizrukWorkouts";

export interface ActiveItemCardProps {
  item: FizrukWorkoutItem;
  onAddSet(): void;
  onEditSet(setIndex: number): void;
  testID?: string;
}

export function ActiveItemCard({
  item,
  onAddSet,
  onEditSet,
  testID,
}: ActiveItemCardProps) {
  const sets = item.sets ?? [];
  return (
    <Card variant="default" radius="lg" padding="md" testID={testID}>
      <Text className="text-sm font-semibold text-fg">
        {item.nameUk || "Вправа"}
      </Text>
      {sets.length > 0 ? (
        <View className="mt-2 gap-1">
          {sets.map((set, idx) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={`Сет ${idx + 1}: ${set.weightKg} кг × ${set.reps}`}
              onPress={() => onEditSet(idx)}
              testID={`${testID}-set-${idx}`}
              className="flex-row items-center justify-between py-1.5 px-2 rounded-lg bg-cream-100"
            >
              <Text className="text-xs text-fg-muted">Сет {idx + 1}</Text>
              <Text className="text-sm font-semibold text-fg">
                {set.weightKg} кг × {set.reps}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Додати сет"
        onPress={onAddSet}
        testID={`${testID}-add-set`}
        className="mt-3 h-10 rounded-xl bg-teal-600 items-center justify-center"
      >
        <Text className="text-sm font-semibold text-white">+ Додати сет</Text>
      </Pressable>
    </Card>
  );
}
