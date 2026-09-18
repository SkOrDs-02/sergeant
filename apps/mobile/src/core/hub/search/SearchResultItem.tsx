/**
 * Single search-hit row — mobile mirror of
 * `apps/web/src/core/hub/search/SearchResultItem.tsx`.
 *
 * Notes:
 *  - Uses `Pressable` instead of `<button>`. Hover doesn't exist on
 *    mobile, so the parent only highlights the "active" row when
 *    keyboard nav lands on it (a future RN external-keyboard story).
 *  - Renders the chevron via `lucide-react-native` instead of the
 *    inline SVG from web.
 */

import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "@/theme";

import type { Hit } from "./searchTypes";

const MODULE_CHIP: Record<Hit["module"], string> = {
  finyk: "bg-finyk-soft",
  fizruk: "bg-fizruk-soft",
  routine: "bg-routine-soft",
  nutrition: "bg-nutrition-soft",
  settings: "bg-panel-hi",
  assistant: "bg-brand-soft",
  actions: "bg-brand-soft",
  ai: "bg-brand-soft",
};

const MODULE_TEXT: Record<Hit["module"], string> = {
  finyk: "text-finyk-strong",
  fizruk: "text-fizruk-strong",
  routine: "text-routine-strong",
  nutrition: "text-nutrition-strong",
  settings: "text-fg-muted",
  assistant: "text-brand-strong",
  actions: "text-brand-strong",
  ai: "text-brand-strong",
};

export interface SearchResultItemProps {
  hit: Hit;
  index: number;
  active: boolean;
  onActivate: (hit: Hit) => void;
}

export function SearchResultItem({
  hit,
  index,
  active,
  onActivate,
}: SearchResultItemProps) {
  return (
    <Pressable
      onPress={() => onActivate(hit)}
      accessibilityRole="button"
      accessibilityLabel={`${hit.moduleLabel}: ${hit.title}`}
      accessibilityState={{ selected: active }}
      testID={`hub-search-hit-${hit.id}`}
      android_ripple={{ color: "rgba(0,0,0,0.05)" }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
      })}
      className={
        active
          ? "flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-panel-hi"
          : "flex-row items-center gap-3 px-3 py-2.5 rounded-xl"
      }
    >
      <View
        className={`w-8 h-8 rounded-xl items-center justify-center ${MODULE_CHIP[hit.module]}`}
      >
        <Text className={`text-sm ${MODULE_TEXT[hit.module]}`}>{hit.icon}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-fg" numberOfLines={1}>
          {hit.title}
        </Text>
        <Text className="text-xs text-fg-muted" numberOfLines={1}>
          {hit.subtitle}
        </Text>
      </View>
      <ChevronRight
        size={14}
        color={colors.textMuted}
        accessibilityIgnoresInvertColors
        testID={`hub-search-hit-${hit.id}-chevron`}
        // `index` exists for keyboard-nav scroll-into-view in a future
        // PR; reference it here so eslint doesn't yell about unused
        // props on the public interface.
        accessibilityHint={String(index)}
      />
    </Pressable>
  );
}
