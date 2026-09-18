/**
 * `RecentPRsSection` — bottom-of-dashboard list of top-N personal
 * records derived from the workout history via the pure
 * `computeTopPRs` selector in
 * `@sergeant/fizruk-domain/domain/dashboard`.
 */

import type { DashboardPRItem } from "@sergeant/fizruk-domain/domain";
import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

export interface RecentPRsSectionProps {
  prs: readonly DashboardPRItem[];
  testID?: string;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function RecentPRsSection({
  prs,
  testID = "fizruk-dashboard-prs",
}: RecentPRsSectionProps) {
  if (prs.length === 0) {
    return (
      <View className="gap-2" testID={testID}>
        <Text className="text-sm font-semibold text-fg">Рекорди</Text>
        <Card
          variant="default"
          radius="lg"
          padding="lg"
          className="items-center"
          testID={`${testID}-empty`}
        >
          <Text className="text-sm font-semibold text-fg">
            Поки без рекордів
          </Text>
          <Text className="text-xs text-fg-muted text-center mt-1">
            Запиши вагу й повторення у сетах, Dashboard підсвітить найкращі.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View className="gap-2" testID={testID}>
      <Text className="text-sm font-semibold text-fg">Рекорди</Text>
      <View className="gap-2">
        {prs.map((pr) => (
          <Card
            key={pr.exerciseId}
            variant="default"
            radius="lg"
            padding="md"
            testID={`${testID}-row-${pr.exerciseId}`}
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-fg"
                  numberOfLines={1}
                >
                  {pr.nameUk ?? pr.exerciseId}
                </Text>
                <Text className="text-[11px] text-fg-muted mt-0.5">
                  {pr.weightKg} × {pr.reps}
                  {pr.atIso ? ` · ${formatDateShort(pr.atIso)}` : ""}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-bold text-teal-700">
                  {pr.oneRmKg} кг
                </Text>
                <Text className="text-[10px] text-fg-muted">1ПМ</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

export default RecentPRsSection;
