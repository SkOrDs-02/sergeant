/**
 * MealTypePicker — RN port of web's meal-sheet/MealTypePicker.
 * Four pill buttons: Snidanok / Obid / Vecherya / Perekus.
 */
import { type Dispatch, type SetStateAction } from "react";
import { Pressable, Text, View } from "react-native";

import { MEAL_TYPES, type MealTypeId } from "@sergeant/nutrition-domain";
import { hapticTap } from "@sergeant/shared";

import { NutritionIcon } from "../NutritionIcon";
import type { MealFormState } from "./mealFormUtils";

interface MealTypePickerProps {
  mealType: MealTypeId;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function MealTypePicker({ mealType, setForm }: MealTypePickerProps) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-bold uppercase text-fg-muted mb-2 tracking-wider">
        Прийом їжі
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MEAL_TYPES.map((mt) => {
          const active = mealType === mt.id;
          return (
            <Pressable
              key={mt.id}
              accessibilityRole="button"
              accessibilityLabel={mt.label}
              accessibilityState={{ selected: active }}
              onPress={() => {
                hapticTap();
                setForm((s) => ({ ...s, mealType: mt.id }));
              }}
              className={`px-3 py-1.5 rounded-xl border ${
                active
                  ? "bg-lime-600 border-lime-600"
                  : "bg-cream-100 border-cream-300"
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                <NutritionIcon
                  name={mt.iconName}
                  size={14}
                  color={active ? "#FFFFFF" : "#7A7A7A"}
                />
                <Text
                  className={`text-sm font-semibold ${
                    active ? "text-white" : "text-fg-muted"
                  }`}
                >
                  {mt.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
