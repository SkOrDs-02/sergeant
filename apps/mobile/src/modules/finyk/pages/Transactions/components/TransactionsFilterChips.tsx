/**
 * Sergeant Finyk — `TransactionsPage` filter-chip strip.
 *
 * Renders the horizontal filter-chip strip (All / Витрати / Доходи /
 * Кредитна / per-cat) plus the trigger chips that open the category /
 * date-range / account picker bottom sheets. Pure presentational —
 * the parent owns chip data, active state, and sheet open setters.
 */
import { Pressable, Text, View } from "react-native";

import type { FilterChip } from "../types";

interface TransactionsFilterChipsProps {
  testID: string;
  chips: FilterChip[];
  activeFilterId: string;
  activeCategoryLabel: string | null;
  rangeLabel: string | null;
  hasRangeFilter: boolean;
  hasAccountFilter: boolean;
  selectedAccountCount: number;
  showAccountChip: boolean;
  onSelectFilter: (id: string) => void;
  onOpenCategorySheet: () => void;
  onOpenDateRangeSheet: () => void;
  onOpenAccountSheet: () => void;
}

export function TransactionsFilterChips({
  testID,
  chips,
  activeFilterId,
  activeCategoryLabel,
  rangeLabel,
  hasRangeFilter,
  hasAccountFilter,
  selectedAccountCount,
  showAccountChip,
  onSelectFilter,
  onOpenCategorySheet,
  onOpenDateRangeSheet,
  onOpenAccountSheet,
}: TransactionsFilterChipsProps) {
  return (
    <View className="flex-row flex-wrap gap-2" testID={`${testID}-filters`}>
      {chips.map((chip) => {
        const selected = activeFilterId === chip.id;
        return (
          <Pressable
            key={chip.id}
            onPress={() => onSelectFilter(chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`${testID}-filter-${chip.id}`}
            className={
              selected
                ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
                : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
            }
          >
            <Text
              className={
                selected
                  ? "text-white text-xs font-semibold"
                  : "text-fg text-xs font-medium"
              }
              numberOfLines={1}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={onOpenCategorySheet}
        accessibilityRole="button"
        accessibilityLabel="Фільтр по категорії"
        testID={`${testID}-filter-category`}
        className={
          activeCategoryLabel
            ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
            : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
        }
      >
        <Text
          className={
            activeCategoryLabel
              ? "text-white text-xs font-semibold"
              : "text-fg text-xs font-medium"
          }
          numberOfLines={1}
        >
          🏷 {activeCategoryLabel ?? "Категорія"}
        </Text>
      </Pressable>
      <Pressable
        onPress={onOpenDateRangeSheet}
        accessibilityRole="button"
        accessibilityLabel="Фільтр по даті"
        testID={`${testID}-filter-range`}
        className={
          hasRangeFilter
            ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
            : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
        }
      >
        <Text
          className={
            hasRangeFilter
              ? "text-white text-xs font-semibold"
              : "text-fg text-xs font-medium"
          }
        >
          📅 {rangeLabel ?? "Період"}
        </Text>
      </Pressable>
      {showAccountChip && (
        <Pressable
          onPress={onOpenAccountSheet}
          accessibilityRole="button"
          accessibilityLabel="Фільтр по рахунках"
          testID={`${testID}-filter-accounts`}
          className={
            hasAccountFilter
              ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
              : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
          }
        >
          <Text
            className={
              hasAccountFilter
                ? "text-white text-xs font-semibold"
                : "text-fg text-xs font-medium"
            }
          >
            🏦 Рахунки
            {selectedAccountCount > 0 ? ` · ${selectedAccountCount}` : ""}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
