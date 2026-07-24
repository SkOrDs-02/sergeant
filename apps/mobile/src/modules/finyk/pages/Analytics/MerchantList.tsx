/**
 * MerchantList — top-merchants list with horizontal progress bars.
 *
 * Mobile port of `apps/web/src/modules/finyk/components/analytics/
 * MerchantList.tsx`. Keeps the same visual grammar (rank + name + total
 * + "× count" + bar) but uses NativeWind + plain `<View>` bars rather
 * than CSS backgrounds.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import type { MerchantStat } from "@sergeant/finyk-domain/domain";

export interface MerchantListProps {
  merchants: readonly MerchantStat[];
}

function MerchantListComponent({ merchants }: MerchantListProps) {
  if (!merchants || merchants.length === 0) return null;

  const maxTotal = merchants[0]?.total || 1;

  return (
    <View className="gap-2" testID="finyk-analytics-merchants">
      {merchants.map((m, i) => {
        const barPct = Math.max(2, Math.round((m.total / maxTotal) * 100));
        return (
          <View key={m.name} className="flex-row items-center gap-3">
            <Text className="text-xs text-fg-muted w-4 text-right tabular-nums">
              {i + 1}
            </Text>
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center justify-between mb-0.5">
                <Text
                  className="text-sm text-fg flex-1 min-w-0 pr-2"
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
                <Text className="text-sm font-semibold tabular-nums text-fg">
                  {m.total.toLocaleString("uk-UA")} ₴
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                  <View
                    className="h-full bg-teal-700/70 rounded-full"
                    style={{ width: `${barPct}%` }}
                  />
                </View>
                <Text className="text-[10px] text-fg-muted">
                  {m.count} разів
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export const MerchantList = memo(MerchantListComponent);
