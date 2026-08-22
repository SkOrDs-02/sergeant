/**
 * `KpiRow` — dashboard KPI strip (streak / weekly volume / weight Δ).
 *
 * Purely presentational — the `DashboardKpis` payload is computed by
 * `@sergeant/fizruk-domain/domain/dashboard`'s `computeDashboardKpis`
 * so the aggregation stays platform-neutral and unit-tested.
 */

import type { DashboardKpis } from "@sergeant/fizruk-domain/domain";
import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

export interface KpiRowProps {
  kpis: DashboardKpis;
  testID?: string;
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  testID?: string;
  tone?: "default" | "positive" | "negative";
}

function Tile({ label, value, hint, testID, tone = "default" }: TileProps) {
  const toneClass =
    tone === "positive"
      ? "text-teal-700"
      : tone === "negative"
        ? "text-rose-600"
        : "text-fg";
  return (
    <Card
      variant="default"
      radius="lg"
      padding="md"
      className="flex-1"
      testID={testID}
    >
      <Text className="text-[10px] font-semibold text-fg-muted">{label}</Text>
      <Text className={`text-lg font-bold ${toneClass} mt-0.5`}>{value}</Text>
      {hint ? (
        <Text className="text-[10px] text-fg-muted mt-0.5">{hint}</Text>
      ) : null}
    </Card>
  );
}

function formatVolumeKg(kg: number): string {
  if (kg <= 0) return "0 кг";
  if (kg >= 1000) {
    const thousands = kg / 1000;
    const rounded =
      thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${rounded} т`;
  }
  return `${Math.round(kg)} кг`;
}

function formatWeightDelta(delta: number | null): {
  value: string;
  tone: "default" | "positive" | "negative";
} {
  if (delta == null) return { value: "—", tone: "default" };
  if (delta === 0) return { value: "0 кг", tone: "default" };
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const rounded = Math.round(abs * 10) / 10;
  return {
    value: `${sign}${rounded} кг`,
    tone: delta < 0 ? "positive" : "negative",
  };
}

function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} днів`;
  if (mod10 === 1) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} дні`;
  return `${n} днів`;
}

function pluralWorkouts(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} тренувань`;
  if (mod10 === 1) return `${n} тренування`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} тренування`;
  return `${n} тренувань`;
}

export function KpiRow({
  kpis,
  testID = "fizruk-dashboard-kpis",
}: KpiRowProps) {
  const streakLabel =
    kpis.streakDays > 0 ? pluralDays(kpis.streakDays) : "0 днів";
  const weeklyLabel = formatVolumeKg(kpis.weeklyVolumeKg);
  const weeklyHint = pluralWorkouts(kpis.weeklyWorkoutsCount);
  const delta = formatWeightDelta(kpis.weightChangeKg);

  return (
    <View className="flex-row gap-2" testID={testID}>
      <Tile
        label="Серія"
        value={streakLabel}
        hint={
          kpis.streakDays === 0
            ? "Сьогодні чи вчора: потрібне тренування"
            : "підряд"
        }
        testID={`${testID}-streak`}
      />
      <Tile
        label="Цей тиждень"
        value={weeklyLabel}
        hint={weeklyHint}
        testID={`${testID}-weekly`}
      />
      <Tile
        label={`Вага · ${kpis.weightWindowDays}д`}
        value={delta.value}
        hint={kpis.weightChangeKg == null ? "Додай заміри" : "дельта"}
        tone={delta.tone}
        testID={`${testID}-weight`}
      />
    </View>
  );
}

export default KpiRow;
