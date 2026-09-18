/**
 * Finyk — module nav grid shown on Overview.
 *
 * Replaces the web `<ModuleBottomNav>` within the Finyk tab: because
 * we already have a global bottom tab bar, stacking another bottom nav
 * for in-module routing would be redundant. Instead Overview acts as
 * the module home and surfaces the four drill-down screens as a 2×2
 * card grid. Each card pushes the corresponding native Stack screen
 * via `expo-router`'s `router.push`.
 *
 * Kept as a dumb presentational component so `Overview` can wrap it in
 * pull-to-refresh / header content without having to re-implement the
 * grid.
 */
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { FINYK_PAGES } from "../constants";

type NavEntry = (typeof FINYK_PAGES)[number];

function NavCard({ entry }: { entry: NavEntry }) {
  const router = useRouter();
  const IconComponent = entry.Icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.label}. ${entry.description}`}
      testID={`finyk-nav-grid-${entry.id}`}
      onPress={() => router.push(entry.href as never)}
      className="flex-1 min-w-[46%] rounded-2xl border border-line bg-surface dark:bg-cream-800 p-4 active:opacity-80"
    >
      <View className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/40 items-center justify-center mb-2">
        <IconComponent size={22} color="#7c3aed" />
      </View>
      <Text className="text-sm font-semibold text-fg">{entry.label}</Text>
      <Text className="text-xs text-fg-muted mt-1" numberOfLines={2}>
        {entry.description}
      </Text>
    </Pressable>
  );
}

export function FinykNavGrid() {
  // Skip the Overview entry — it's the current screen.
  const entries = FINYK_PAGES.filter((p) => p.id !== "overview");
  return (
    <View className="flex-row flex-wrap gap-3">
      {entries.map((entry) => (
        <NavCard key={entry.id} entry={entry} />
      ))}
    </View>
  );
}
