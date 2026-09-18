/**
 * Finyk — CategoryPickerSheet (React Native)
 *
 * Bottom-sheet category picker invoked from the Transactions feed when
 * the user swipes a row right ("Categorize"). Shows expense categories
 * for outgoing transactions and income categories for incoming ones,
 * plus any user-defined custom categories. A "Скинути" row clears any
 * existing override.
 *
 * The web equivalent is the inline `catPicker` grid in
 * `apps/web/src/modules/finyk/components/TxRow.tsx` (lines 437-473).
 * Mobile prefers a dedicated bottom sheet because there is no room to
 * expand the row inline without breaking FlashList recycling.
 */
import { useMemo } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { Sheet } from "@/components/ui/Sheet";
import {
  INCOME_CATEGORIES,
  mergeExpenseCategoryDefinitions,
} from "@sergeant/finyk-domain";

export interface CategoryPickerCustom {
  id: string;
  label?: string;
}

export interface CategoryPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (categoryId: string | null) => void;
  /** `+` for income picker, `-` for expense picker. */
  direction: "income" | "expense";
  customCategories?: CategoryPickerCustom[];
  /** Currently-selected override id (null = no override). */
  selectedId?: string | null;
  testID?: string;
}

export function CategoryPickerSheet({
  open,
  onClose,
  onSelect,
  direction,
  customCategories,
  selectedId,
  testID = "finyk-tx-cat-picker",
}: CategoryPickerSheetProps) {
  const options = useMemo<{ id: string; label: string }[]>(() => {
    if (direction === "income") {
      return INCOME_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
    }
    const merged = mergeExpenseCategoryDefinitions(
      (customCategories ?? []) as { id: string; label?: string }[],
    ) as { id: string; label: string }[];
    return merged.map((c) => ({ id: c.id, label: c.label }));
  }, [direction, customCategories]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Обрати категорію"
      description="Перевизначення зберігається тільки для цієї транзакції."
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16, gap: 6 }}
        testID={testID}
      >
        <Pressable
          onPress={() => onSelect(null)}
          accessibilityRole="button"
          accessibilityLabel="Скинути категорію"
          testID={`${testID}-clear`}
          className="flex-row items-center px-3 py-3 rounded-xl bg-cream-100 active:opacity-70"
        >
          <Text className="text-fg-muted text-sm flex-1">↺ Скинути</Text>
          {selectedId == null && (
            <Text className="text-brand-500 text-base">✓</Text>
          )}
        </Pressable>
        {options.map((opt) => {
          const selected = selectedId === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onSelect(opt.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`${testID}-opt-${opt.id}`}
              className={
                selected
                  ? "flex-row items-center px-3 py-3 rounded-xl bg-brand-500/10 active:opacity-70"
                  : "flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
              }
            >
              <Text
                className={
                  selected
                    ? "text-brand-700 text-sm font-semibold flex-1"
                    : "text-fg text-sm flex-1"
                }
              >
                {opt.label}
              </Text>
              {selected && <Text className="text-brand-500 text-base">✓</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
