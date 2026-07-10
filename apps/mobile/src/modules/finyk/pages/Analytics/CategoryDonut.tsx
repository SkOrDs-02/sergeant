/**
 * CategoryDonut — donut chart + legend for the Analytics page.
 *
 * Mobile port of `apps/web/src/modules/finyk/components/analytics/
 * CategoryPieChart.tsx`. Mirrors the web geometry (outerR with an
 * `innerR = outerR * 0.62` hole, ≤5 slices + "Інше" bucket, 1° gap
 * between neighbours) but renders through `react-native-svg` instead
 * of the DOM — consistent with §6.7 of the RN migration plan
 * (`react-native-svg` is already in the mobile bundle via
 * victory-native and is used elsewhere, e.g. HabitHeatmap).
 *
 * Keeping the donut as plain `<Path>` filled sectors (rather than a
 * VictoryPie) matches the web implementation byte-for-byte and lets
 * us skip the layout overhead of victory-native for the small (160px)
 * chart this screen renders.
 *
 * When there are more than `TOP_N` categories, the legend renders a
 * «Показати всі / Згорнути» toggle below it. Collapsed view shows the
 * top N + an "Інше" bucket (default); expanded view replaces the
 * bucket with every category in `data` so the user can drill into the
 * long tail without leaving the screen.
 */
import { memo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

import type { TopCategory } from "@sergeant/finyk-domain/domain";

export interface CategoryDonutProps {
  data: readonly TopCategory[];
  size?: number;
}

// Convert a polar angle (0° = 12 o'clock, clockwise) to cartesian
// coordinates, same helper as the web donut.
function polarToXY(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const f2 = (v: number): string => v.toFixed(2);

// Closed donut-sector path: outer arc CW + line to inner + inner arc
// CCW + close. Full rings are drawn as two half-sweeps so the path is
// valid even at 360° (same safeguard as the web component).
function describeSector(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep >= 360) {
    const midDeg = startDeg + 180;
    const o1 = polarToXY(cx, cy, outerR, startDeg);
    const o2 = polarToXY(cx, cy, outerR, midDeg);
    const i1 = polarToXY(cx, cy, innerR, startDeg);
    const i2 = polarToXY(cx, cy, innerR, midDeg);
    return [
      `M ${f2(o1.x)} ${f2(o1.y)}`,
      `A ${outerR} ${outerR} 0 0 1 ${f2(o2.x)} ${f2(o2.y)}`,
      `A ${outerR} ${outerR} 0 0 1 ${f2(o1.x)} ${f2(o1.y)}`,
      `M ${f2(i1.x)} ${f2(i1.y)}`,
      `A ${innerR} ${innerR} 0 0 0 ${f2(i2.x)} ${f2(i2.y)}`,
      `A ${innerR} ${innerR} 0 0 0 ${f2(i1.x)} ${f2(i1.y)}`,
      "Z",
    ].join(" ");
  }
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarToXY(cx, cy, outerR, startDeg);
  const outerEnd = polarToXY(cx, cy, outerR, endDeg);
  const innerEnd = polarToXY(cx, cy, innerR, endDeg);
  const innerStart = polarToXY(cx, cy, innerR, startDeg);
  return [
    `M ${f2(outerStart.x)} ${f2(outerStart.y)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${f2(outerEnd.x)} ${f2(outerEnd.y)}`,
    `L ${f2(innerEnd.x)} ${f2(innerEnd.y)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${f2(innerStart.x)} ${f2(innerStart.y)}`,
    "Z",
  ].join(" ");
}

interface Arc {
  categoryId: string;
  label: string;
  spent: number;
  pct: number;
  color: string;
  start: number;
  end: number;
}

const TOP_N = 5;
const RENDER_MIN_SWEEP = 0.5;

function CategoryDonutComponent({ data, size = 160 }: CategoryDonutProps) {
  const [showAll, setShowAll] = useState(false);
  const hasOverflow = (data?.length ?? 0) > TOP_N;

  if (!data || data.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const innerR = outerR * 0.62;

  const total = data.reduce((s, d) => s + d.spent, 0);
  if (total === 0) return null;

  const expanded = showAll && hasOverflow;

  let segments: Omit<Arc, "start" | "end">[];
  if (expanded) {
    // Expanded legend replaces the "Інше" bucket with every category
    // from `data` (the selector caps this at 20 entries — see
    // `selectCategoryDistributionFromIndex`).
    segments = data.map((d) => ({ ...d }));
  } else {
    const top = data.slice(0, TOP_N);
    const otherSpent = data.slice(TOP_N).reduce((s, d) => s + d.spent, 0);
    const totalTopPct = top.reduce((s, d) => s + d.pct, 0);
    segments =
      otherSpent > 0
        ? [
            ...top,
            {
              categoryId: "_other",
              label: "Інше",
              spent: otherSpent,
              pct: Math.max(0, 100 - totalTopPct),
              color: "#94a3b8",
            },
          ]
        : top;
  }

  const arcs: Arc[] = segments.reduce<Arc[]>((list, seg, index) => {
    const start = index === 0 ? 0 : (list[index - 1]?.end ?? 0);
    const sweep = (seg.spent / total) * 360;
    return [...list, { ...seg, start, end: start + sweep }];
  }, []);

  const visible = arcs.filter((a) => a.end - a.start >= RENDER_MIN_SWEEP);
  const GAP_DEG = visible.length > 1 ? 1 : 0;

  return (
    <View className="w-full gap-3" testID="finyk-analytics-donut">
      <View className="flex-row items-center gap-4">
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          accessibilityLabel="Кругова діаграма категорій"
        >
          {arcs.map((arc, i) => {
            const sweep = arc.end - arc.start;
            if (sweep < RENDER_MIN_SWEEP) return null;
            const pad = Math.min(GAP_DEG / 2, sweep / 2 - 0.01);
            const d = describeSector(
              cx,
              cy,
              outerR,
              innerR,
              arc.start + pad,
              arc.end - pad,
            );
            return <Path key={arc.categoryId || i} d={d} fill={arc.color} />;
          })}
          <SvgText
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize="11"
            fill="#78716c"
            fontWeight="500"
          >
            Всього
          </SvgText>
          <SvgText
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="#1c1917"
          >
            {`${total.toLocaleString("uk-UA")} ₴`}
          </SvgText>
        </Svg>

        <View className="flex-1 gap-1.5 min-w-0">
          {arcs.map((arc) => (
            <View
              key={arc.categoryId}
              className="flex-row items-center gap-2"
              testID={`finyk-analytics-donut-row-${arc.categoryId}`}
            >
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: arc.color }}
              />
              <Text
                className="text-xs text-fg flex-1 min-w-0"
                numberOfLines={1}
              >
                {arc.label}
              </Text>
              <Text className="text-xs text-fg-muted tabular-nums">
                {arc.pct < 1 && arc.pct > 0 ? "<1" : arc.pct}%
              </Text>
              <Text className="text-xs font-medium text-fg tabular-nums">
                {arc.spent.toLocaleString("uk-UA")} ₴
              </Text>
            </View>
          ))}
        </View>
      </View>
      {hasOverflow ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? "Згорнути категорії" : "Показати всі категорії"
          }
          testID="finyk-analytics-donut-toggle"
          className="self-center px-3 py-1.5 rounded-full border border-cream-300 bg-cream-50 active:opacity-70"
        >
          <Text className="text-xs font-medium text-fg">
            {expanded ? "Згорнути ↑" : `Показати всі (${data.length}) ↓`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const CategoryDonut = memo(CategoryDonutComponent);
