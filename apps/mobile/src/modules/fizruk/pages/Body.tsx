/**
 * Fizruk / Body page — mobile (Phase 6 · Body PR).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/pages/Body.tsx` (464 LOC).
 *
 * The web page owns both a summary dashboard and a full
 * "Записати сьогодні" input form backed by a parallel `useDailyLog`
 * store. On mobile the numeric input side of that story already lives
 * on the `Measurements` screen (see PR #470), so this port narrows
 * Body down to a **read-only dashboard** layered on top of the same
 * `useMeasurements()` hook:
 *
 *  - Header with CTA that opens the Measurements screen for full
 *    data entry (expo-haptics tap on press).
 *  - Grid of latest-value + 7-day delta tiles for the high-signal
 *    metrics (weight, sleep, energy, mood).
 *  - One trend card per metric that has at least one sample.
 *  - Empty-state card when the user has no measurements yet.
 *
 * All pure aggregation lives in
 * `@sergeant/fizruk-domain/domain/body` — this file is deliberately
 * thin so render tests cover the happy-path wiring only. The web
 * page's `PhotoProgress` section is out of scope for the RN port
 * (Phase 6 measurements are numeric-only, matching the
 * `Measurements` screen).
 *
 * Recovery section: `useRecovery` provides a compact summary of
 * muscle recovery status (ready / avoid lists), complementing the
 * full interactive atlas on the Atlas page.
 */
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RecoveryStatus } from "@sergeant/fizruk-domain";

import {
  BODY_SUMMARY_WINDOW_DAYS,
  buildBodySummariesWithWeightUnion,
  hasAnyMeasurementFor,
  selectBodyWeightSamples,
  toBodyWeightEntries,
  type MeasurementFieldId,
} from "@sergeant/fizruk-domain/domain";
import { hapticTap } from "@sergeant/shared";

import { BodySummaryCard, BodyTrendCard } from "../components/body";
import { useDailyLog } from "../hooks/useDailyLog";
import { useMeasurements } from "../hooks/useMeasurements";
import { useRecovery } from "../hooks/useRecovery";

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  green: "Відновлено",
  yellow: "Часткове",
  red: "Навантажено",
};

const STATUS_COLOR: Record<RecoveryStatus, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export interface BodyProps {
  /**
   * Called when the user taps the "Вимірювання" CTA. Route wiring
   * lives in the Expo Router entry file (`app/(tabs)/fizruk/body.tsx`)
   * so tests can pass a stub here.
   */
  onOpenMeasurements?: () => void;
  /** Optional testID root — sub-ids derive from it. */
  testID?: string;
}

const SUMMARY_FIELDS = [
  "weightKg",
  "sleepHours",
  "energyLevel",
  "mood",
] as const satisfies readonly MeasurementFieldId[];

interface SummaryMeta {
  readonly id: MeasurementFieldId;
  readonly label: string;
  readonly unit: string;
  readonly glyph: string;
  readonly fractionDigits: number;
  /** Direction considered "positive" for green-framing in the tile. */
  readonly positiveDirection: "up" | "down" | "flat";
}

const SUMMARY_META: Record<(typeof SUMMARY_FIELDS)[number], SummaryMeta> = {
  weightKg: {
    id: "weightKg",
    label: "Вага",
    unit: " кг",
    glyph: "⚖️",
    fractionDigits: 1,
    // Losing weight is framed as positive progress — mirrors the web
    // page's green-on-down, amber-on-up MiniLineChart delta colouring.
    positiveDirection: "down",
  },
  sleepHours: {
    id: "sleepHours",
    label: "Сон",
    unit: " год",
    glyph: "🌙",
    fractionDigits: 1,
    positiveDirection: "up",
  },
  energyLevel: {
    id: "energyLevel",
    label: "Енергія",
    unit: "/5",
    glyph: "⚡",
    fractionDigits: 0,
    positiveDirection: "up",
  },
  mood: {
    id: "mood",
    label: "Настрій",
    unit: "/5",
    glyph: "😊",
    fractionDigits: 0,
    positiveDirection: "up",
  },
};

interface TrendMeta {
  readonly field: MeasurementFieldId;
  readonly title: string;
  readonly metricLabel: string;
  readonly unit: string;
  readonly strokeColor: string;
}

const TREND_CARDS: readonly TrendMeta[] = [
  {
    field: "weightKg",
    title: "Динаміка ваги",
    metricLabel: "вагу",
    unit: " кг",
    strokeColor: "#16a34a",
  },
  {
    field: "sleepHours",
    title: "Сон",
    metricLabel: "сон",
    unit: " год",
    strokeColor: "#6366f1",
  },
  {
    field: "energyLevel",
    title: "Рівень енергії",
    metricLabel: "рівень енергії",
    unit: "/5",
    strokeColor: "#f59e0b",
  },
  {
    field: "mood",
    title: "Настрій",
    metricLabel: "настрій",
    unit: "/5",
    strokeColor: "#ec4899",
  },
];

export function Body({
  onOpenMeasurements,
  testID = "fizruk-body",
}: BodyProps = {}) {
  const { entries } = useMeasurements();
  // W1-WEIGHT-SOT стадія 1: цей екран читав тільки `fizruk_measurements`, тож
  // daily_log-історія ваги (web «Тіло», AI `log_weight`/`log_wellbeing`) сюди
  // не доходила — mobile Body показував інші числа, ніж web Body.
  const { entries: dailyLogEntries } = useDailyLog();
  const { ready, avoid, wellbeingMult } = useRecovery();

  const summaries = useMemo(
    () =>
      buildBodySummariesWithWeightUnion(
        dailyLogEntries,
        entries,
        SUMMARY_FIELDS,
        BODY_SUMMARY_WINDOW_DAYS,
      ),
    [dailyLogEntries, entries],
  );

  const handleOpenMeasurements = useCallback(() => {
    hapticTap();
    onOpenMeasurements?.();
  }, [onOpenMeasurements]);

  /**
   * Записи для трендів. Для ваги — union обох сховищ (див. коментар вище);
   * решта полів як і раніше читаються з `fizruk_measurements`.
   */
  const weightEntries = useMemo(
    () =>
      toBodyWeightEntries(selectBodyWeightSamples(dailyLogEntries, entries)),
    [dailyLogEntries, entries],
  );

  const hasAnyEntries = entries.length > 0 || weightEntries.length > 0;

  const visibleTrends = useMemo(
    () =>
      TREND_CARDS.filter((t) =>
        t.field === "weightKg"
          ? weightEntries.length > 0
          : hasAnyMeasurementFor(entries, t.field),
      ),
    [entries, weightEntries],
  );

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]" accessibilityElementsHidden>
          🫀
        </Text>
        <View className="flex-1">
          <Text className="text-[22px] font-bold text-fg">Тіло</Text>
          <Text className="text-xs text-fg-muted mt-0.5">
            Вага · сон · самопочуття
          </Text>
        </View>
        {onOpenMeasurements ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Перейти до вимірювань"
            onPress={handleOpenMeasurements}
            className="rounded-full bg-teal-600 px-3.5 py-2 active:opacity-80"
            testID={`${testID}-open-measurements`}
          >
            <Text className="text-[12px] font-semibold text-white">
              Вимірювання
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
      >
        {!hasAnyEntries ? (
          <View
            className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4 items-center"
            testID={`${testID}-empty`}
          >
            <Text className="text-sm font-semibold text-fg">Поки порожньо</Text>
            <Text className="text-xs text-fg-muted mt-1 text-center">
              Додай перший запис у розділі «Вимірювання», щоб побачити тут
              зведення й графіки.
            </Text>
            {onOpenMeasurements ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Відкрити екран вимірювань"
                onPress={handleOpenMeasurements}
                className="mt-3 rounded-full bg-teal-600 px-4 py-2 active:opacity-80"
                testID={`${testID}-empty-cta`}
              >
                <Text className="text-[12px] font-semibold text-white">
                  Додати перший замір
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View
              className="flex-row flex-wrap gap-3"
              testID={`${testID}-summary`}
            >
              {SUMMARY_FIELDS.map((field) => {
                const meta = SUMMARY_META[field];
                const summary = summaries[field];
                if (!summary) return null;
                return (
                  <BodySummaryCard
                    key={field}
                    label={meta.label}
                    unit={meta.unit}
                    glyph={meta.glyph}
                    summary={summary}
                    fractionDigits={meta.fractionDigits}
                    positiveDirection={meta.positiveDirection}
                    testID={`${testID}-summary-${field}`}
                  />
                );
              })}
            </View>

            {visibleTrends.length > 0 ? (
              <View className="gap-4" testID={`${testID}-trends`}>
                {visibleTrends.map((t) => (
                  <BodyTrendCard
                    key={t.field}
                    title={t.title}
                    field={t.field}
                    strokeColor={t.strokeColor}
                    unit={t.unit}
                    metricLabel={t.metricLabel}
                    entries={t.field === "weightKg" ? weightEntries : entries}
                    testID={`${testID}-trend-${t.field}`}
                  />
                ))}
              </View>
            ) : null}

            {ready.length > 0 || avoid.length > 0 ? (
              <View
                className="rounded-2xl bg-white p-4 gap-3"
                testID={`${testID}-recovery`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-fg">
                    Відновлення
                  </Text>
                  {wellbeingMult !== 1.0 ? (
                    <Text className="text-[11px] text-fg-muted">
                      {`самопочуття ×${wellbeingMult.toFixed(2)}`}
                    </Text>
                  ) : null}
                </View>
                {ready.length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs font-medium text-fg-muted">
                      Готові до тренування
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {ready.map((m) => (
                        <View
                          key={m.id}
                          className="flex-row items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5"
                        >
                          <View
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[m.status]}`}
                          />
                          <Text className="text-[11px] text-fg">{m.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {avoid.length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs font-medium text-fg-muted">
                      Потребують відпочинку
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {avoid.map((m) => (
                        <View
                          key={m.id}
                          className="flex-row items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5"
                        >
                          <View
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[m.status]}`}
                          />
                          <Text className="text-[11px] text-fg">
                            {`${m.label} · ${STATUS_LABEL[m.status]}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default Body;
