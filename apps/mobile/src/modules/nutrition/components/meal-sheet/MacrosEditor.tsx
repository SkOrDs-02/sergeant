/**
 * MacrosEditor — RN port of web's meal-sheet/MacrosEditor.
 * 2x2 grid of KBZV inputs (kcal, protein, fat, carbs).
 * Photo-result "restore" button omitted until Phase 8 (AI).
 */
import { type Dispatch, type SetStateAction } from "react";
import { Text, View } from "react-native";

import { Input } from "@/components/ui/Input";

import type { MealFormState } from "./mealFormUtils";

const FIELDS = [
  { key: "kcal" as const, label: "Ккал", placeholder: "350" },
  { key: "protein_g" as const, label: "Білки г", placeholder: "12" },
  { key: "fat_g" as const, label: "Жири г", placeholder: "6" },
  { key: "carbs_g" as const, label: "Вуглев. г", placeholder: "60" },
];

interface MacrosEditorProps {
  form: MealFormState;
  field: (key: keyof MealFormState) => (v: string) => void;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function MacrosEditor({ form, field }: MacrosEditorProps) {
  return (
    <View className="mb-1">
      <Text className="text-xs font-bold uppercase text-fg-muted mb-2 tracking-wider">
        КБЖВ
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <View key={key} className="flex-1 min-w-[45%]">
            <Text className="text-[10px] font-bold uppercase text-fg-subtle mb-1">
              {label}
            </Text>
            <Input
              value={form[key]}
              onChangeText={field(key)}
              placeholder={placeholder}
              accessibilityLabel={label}
              keyboardType="decimal-pad"
            />
          </View>
        ))}
      </View>
    </View>
  );
}
