/**
 * Fizruk / Atlas page (mobile) — Phase 6.
 *
 * The heavy lifting lives in `../components/BodyAtlas.tsx`; this page
 * renders a hero + `Card` + `BodyAtlas` driven by real recovery data
 * from `useRecovery`.
 */

import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";

import { BodyAtlas, type ActiveMuscle } from "../components/BodyAtlas";
import {
  BODY_ATLAS_MUSCLE_LABELS_UK,
  type BodyAtlasMuscleId,
} from "@sergeant/fizruk-domain/data/bodyAtlas";
import type { RecoveryStatus } from "@sergeant/fizruk-domain";

import { useRecovery } from "../hooks/useRecovery";

const STATUS_INTENSITY: Record<RecoveryStatus, number> = {
  green: 0.3,
  yellow: 0.65,
  red: 1.0,
};

export function Atlas() {
  const [selected, setSelected] = useState<BodyAtlasMuscleId | null>(null);
  const { by } = useRecovery();

  const muscles: ActiveMuscle[] = useMemo(() => {
    return Object.values(by)
      .filter((m) => m.lastAt != null)
      .map((m) => ({
        id: m.id as ActiveMuscle["id"],
        intensity: STATUS_INTENSITY[m.status] ?? 0.3,
      }));
  }, [by]);

  const selectedInfo = selected ? by[selected] : null;

  return (
    <SafeAreaView className="flex-1 bg-cream-50" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      >
        <View>
          <Text className="text-[22px] font-bold text-fg">
            {"Атлас мʼязів"}
          </Text>
          <Text className="text-sm text-fg-muted leading-snug">
            {
              "Інтерактивна карта груп мʼязів. Тапни зону, отримаєш назву та статус відновлення."
            }
          </Text>
        </View>

        <Card radius="lg" padding="md">
          <BodyAtlas
            muscles={muscles}
            onMusclePress={(id) => setSelected(id)}
            height={420}
          />
          <View className="mt-2 items-center">
            <Text className="text-xs text-fg-muted">
              {selected && selectedInfo
                ? `${BODY_ATLAS_MUSCLE_LABELS_UK[selected]} · ${selectedInfo.daysSince != null ? `${selectedInfo.daysSince}д тому` : "—"}`
                : selected
                  ? `Обрано: ${BODY_ATLAS_MUSCLE_LABELS_UK[selected]}`
                  : "Натисни на мʼяз, щоб побачити деталі."}
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

export default Atlas;
