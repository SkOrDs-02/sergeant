/**
 * Sergeant Finyk — category filter sheet for the transactions feed.
 *
 * Two grouped lists (Витрати + Доходи) with the active filter id
 * highlighted. The parent owns the filter setter + the union of
 * categories (built-ins + user customs) it derives from `useCategoryFilters`.
 */
import { Pressable, ScrollView, Text } from "react-native";

import { Sheet } from "@/components/ui/Sheet";

interface CategoryOption {
  id: string;
  label: string;
}

interface CategoryFilterSheetProps {
  testID: string;
  open: boolean;
  onClose: () => void;
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  activeFilterId: string;
  activeCategoryLabel: string | null;
  onSelect: (id: string) => void;
}

export function CategoryFilterSheet({
  testID,
  open,
  onClose,
  expenseCategories,
  incomeCategories,
  activeFilterId,
  activeCategoryLabel,
  onSelect,
}: CategoryFilterSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Фільтр по категорії"
      description="Оберіть категорію (включно з MCC-категоріями за замовчуванням), щоб показати лише транзакції з нею."
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16, gap: 4 }}
        testID={`${testID}-filter-cat-sheet`}
      >
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
        <Text className="text-[11px] uppercase tracking-wide text-fg-subtle px-3 pt-2 pb-1">
          Витрати
        </Text>
        {expenseCategories.map((c) => {
          const checked = activeFilterId === c.id;
          return (
            <Pressable
              key={`exp-${c.id}`}
              onPress={() => onSelect(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              testID={`${testID}-filter-cat-opt-${c.id}`}
              className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
            >
              <Text className="text-sm text-fg flex-1">{c.label}</Text>
              <Text className={checked ? "text-brand-500" : "text-fg-subtle"}>
                {checked ? "☑" : "☐"}
              </Text>
            </Pressable>
          );
        })}
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
        <Text className="text-[11px] uppercase tracking-wide text-fg-subtle px-3 pt-3 pb-1">
          Доходи
        </Text>
        {incomeCategories.map((c) => {
          const checked = activeFilterId === c.id;
          return (
            <Pressable
              key={`inc-${c.id}`}
              onPress={() => onSelect(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              testID={`${testID}-filter-cat-opt-${c.id}`}
              className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
            >
              <Text className="text-sm text-fg flex-1">{c.label}</Text>
              <Text className={checked ? "text-brand-500" : "text-fg-subtle"}>
                {checked ? "☑" : "☐"}
              </Text>
            </Pressable>
          );
        })}
        {activeCategoryLabel && (
          <Pressable
            onPress={() => onSelect("all")}
            accessibilityRole="button"
            testID={`${testID}-filter-cat-clear`}
            className="mt-2 px-3 py-3 rounded-xl bg-cream-100 active:opacity-70"
          >
            <Text className="text-sm text-fg-muted text-center">
              Скинути категорію
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Sheet>
  );
}
