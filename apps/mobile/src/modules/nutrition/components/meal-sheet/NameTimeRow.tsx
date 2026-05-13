/**
 * NameTimeRow — RN port of web's meal-sheet/NameTimeRow.
 * Meal name input + collapsible time input (defaults to "now").
 * Voice input omitted — will arrive with expo-speech-recognition (Phase 8).
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, Text, View } from "react-native";

import { Input } from "@/components/ui/Input";

import { currentTime, type MealFormState } from "./mealFormUtils";

interface NameTimeRowProps {
  form: MealFormState;
  field: (key: keyof MealFormState) => (v: string) => void;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function NameTimeRow({ form, field }: NameTimeRowProps) {
  const [showTime, setShowTime] = useState(false);
  const isNow = form.time === currentTime();
  const timeVisible = showTime || !isNow;

  return (
    <View className="mb-4">
      <View className={timeVisible ? "flex-row gap-3" : ""}>
        <View className={timeVisible ? "flex-1" : ""}>
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- form label */}
          <Text className="text-xs font-bold uppercase text-fg-muted mb-1 tracking-wider">
            Назва страви
          </Text>
          <Input
            value={form.name}
            onChangeText={field("name")}
            placeholder="Вівсянка з бананом"
            accessibilityLabel="Назва страви"
            autoCapitalize="sentences"
            testID="add-meal-name"
          />
        </View>
        {timeVisible ? (
          <View className="w-24">
            {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- form label */}
            <Text className="text-xs font-bold uppercase text-fg-muted mb-1 tracking-wider">
              Час
            </Text>
            <Input
              value={form.time}
              onChangeText={field("time")}
              placeholder="12:30"
              accessibilityLabel="Час"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        ) : null}
      </View>
      {!timeVisible ? (
        <Pressable
          onPress={() => setShowTime(true)}
          accessibilityRole="button"
          accessibilityLabel={`Змінити час (${form.time})`}
          className="mt-2"
        >
          <Text className="text-xs text-fg-subtle underline">
            Не зараз? Змінити час ({form.time})
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
