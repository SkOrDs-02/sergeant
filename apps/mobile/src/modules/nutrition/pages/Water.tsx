/**
 * Water tab сторінка — обгортка над `WaterTrackerCard` з отриманням
 * `goalMl` з MMKV-prefs. Відповідник web-варіанта, де WaterTrackerCard
 * рендериться в Dashboard-секції — на mobile ми дублюємо його ж
 * окремою вкладкою, щоб швидкий доступ з bottom-nav був натиском одного
 * таба.
 */
import { ScrollView, Text, View } from "react-native";

import { useNutritionPrefs } from "../hooks/useNutritionPrefs";
import { WaterTrackerCard } from "../components/WaterTrackerCard";

export interface WaterProps {
  testID?: string;
}

export function Water({ testID }: WaterProps) {
  const { prefs } = useNutritionPrefs();
  const goalMl = prefs.waterGoalMl ?? 2000;

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-cream-50"
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <View>
        <Text className="text-xs text-fg-muted mb-1 leading-none">
          Щоденний трекер
        </Text>
        <Text className="text-lg font-bold text-fg leading-none">Вода</Text>
      </View>
      <WaterTrackerCard goalMl={goalMl} testID="nutrition-water-card" />
      <Text className="text-[11px] text-fg-subtle leading-snug">
        Підрахунок скидається опівночі локального часу. Зміна денної цілі
        доступна у налаштуваннях харчування, зʼявиться в PR-7.
      </Text>
    </ScrollView>
  );
}
