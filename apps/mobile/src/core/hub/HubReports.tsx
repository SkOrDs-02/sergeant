/**
 * Sergeant Hub — cross-module reports (mobile).
 *
 * Mobile mirror of `apps/web/src/core/hub/HubReports.tsx`. Composes:
 *   - a week/month period selector with prev/next offset navigation
 *   - a weekly-digest slot (placeholder until H4 lands the real card)
 *   - four lazy per-domain report cards (Fitness / Expenses / Routine /
 *     Nutrition), each a self-contained chunk that reads its own MMKV
 *     shard and renders a skeleton while loading
 *   - a cross-module insights list
 *   - a Premium-gated PDF/HTML export action
 *
 * Day boundaries follow Europe/Kyiv semantics via `getPeriodRange`
 * (week = пн–нд). Money is kopiykas in storage, converted to hryvnia for
 * display inside the spending card.
 */

import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Download } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { useFlag } from "@/core/lib/featureFlags";

import { getPeriodRange, type Period } from "./reports/hubReports.aggregation";
import { generateInsights } from "./reports/insightsEngine";
import { exportReport } from "./reports/exportReport";

const FitnessCard = lazy(() => import("./reports/FitnessCard"));
const ExpensesCard = lazy(() => import("./reports/ExpensesCard"));
const RoutineCard = lazy(() => import("./reports/RoutineCard"));
const NutritionCard = lazy(() => import("./reports/NutritionCard"));

// PDF export is a Premium feature on web (`useFeatureGate`). Mobile has no
// billing surface yet, so we gate behind the existing feature-flag
// mechanism. TODO(billing): swap `useFlag` for the real entitlement gate
// (mirror of web `useFeatureGate("analytics-export-pdf")`) once mobile
// billing lands.
const EXPORT_FLAG_ID = "analytics-export-pdf";

function CardSkeleton() {
  return (
    <View
      className="h-14 items-center justify-center rounded-2xl border border-line bg-panel"
      accessibilityLabel="Завантаження секції"
    >
      <ActivityIndicator size="small" color="#78716c" />
    </View>
  );
}

const MONTHS_UK = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

const MONTHS_NOM = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;

function formatPeriodLabel(period: Period, offset: number): string {
  const { start, end } = getPeriodRange(period, offset);
  if (period === "week") {
    const s = `${start.getDate()} ${MONTHS_UK[start.getMonth()] ?? ""}`;
    const e = `${end.getDate()} ${MONTHS_UK[end.getMonth()] ?? ""}`;
    return `${s} – ${e}`;
  }
  return `${MONTHS_NOM[start.getMonth()] ?? ""} ${start.getFullYear()}`;
}

interface InsightCardProps {
  title: string;
  stat: string;
  detail?: string;
}

function InsightCard({ title, stat, detail }: InsightCardProps) {
  return (
    <View className="rounded-2xl border border-line bg-panel p-4">
      <Text className="text-sm leading-snug text-text">{title}</Text>
      <View className="mt-1 flex-row flex-wrap items-baseline gap-2">
        <Text className="text-lg font-extrabold text-brand-strong">{stat}</Text>
        {detail ? <Text className="text-xs text-muted">{detail}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Local weekly-digest placeholder. The real week-shaped digest card for
 * the Reports surface is built in parallel under H4.
 *
 * TODO(H4): swap for WeeklyDigestCard once it lands.
 */
function WeeklyDigestPlaceholder() {
  return (
    <View className="rounded-2xl border border-line bg-panel p-4">
      <SectionHeading size="xs" variant="muted">
        Звіт тижня
      </SectionHeading>
      <Text className="mt-1 text-xs leading-relaxed text-muted">
        AI-дайджест тижня зʼявиться тут найближчим часом.
      </Text>
    </View>
  );
}

export interface HubReportsProps {
  onClose?: () => void;
}

export function HubReports({ onClose }: HubReportsProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const exportEnabled = useFlag(EXPORT_FLAG_ID);

  const label = formatPeriodLabel(period, offset);
  const isCurrentPeriod = offset === 0;

  const insights = useMemo(() => generateInsights(), []);

  const handleClose = useCallback(() => {
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [onClose, router]);

  const handleExport = useCallback(() => {
    if (!exportEnabled) {
      // TODO(billing): open the Premium paywall instead of a no-op once
      // the mobile entitlement surface exists (web opens PaywallModal here).
      return;
    }
    setExporting(true);
    void exportReport({ title: "Sergeant — звіт", subtitle: label }).finally(
      () => setExporting(false),
    );
  }, [exportEnabled, label]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      className="flex-1 bg-bg"
      testID="hub-reports-screen"
    >
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <SectionHeading size="lg" variant="text">
          Звіти
        </SectionHeading>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрити"
          onPress={handleClose}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-xl"
        >
          <Text className="text-base text-muted">Готово</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row overflow-hidden rounded-xl border border-line">
            {(["week", "month"] as const).map((p) => {
              const active = period === p;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setPeriod(p);
                    setOffset(0);
                  }}
                  className={`px-3 py-1.5 ${active ? "bg-brand-strong" : ""}`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      active ? "text-white" : "text-muted"
                    }`}
                  >
                    {p === "week" ? "Тиждень" : "Місяць"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Попередній"
              onPress={() => setOffset((o) => o - 1)}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-xl"
            >
              <ChevronLeft size={16} color="#78716c" />
            </Pressable>
            <Text className="min-w-[110px] text-center text-xs text-muted">
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Наступний"
              accessibilityState={{ disabled: isCurrentPeriod }}
              disabled={isCurrentPeriod}
              onPress={() => setOffset((o) => Math.min(0, o + 1))}
              hitSlop={8}
              className={`h-8 w-8 items-center justify-center rounded-xl ${
                isCurrentPeriod ? "opacity-30" : ""
              }`}
            >
              <ChevronRight size={16} color="#78716c" />
            </Pressable>
          </View>
        </View>

        {/* The weekly digest is week-shaped, so it only renders in the
            «Тиждень» view — mirroring web. */}
        {period === "week" ? <WeeklyDigestPlaceholder /> : null}

        <View className="gap-3">
          <Suspense fallback={<CardSkeleton />}>
            <FitnessCard period={period} offset={offset} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <ExpensesCard period={period} offset={offset} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <RoutineCard period={period} offset={offset} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <NutritionCard period={period} offset={offset} />
          </Suspense>
        </View>

        {insights.length >= 1 ? (
          <View className="gap-3">
            <SectionHeading size="sm" variant="muted">
              Інсайти
            </SectionHeading>
            {insights.map((ins) => (
              <InsightCard
                key={ins.id}
                title={ins.title}
                stat={ins.stat}
                detail={ins.detail}
              />
            ))}
          </View>
        ) : (
          <View className="rounded-2xl border border-line bg-panel p-4">
            <Text className="text-center text-xs text-muted">
              Збери більше даних для інсайтів
            </Text>
          </View>
        )}

        <Button
          variant="secondary"
          onPress={handleExport}
          loading={exporting}
          leftIcon={<Download size={16} color="#1c1917" />}
          accessibilityLabel="Експортувати звіт"
        >
          Експортувати PDF
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

export default HubReports;
