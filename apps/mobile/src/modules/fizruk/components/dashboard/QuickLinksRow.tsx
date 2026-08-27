/**
 * `QuickLinksRow` — grid of secondary navigation links on the Fizruk
 * Dashboard. Each tile routes to a sibling page in the Fizruk stack.
 *
 * The component enumerates every non-dashboard Fizruk page
 * (`FIZRUK_PAGES`) except `exercise` (which is a detail screen reached
 * from Workouts / Atlas). Coverage is asserted by
 * `fizrukDashboardQuickLinkCoverage()` so the set stays in sync with
 * the router catalogue.
 */

import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

import {
  FIZRUK_PAGES,
  fizrukRouteFor,
  type FizrukPage,
} from "../../shell/fizrukRoute";

export interface QuickLinkTile {
  id: FizrukPage;
  title: string;
  subtitle: string;
  glyph: string;
}

export const QUICK_LINK_TILES: readonly QuickLinkTile[] = [
  {
    id: "workouts",
    title: "Тренування",
    subtitle: "Каталог + активна сесія",
    glyph: "💪",
  },
  {
    id: "plan",
    title: "План",
    subtitle: "Календар на місяць",
    glyph: "📅",
  },
  {
    id: "programs",
    title: "Програми",
    subtitle: "Готові тренувальні плани",
    glyph: "📋",
  },
  {
    id: "progress",
    title: "Прогрес",
    subtitle: "Графіки та бекапи",
    glyph: "📈",
  },
  {
    id: "measurements",
    title: "Вимірювання",
    subtitle: "Вага, обхвати, самопочуття",
    glyph: "⚖️",
  },
  {
    id: "body",
    title: "Тіло",
    subtitle: "Композиція та тренди",
    glyph: "🫀",
  },
  {
    id: "atlas",
    title: "Атлас",
    subtitle: "Карта груп мʼязів",
    glyph: "🗺️",
  },
] as const;

/**
 * Coverage guard — every `FizrukPage` except `dashboard` and
 * `exercise` (detail route, not a top-level tile) must appear exactly
 * once. Surfaced as a function so the Dashboard test can assert it at
 * run time instead of trusting the static list.
 */
export function fizrukDashboardQuickLinkCoverage(): {
  missing: readonly FizrukPage[];
  extras: readonly FizrukPage[];
} {
  const expected = new Set<FizrukPage>(
    FIZRUK_PAGES.filter((p) => p !== "dashboard" && p !== "exercise"),
  );
  const actual = new Set<FizrukPage>(QUICK_LINK_TILES.map((t) => t.id));
  const missing = [...expected].filter((id) => !actual.has(id));
  const extras = [...actual].filter((id) => !expected.has(id));
  return { missing, extras };
}

export interface QuickLinksRowProps {
  onNavigate: (page: FizrukPage, href: string) => void;
  testID?: string;
}

export function QuickLinksRow({
  onNavigate,
  testID = "fizruk-dashboard-quicklinks",
}: QuickLinksRowProps) {
  return (
    <View className="gap-2" testID={testID}>
      <Text className="text-sm font-semibold text-fg">Розділи</Text>
      <View className="flex-row flex-wrap -mx-1">
        {QUICK_LINK_TILES.map((tile) => (
          <View key={tile.id} className="w-1/2 px-1 mb-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${tile.title}: ${tile.subtitle}`}
              onPress={() => onNavigate(tile.id, fizrukRouteFor(tile.id))}
              testID={`${testID}-${tile.id}`}
            >
              {({ pressed }) => (
                <Card
                  variant="default"
                  radius="lg"
                  padding="md"
                  className={pressed ? "opacity-80" : ""}
                >
                  <Text className="text-2xl">{tile.glyph}</Text>
                  <Text className="text-sm font-semibold text-fg mt-1.5">
                    {tile.title}
                  </Text>
                  <Text className="text-[11px] text-fg-muted leading-snug">
                    {tile.subtitle}
                  </Text>
                </Card>
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

export default QuickLinksRow;
