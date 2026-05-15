/**
 * CategoryChartSection — "Витрати за категоріями" horizontal bars.
 *
 * Mobile port of
 * `apps/web/src/modules/finyk/pages/overview/CategoryChartSection.tsx`
 * merged with the lazy `CategoryChart` component it wraps on web.
 *
 * The bars themselves are plain NativeWind `<View>`s rather than a
 * victory-native `<VictoryBar>` chart — we only need percentage-of-max
 * rows with a tappable label, which is cheaper as plain views and keeps
 * the mobile bundle free of chart overhead for this particular surface.
 * (NetworthSection still uses victory-native as planned by §6.7; the
 * category breakdown is presentation-identical to the web implementation
 * which also renders it via divs, not a Recharts component.)
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { chartPaletteList } from "@sergeant/design-tokens/tokens";

import { Card } from "../../../../components/ui/Card";

export interface CategorySpend {
  id: string;
  label: string;
  spent: number;
}

export interface CategoryChartSectionProps {
  catSpends: CategorySpend[];
  onNavigate?: (route: "transactions") => void;
  onCategoryClick?: (catId: string) => void;
}

const COLORS: readonly string[] = chartPaletteList;

function fmt(n: number): string {
  return n.toLocaleString("uk-UA");
}

const CategoryChartSectionImpl = function CategoryChartSection({
  catSpends,
  onNavigate,
  onCategoryClick,
}: CategoryChartSectionProps) {
  if (catSpends.length === 0) {
    return (
      <View className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-6 items-center">
        <Text className="text-sm font-semibold text-fg">Поки немає витрат</Text>
        <Text className="text-xs text-fg-muted mt-1 text-center">
          Цього місяця витрат за категоріями ще немає.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Переглянути операції"
          onPress={() => onNavigate?.("transactions")}
          className="mt-3 px-3 py-2 active:opacity-60"
        >
          <Text className="text-sm font-medium text-emerald-700">
            Переглянути операції
          </Text>
        </Pressable>
      </View>
    );
  }

  const top = catSpends.slice(0, 6);
  const maxVal = top[0]?.spent || 1;

  return (
    <Card radius="lg" padding="lg">
      <Text className="text-xs font-medium text-fg-muted mb-4">
        Витрати за категоріями
      </Text>
      <View className="gap-3">
        {top.map((cat, i) => {
          const widthPct = Math.round((cat.spent / maxVal) * 100);
          const color = COLORS[i % COLORS.length] ?? "#10b981";
          const Row = (
            <>
              <View className="flex-row justify-between mb-1.5">
                <Text
                  className="text-xs text-fg-muted flex-1 mr-2"
                  numberOfLines={1}
                >
                  {cat.label}
                </Text>
                <Text className="text-xs font-bold text-fg">
                  −{fmt(cat.spent)} ₴
                </Text>
              </View>
              <View className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, widthPct)}%`,
                    backgroundColor: color,
                  }}
                />
              </View>
            </>
          );
          return onCategoryClick ? (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityLabel={cat.label}
              onPress={() => {
                onCategoryClick(cat.id);
                onNavigate?.("transactions");
              }}
              className="active:opacity-70"
            >
              {Row}
            </Pressable>
          ) : (
            <View key={cat.id}>{Row}</View>
          );
        })}
      </View>
    </Card>
  );
};

export const CategoryChartSection = memo(CategoryChartSectionImpl);
