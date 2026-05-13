/**
 * Top input bar of HubSearch — mobile mirror of
 * `apps/web/src/core/hub/search/SearchInput.tsx`.
 *
 * Renders an RN `TextInput` with a leading search icon and a trailing
 * "Скасувати" affordance. Owns no state itself; the parent screen
 * drives the value.
 */

import { forwardRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { colors } from "@/theme";

export interface SearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}

// The launcher itself opens via an explicit user action (header Search
// button), so jumping focus into the input is the expected
// command-palette UX and not a focus trap — `useSearchEngine` calls
// `inputRef.current?.focus()` on mount instead of relying on the
// component prop so the a11y lint can stay strict elsewhere.
export const SearchInput = forwardRef<TextInput, SearchInputProps>(
  function SearchInput({ query, onQueryChange, onClose }, ref) {
    return (
      <View className="px-4 pt-4 pb-2 flex-row items-center gap-3 border-b border-line">
        <View className="flex-1 relative justify-center">
          <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
            <Search size={18} color={colors.textMuted} />
          </View>
          <TextInput
            ref={ref}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Шукати у Sergeant"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Глобальний пошук"
            accessibilityRole="search"
            testID="hub-search-input"
            className="h-11 pl-10 pr-10 rounded-2xl bg-panel-hi border border-line text-fg text-sm"
            style={{ color: colors.text }}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => onQueryChange("")}
              accessibilityRole="button"
              accessibilityLabel="Очистити запит"
              hitSlop={8}
              className="absolute right-3 top-0 bottom-0 justify-center"
              testID="hub-search-clear"
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрити пошук"
          hitSlop={8}
          testID="hub-search-cancel"
        >
          <Text className="text-sm text-fg-muted px-2 py-1">Скасувати</Text>
        </Pressable>
      </View>
    );
  },
);
