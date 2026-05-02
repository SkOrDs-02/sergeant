/**
 * Sergeant Routine — HabitHeatmap (React Native).
 *
 * Mobile port of `apps/web/src/modules/routine/components/HabitHeatmap.tsx`
 * (~239 LOC). Renders a year-long matrix of habit-completion intensity
 * per day, Mon-first, ending with the week that contains `today`.
 *
 * Parity with web:
 *  - Same number of weeks (`HEATMAP_WEEKS = 53`) and same `HEATMAP_DAYS`
 *    ISO week layout.
 *  - Same intensity thresholds (`ratio < 0.34` → l1, `< 0.67` → l2,
 *    `>= 0.67` → l3) — the bucketing lives inside
 *    `@sergeant/routine-domain/domain/heatmap/grid.ts`, so it can't
 *    drift between platforms.
 *  - Same copy: «Активність за рік» section title, dual empty / details
 *    strips, short weekday labels on the Y axis.
 *
 * Intentional differences from web (see PR body):
 *  - Cells are SVG `<Rect>` elements rather than DOM buttons — RN has
 *    no `<button>` and wrapping hundreds of `Pressable` views is
 *    expensive. Tap targets are provided by a single `<Rect>` per cell
 *    with `onPress`; the whole grid is wrapped in a horizontal
 *    `ScrollView` because 53 weeks × 14 px cells (~742 px wide) don't
 *    fit on any phone viewport.
 *  - Colours are resolved to hex via `@sergeant/design-tokens/tokens`
 *    instead of Tailwind class-strings — SVG attributes can't accept
 *    className fills on react-native-svg, so the token table here is
 *    the mobile equivalent of `chartHeatmap.routine.levels` on web.
 *  - "Focus-visible" / "ring" styling is replaced by a slightly thicker
 *    stroke on today / selected cells (react-native-svg has no
 *    pseudo-selectors).
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { G, Rect } from "react-native-svg";

import {
  HEATMAP_DAYS,
  buildHeatmapGrid,
  type Habit,
  type HeatmapCell,
  type HeatmapIntensity,
  type RoutineState,
} from "@sergeant/routine-domain";

import { chartColors } from "@/theme";

/** Short ISO weekday labels (Mon-first). Blank cells keep the axis compact. */
const DAY_LABELS = ["Пн", "", "Ср", "", "Пт", "", "Нд"] as const;

/** Ukrainian abbreviated month names — `toLocaleDateString` isn't deterministic on RN. */
const MONTH_LABELS_UK = [
  "січ",
  "лют",
  "бер",
  "квіт",
  "трав",
  "черв",
  "лип",
  "серп",
  "вер",
  "жовт",
  "лист",
  "груд",
] as const;

const MONTH_NAMES_UK_FULL = [
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

const WEEKDAY_NAMES_UK_FULL = [
  "понеділок",
  "вівторок",
  "середа",
  "четвер",
  "п'ятниця",
  "субота",
  "неділя",
] as const;

/**
 * Intensity → hex fill. Uses centralized chartColors from theme
 * to maintain consistency with web and support future theming.
 */
const INTENSITY_FILL: Record<HeatmapIntensity, string> = {
  future: chartColors.routine.future,
  empty: chartColors.routine.empty,
  l1: chartColors.routine.l1,
  l2: chartColors.routine.l2,
  l3: chartColors.routine.l3,
};

/** Stroke colours for focus-visible / today / selected affordances. */
const STROKE_DEFAULT = "transparent";
const STROKE_TODAY = chartColors.routine.strokeToday;
const STROKE_SELECTED = chartColors.routine.strokeSelected;

/** Visual constants — tuned to match the web component's 12 px cells. */
const CELL_SIZE = 12;
const CELL_GAP = 2;
const WEEK_STRIDE = CELL_SIZE + CELL_GAP;
const DAY_STRIDE = CELL_SIZE + CELL_GAP;
const AXIS_HEIGHT = 14; // month label row
const LEGEND_ORDER: HeatmapIntensity[] = ["empty", "l1", "l2", "l3"];

export interface HabitHeatmapProps {
  habits: Habit[] | null | undefined;
  completions: RoutineState["completions"] | null | undefined;
  /** Injected in tests — defaults to `new Date()` in production. */
  today?: Date;
  /** Optional test-id prefix; per-cell ids are `${testID}-cell-${dateKey}`. */
  testID?: string;
}

function formatSelectedDate(cell: HeatmapCell): string {
  const weekdayName = WEEKDAY_NAMES_UK_FULL[cell.weekday] ?? "";
  const monthName = MONTH_NAMES_UK_FULL[cell.month] ?? "";
  return `${weekdayName}, ${cell.day} ${monthName} ${cell.year}`;
}

function formatSelectedStatus(cell: HeatmapCell): string {
  if (cell.isFuture) return "ще не настало";
  if (cell.total === 0) return "немає звичок";
  return `${cell.cnt} з ${cell.total} звичок виконано`;
}

/**
 * Reusable cell-level subcomponent — isolated so large grids don't
 * re-render every cell on every selection change.
 */
interface CellRectProps {
  cell: HeatmapCell;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (key: string) => void;
  testID?: string;
}

function CellRect({ cell, x, y, selected, onSelect, testID }: CellRectProps) {
  const fill = INTENSITY_FILL[cell.intensity];
  const stroke = selected
    ? STROKE_SELECTED
    : cell.isToday
      ? STROKE_TODAY
      : STROKE_DEFAULT;
  const strokeWidth = selected || cell.isToday ? 1.25 : 0;
  return (
    <Rect
      testID={testID}
      x={x}
      y={y}
      width={CELL_SIZE}
      height={CELL_SIZE}
      rx={2}
      ry={2}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={selected ? 0.7 : 1}
      onPress={() => onSelect(cell.dateKey)}
      accessibilityLabel={`${cell.dateKey}: ${cell.cnt} з ${cell.total} звичок`}
    />
  );
}

export function HabitHeatmap({
  habits,
  completions,
  today,
  testID = "habit-heatmap",
}: HabitHeatmapProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(
    () => buildHeatmapGrid(habits, completions, today ?? new Date()),
    [habits, completions, today],
  );

  const selectedCell = useMemo<HeatmapCell | null>(() => {
    if (!selected) return null;
    for (const week of grid.weeks) {
      for (const cell of week) {
        if (cell.dateKey === selected) return cell;
      }
    }
    return null;
  }, [selected, grid.weeks]);

  const handleSelect = (key: string) => {
    setSelected((prev) => (prev === key ? null : key));
  };

  const svgWidth = grid.weeks.length * WEEK_STRIDE;
  const svgHeight = AXIS_HEIGHT + HEATMAP_DAYS * DAY_STRIDE;

  return (
    <View
      testID={testID}
      className="rounded-2xl border border-cream-300 bg-cream-50 p-4"
    >
      <Text className="text-sm font-semibold text-fg mb-3">
        Активність за рік
      </Text>

      <View className="flex-row items-start">
        <View
          style={{
            paddingTop: AXIS_HEIGHT,
            marginRight: 4,
            gap: CELL_GAP,
          }}
        >
          {DAY_LABELS.map((lbl, i) => (
            <View
              key={i}
              style={{
                height: CELL_SIZE,
                justifyContent: "center",
              }}
            >
              <Text className="text-[8px] leading-[12px] text-fg-muted text-right pr-1">
                {lbl}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID={`${testID}-scroll`}
        >
          <Svg width={svgWidth} height={svgHeight} testID={`${testID}-grid`}>
            {grid.monthMarkers.map((marker) => (
              <G
                key={`${marker.year}-${marker.monthIdx}`}
                x={marker.weekIdx * WEEK_STRIDE}
                y={0}
              />
            ))}
            {grid.weeks.map((week, w) =>
              week.map((cell, d) => (
                <CellRect
                  key={cell.dateKey}
                  cell={cell}
                  x={w * WEEK_STRIDE}
                  y={AXIS_HEIGHT + d * DAY_STRIDE}
                  selected={cell.dateKey === selected}
                  onSelect={handleSelect}
                  testID={`${testID}-cell-${cell.dateKey}`}
                />
              )),
            )}
          </Svg>
        </ScrollView>
      </View>

      {/**
       * Month-label row — rendered as `Text` instead of SVG `<Text>` so
       * the NativeWind class hierarchy handles font sizing. Scrolls with
       * the grid via the shared horizontal ScrollView above? No — SVG is
       * inside the scroller but labels live outside. Keeping labels as a
       * compact legend below keeps layout stable across screen widths.
       */}
      <View className="flex-row flex-wrap gap-x-2 gap-y-1 mt-2 pl-6">
        {grid.monthMarkers.map((marker) => (
          <Text
            key={`${marker.year}-${marker.monthIdx}`}
            className="text-[10px] text-fg-muted"
            testID={`${testID}-month-${marker.year}-${marker.monthIdx}`}
          >
            {MONTH_LABELS_UK[marker.monthIdx]}
          </Text>
        ))}
      </View>

      {selectedCell ? (
        <View
          testID={`${testID}-details`}
          className="mt-3 flex-row items-center justify-between gap-2 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2"
        >
          <Text className="text-xs text-fg-muted flex-1" numberOfLines={1}>
            {formatSelectedDate(selectedCell)}
          </Text>
          <Text className="text-xs font-semibold text-fg">
            {formatSelectedStatus(selectedCell)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрити деталі дня"
            onPress={() => setSelected(null)}
            testID={`${testID}-details-close`}
            className="ml-1 px-2 py-1"
          >
            <Text className="text-xs font-bold text-fg-muted">✕</Text>
          </Pressable>
        </View>
      ) : (
        <View
          testID={`${testID}-legend`}
          className="mt-3 flex-row items-center gap-2"
        >
          <Text className="text-[10px] text-fg-muted">менше</Text>
          {LEGEND_ORDER.map((lvl) => (
            <View
              key={lvl}
              testID={`${testID}-legend-${lvl}`}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: INTENSITY_FILL[lvl],
              }}
            />
          ))}
          <Text className="text-[10px] text-fg-muted">більше</Text>
        </View>
      )}
    </View>
  );
}

export default HabitHeatmap;
