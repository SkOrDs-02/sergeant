/**
 * Sergeant Finyk — date-range bottom sheet for the transactions feed.
 *
 * Holds two ISO-style `YYYY-MM-DD` text inputs (start / end). The
 * parent owns parsing into `startMs` / `endMs` and persists them via
 * `useFinykTxFilters`.
 */
import { Pressable, Text, TextInput, View } from "react-native";

import { Sheet } from "@/components/ui/Sheet";

import type { DraftRange } from "../types";

interface DateRangeFilterSheetProps {
  testID: string;
  open: boolean;
  draft: DraftRange;
  onChange: (next: DraftRange | ((prev: DraftRange) => DraftRange)) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function DateRangeFilterSheet({
  testID,
  open,
  draft,
  onChange,
  onApply,
  onClear,
  onClose,
}: DateRangeFilterSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Період"
      description="YYYY-MM-DD. Залиште поле порожнім, щоб не обмежувати."
      footer={
        <View className="flex-row gap-3">
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            testID={`${testID}-range-clear`}
            className="flex-1 h-11 rounded-xl bg-cream-100 items-center justify-center active:opacity-70"
          >
            <Text className="text-sm text-fg font-medium">Скинути</Text>
          </Pressable>
          <Pressable
            onPress={onApply}
            accessibilityRole="button"
            testID={`${testID}-range-apply`}
            className="flex-1 h-11 rounded-xl bg-brand-500 items-center justify-center active:opacity-80"
          >
            <Text className="text-sm text-white font-semibold">
              Застосувати
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="px-4 pb-4 gap-3" testID={`${testID}-range-sheet`}>
        <View>
          <Text className="text-xs text-fg-muted mb-1">Від</Text>
          <TextInput
            value={draft.start}
            onChangeText={(v) => onChange((r) => ({ ...r, start: v }))}
            placeholder="2026-04-01"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-cream-100 border border-cream-300 rounded-xl px-3 py-2.5 text-sm text-fg"
            testID={`${testID}-range-start`}
          />
        </View>
        <View>
          <Text className="text-xs text-fg-muted mb-1">До</Text>
          <TextInput
            value={draft.end}
            onChangeText={(v) => onChange((r) => ({ ...r, end: v }))}
            placeholder="2026-04-30"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-cream-100 border border-cream-300 rounded-xl px-3 py-2.5 text-sm text-fg"
            testID={`${testID}-range-end`}
          />
        </View>
      </View>
    </Sheet>
  );
}
