/**
 * `BodyTrendCard` — single card in the Fizruk Body dashboard that
 * wraps `TrendChart` with a small header + empty/collapsed states.
 *
 * Web counterpart: each `<MiniLineChart/>` inside a `<Card/>` in
 * `apps/web/src/modules/fizruk/pages/Body.tsx`. The mobile port reuses
 * the already-shipped `TrendChart` from `../progress` rather than
 * pulling in a second chart renderer.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildMeasurementSeries,
  type MeasurementFieldId,
  type MobileMeasurementEntry,
  type ProgressMeasurementInput,
} from "@sergeant/fizruk-domain/domain";

import { TrendChart } from "../progress/TrendChart";

const TREND_OPEN_KEY_PREFIX = "fizruk:body:trend-open:";

export interface BodyTrendCardProps {
  /** Card heading shown above the chart (e.g. "Динаміка ваги"). */
  title: string;
  /** Which measurement field to chart. */
  field: MeasurementFieldId;
  /** Stroke colour (hex / `rgb(…)`) — same contract as TrendChart. */
  strokeColor: string;
  /** Unit suffix for the latest-value header (`" кг"`, `"/5"`, …). */
  unit: string;
  /** Descriptive metric label for empty-state copy ("вагу", "сон"). */
  metricLabel: string;
  /** Raw newest-first entries from `useMeasurements()`. */
  entries: readonly MobileMeasurementEntry[];
  /** Window length (number of points to plot). Defaults to 8. */
  limit?: number;
  /** testID root; TrendChart adds `-chart` / `-empty` suffixes itself. */
  testID?: string;
}

/**
 * `MobileMeasurementEntry` is a structural subset of
 * `ProgressMeasurementInput` but does not declare the latter's open
 * index signature. Spreading through a plain object lets the trend
 * builder consume our entries without widening the persisted type.
 * Mirrors the same helper in `MeasurementsTrendCard`.
 */
function toProgressInputs(
  entries: readonly MobileMeasurementEntry[],
): ProgressMeasurementInput[] {
  return entries.map((e) => ({ ...e }));
}

const BodyTrendCardImpl = function BodyTrendCard({
  title,
  field,
  strokeColor,
  unit,
  metricLabel,
  entries,
  limit,
  testID,
}: BodyTrendCardProps) {
  const series = buildMeasurementSeries(
    toProgressInputs(entries),
    field,
    limit,
  );
  const rootTestID = testID ?? `fizruk-body-trend-${field}`;
  const storageKey = `${TREND_OPEN_KEY_PREFIX}${field}`;

  // Start collapsed so the Body screen reads as a compact list of
  // trends at first load — the user can expand any one to inspect the
  // chart. The choice is persisted in AsyncStorage per-field so it
  // survives app restarts, matching the web counterpart.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((v) => {
        if (!cancelled && v === "1") setOpen(true);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      AsyncStorage.setItem(storageKey, next ? "1" : "0").catch(() => {
        /* ignore */
      });
      return next;
    });
  }, [storageKey]);

  // When collapsed, show a latest-value + delta teaser next to the
  // title so the card still communicates the most important signal
  // without opening the chart. Uses the same logic as TrendChart.
  const validPoints = series
    .map((p) => (p.value != null ? Number(p.value) : null))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const latest =
    validPoints.length > 0 ? validPoints[validPoints.length - 1] : null;
  const first = validPoints.length > 0 ? validPoints[0] : null;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <View
      className="rounded-2xl bg-cream-50 border border-cream-200"
      testID={rootTestID}
      accessibilityLabel={`Динаміка: ${metricLabel}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Згорнути" : "Розгорнути"}: ${title}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        className="flex-row items-center gap-3 px-4 py-3"
        testID={`${rootTestID}-toggle`}
      >
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-fg">{title}</Text>
        </View>
        {latest != null ? (
          <View className="flex-row items-baseline gap-2 shrink-0">
            <Text className="text-sm font-semibold text-fg tabular-nums">
              {`${latest.toFixed(0)}${unit}`}
            </Text>
            {delta != null && delta !== 0 ? (
              <Text
                className={
                  delta > 0
                    ? "text-[11px] font-semibold text-amber-700 tabular-nums"
                    : "text-[11px] font-semibold text-emerald-700 tabular-nums"
                }
              >
                {`${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text
          className={`text-fg-muted ${open ? "rotate-180" : ""}`}
          accessibilityElementsHidden
        >
          ▾
        </Text>
      </Pressable>
      {open ? (
        <View className="px-4 pb-4">
          <View className="flex-row items-baseline justify-end mb-2">
            <Text className="text-[11px] text-fg-muted">
              {`останні ${limit ?? 8}`}
            </Text>
          </View>
          <TrendChart
            series={series}
            strokeColor={strokeColor}
            unit={unit}
            metricLabel={metricLabel}
            testIDPrefix={rootTestID}
          />
        </View>
      ) : null}
    </View>
  );
};

export const BodyTrendCard = memo(BodyTrendCardImpl);
