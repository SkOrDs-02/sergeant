/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { buildHeatmapGrid } from "@sergeant/routine-domain";
import { cn } from "@shared/lib/ui/cn";
import { useOutsideClick } from "@shared/hooks/useOutsideClick";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { chartHeatmap } from "@shared/charts";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import type { Habit, RoutineState } from "../lib/types";

const HISTORY_WEEKS = 53;
const FUTURE_WEEKS = 4;
const DAYS = 7;
const DAY_LABELS = ["Пн", "", "Ср", "", "Пт", "", "Нд"];
const HEATMAP = chartHeatmap.routine;

/**
 * Presentation view of a `@sergeant/routine-domain` heatmap cell: the
 * domain cell plus the `Date` instance the Ukrainian date/month labels
 * are formatted from. All counting math lives in `buildHeatmapGrid` —
 * this component owns rendering only.
 */
interface HeatmapCell {
  key: string;
  dt: Date;
  isFuture: boolean;
  isToday: boolean;
  cnt: number;
  total: number;
  ratio: number;
}

interface MonthMarker {
  weekIdx: number;
  label: string;
}

function cellBg(ratio: number, isFuture: boolean): string {
  if (isFuture) return HEATMAP.future;
  if (ratio === 0) return HEATMAP.levels[0];
  if (ratio < 0.34) return HEATMAP.levels[1];
  if (ratio < 0.67) return HEATMAP.levels[2];
  return HEATMAP.levels[3];
}

export interface HabitHeatmapProps {
  habits: Habit[] | null | undefined;
  completions: RoutineState["completions"] | null | undefined;
  /**
   * Скільки ISO-тижнів історії малювати. Дефолт — рік (`HISTORY_WEEKS`);
   * коротші вікна приходять із перемикача діапазону на сторінці статистики
   * (`lib/statsRanges.ts`).
   */
  historyWeeks?: number;
  /** Скільки тижнів look-ahead малювати після сьогоднішнього. */
  futureWeeks?: number;
  /** Як назвати вікно в підказці над сіткою — «рік», «3 місяці». */
  historyLabel?: string;
  /**
   * Підказка над сіткою. Дефолт згадує горизонтальний скрол — правда для
   * річного вікна, але НЕ для коротших: 13 тижнів вміщаються у ширину екрана
   * без скролера, і «гортай ліворуч» там просто неправда. Тому короткі вікна
   * передають свій рядок (`RoutineStatsRange.heatmapCaption`).
   */
  caption?: string;
}

export function HabitHeatmap({
  habits,
  completions,
  historyWeeks = HISTORY_WEEKS,
  futureWeeks = FUTURE_WEEKS,
  historyLabel = "рік",
  caption,
}: HabitHeatmapProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const didInitialScrollRef = useRef(false);

  useOutsideClick(rootRef, () => setSelected(null), {
    enabled: !!selected,
    events: ["pointerdown"],
    capture: true,
  });

  const { weeks, monthMarkers } = useMemo(() => {
    // Anchor "today" on Kyiv local calendar so the heatmap's "today" cell
    // doesn't drift to a different square when the user roams
    // (consolidated page-audit § Theme 1 — 09 F3). Construct as local-noon
    // of Kyiv-Y/M/D so the grid arithmetic inside `buildHeatmapGrid`
    // preserves the calendar day across host TZ.
    const { year, month, day } = getKyivDateParts();
    const today = new Date(year, month - 1, day, 12, 0, 0, 0);

    // AI-CONTEXT: знаменник за розкладом — ADR-0079 §3, стадія 3 Хвилі 1.
    // Раніше було `"active"`: кожна неархівна звичка рахувалась у знаменник
    // КОЖНОГО дня, тож звичка «Пн/Ср/Пт», виконана 3/3, давала 43%, а не
    // 100%. Тепер знаменник — дні, коли звичка була запланована, і хітмап
    // сходиться з `completionRateForRange` у модулі.
    //
    // `freezePausedPast` обовʼязковий у парі: без нього пауза, поставлена
    // сьогодні, вимила б звичку з усієї історії — ADR §3 прямо цього
    // забороняє. Вмикати `"scheduled"` без freeze не можна.
    //
    // Числа зросли одноразово, тому METRICS_VERSION піднято до 2.
    const grid = buildHeatmapGrid(habits, completions, today, historyWeeks, {
      futureWeeks,
      denominator: "scheduled",
      freezePausedPast: true,
    });

    const weeks: HeatmapCell[][] = grid.weeks.map((week) =>
      week.map((cell) => ({
        key: cell.key,
        // Same local-noon instant the grid keyed the cell from, rebuilt
        // for `toLocaleDateString` labelling.
        dt: new Date(cell.year, cell.month, cell.day, 12, 0, 0, 0),
        isFuture: cell.isFuture,
        isToday: cell.isToday,
        cnt: cell.cnt,
        total: cell.total,
        ratio: cell.ratio,
      })),
    );

    // Chronological, oldest→newest left-to-right. Today sits near the right
    // edge with a ~1-month look-ahead trailing after it, so the grid never
    // ends on a lone active-day square. The viewport opens scrolled to the
    // recent end (see the scroll effect below); the user scrolls left to reach
    // history — a natural timeline direction rather than a reversed jumble.
    const monthMarkers: MonthMarker[] = [];
    let previousMonth = "";
    weeks.forEach((week, weekIdx) => {
      const first = week[0];
      if (!first) return;
      const firstKyiv = getKyivDateParts(first.dt);
      const monthKey = `${firstKyiv.year}-${firstKyiv.month}`;
      if (monthKey === previousMonth) return;
      previousMonth = monthKey;
      monthMarkers.push({
        weekIdx,
        label: first.dt.toLocaleDateString("uk-UA", { month: "short" }),
      });
    });

    return { weeks, monthMarkers };
  }, [habits, completions, historyWeeks, futureWeeks]);

  // key → (w, d) lookup for O(1) arrow-key navigation
  const cellPositions = useMemo(() => {
    const map = new Map<string, { w: number; d: number }>();
    weeks.forEach((week, w) =>
      week.forEach((cell, d) => map.set(cell.key, { w, d })),
    );
    return map;
  }, [weeks]);

  // Roving tabIndex: most-recently focused > selected > today > most-recent
  // past cell. Anchoring the default tab stop on *today* (rather than the
  // first non-future cell ~52 weeks back) means a keyboard / screen-reader
  // user entering the year-long grid lands on the current day — announced
  // with the current year — instead of the oldest cell, whose aria-label
  // correctly reads a year behind and was misread as an off-by-year bug
  // (a11y QA, 2026-06-16). The historical cell labels are unchanged.
  const rovingKey = useMemo(() => {
    if (focusedKey && cellPositions.has(focusedKey)) return focusedKey;
    if (selected && cellPositions.has(selected)) return selected;
    let mostRecentPast: string | null = null;
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.isToday) return cell.key;
        if (!cell.isFuture) mostRecentPast = cell.key;
      }
    }
    return mostRecentPast ?? weeks[0]?.[0]?.key ?? null;
  }, [focusedKey, selected, weeks, cellPositions]);

  const handleClick = useCallback((key: string) => {
    setSelected((prev) => (prev === key ? null : key));
    setFocusedKey(key);
  }, []);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, key: string) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key))
        return;
      e.preventDefault();
      const pos = cellPositions.get(key);
      if (!pos) return;
      let { w, d } = pos;
      if (e.key === "ArrowRight") w = Math.min(w + 1, weeks.length - 1);
      else if (e.key === "ArrowLeft") w = Math.max(w - 1, 0);
      else if (e.key === "ArrowDown") d = Math.min(d + 1, DAYS - 1);
      else if (e.key === "ArrowUp") d = Math.max(d - 1, 0);
      const nextCell = weeks[w]?.[d];
      if (nextCell) {
        setFocusedKey(nextCell.key);
        cellRefs.current.get(nextCell.key)?.focus();
      }
    },
    [weeks, cellPositions],
  );

  const selectedCell = useMemo(() => {
    if (!selected) return null;
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.key === selected) return cell;
      }
    }
    return null;
  }, [selected, weeks]);
  const todayCell = useMemo(() => {
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.isToday) return cell;
      }
    }
    return null;
  }, [weeks]);
  const detailCell = selectedCell ?? todayCell;

  // Open the viewport scrolled to the recent end (today + look-ahead). The
  // scrollable width appears asynchronously — the grid lives inside a lazily
  // shown tab — so a plain mount effect races the layout. Watch for the first
  // non-zero overflow via ResizeObserver and scroll once. The one-time latch
  // lives in a ref (not a local const) so a `weeks` recompute never re-fires
  // the jump and yanks the user back from history they scrolled to.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const scrollToEnd = () => {
      if (didInitialScrollRef.current || vp.scrollWidth <= vp.clientWidth)
        return;
      vp.scrollLeft = vp.scrollWidth;
      didInitialScrollRef.current = true;
    };
    scrollToEnd();
    if (didInitialScrollRef.current || typeof ResizeObserver !== "function")
      return;
    const ro = new ResizeObserver(scrollToEnd);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [weeks]);

  return (
    <Card ref={rootRef} radius="lg">
      <SectionHeading as="p" size="xs" className="mb-3" variant="routine">
        Активність: сьогодні та історія
      </SectionHeading>

      <div className="mb-2 text-style-caption text-subtle">
        {caption ??
          `Відкривається на сьогодні, гортай ліворуч, щоб побачити історію за ${historyLabel}.`}
      </div>

      <div ref={viewportRef} className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex items-start">
          <div aria-hidden="true" className="flex flex-col gap-0.5 mr-1 pt-4">
            {/* AI-CONTEXT: визнаний виняток — chart axis tick. Row height
                (12px) mirrors the 12×12 heatmap cell + 2px gap it labels;
                the 12px typography floor (Hard Rule #16) doesn't apply to
                axis ticks, and bumping this to text-style-caption's 1.4
                line-height would overflow the fixed row and desync the
                weekday labels from their cell rows. */}
            {DAY_LABELS.map((lbl, i) => (
              <div
                key={i}
                className="h-3 leading-3 text-2xs text-subtle text-right pr-1 select-none"
              >
                {lbl}
              </div>
            ))}
          </div>

          <div
            role="group"
            aria-label={`Теплова карта активності за ${historyLabel}`}
            className="flex gap-0.5"
          >
            {weeks.map((week, w) => (
              <div key={w} className="flex flex-col gap-0.5">
                {/* AI-CONTEXT: визнаний виняток — chart axis tick, see above. */}
                <div
                  aria-hidden="true"
                  className="h-3.5 leading-[14px] text-2xs text-subtle whitespace-nowrap select-none"
                >
                  {monthMarkers.find((m) => m.weekIdx === w)?.label ?? ""}
                </div>
                {week.map((cell) => (
                  // Heatmap cells are intentionally 12×12 px to fit ~52 weeks
                  // (~365 days) in a single overview row. data-compact opts
                  // out of the global ≥44×44 touch-target safety-net; cells
                  // are activated via roving keyboard focus + clear focus
                  // outline, and the selection details are announced through
                  // the aria-live region below the grid.
                  <button
                    key={cell.key}
                    ref={(el) => {
                      if (el) cellRefs.current.set(cell.key, el);
                      else cellRefs.current.delete(cell.key);
                    }}
                    type="button"
                    data-compact
                    tabIndex={rovingKey === cell.key ? 0 : -1}
                    data-cell-key={cell.key}
                    onClick={() => handleClick(cell.key)}
                    onKeyDown={(e) => handleCellKeyDown(e, cell.key)}
                    aria-label={
                      cell.total === 0
                        ? `${cell.key}: нічого не заплановано`
                        : `${cell.key}: ${cell.cnt} з ${cell.total} запланованих`
                    }
                    aria-pressed={cell.key === selected}
                    data-today={cell.isToday ? "true" : undefined}
                    className={cn(
                      "w-3 h-3 shrink-0 rounded-sm transition-opacity focus-visible:outline focus-visible:outline-2",
                      HEATMAP.outline,
                      cellBg(cell.ratio, cell.isFuture),
                      cell.isToday && cn("ring-1", HEATMAP.ring),
                      cell.key === selected && "opacity-60",
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Persistent aria-live region: SR announces when a cell is selected */}
      <div aria-live="polite" aria-atomic="true" className="mt-3">
        {detailCell ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-style-caption">
            <span className="text-subtle truncate">
              {detailCell.dt.toLocaleDateString("uk-UA", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {detailCell.isToday ? " · сьогодні" : ""}
            </span>
            <span className="font-semibold text-text shrink-0">
              {detailCell.isFuture
                ? "ще не настало"
                : detailCell.total === 0
                  ? // Зі знаменником за розкладом нуль означає «цього дня
                    // нічого не було заплановано» — день відпочинку, а не
                    // відсутність звичок узагалі.
                    "нічого не заплановано"
                  : `${detailCell.cnt} з ${detailCell.total} запланованих виконано`}
            </span>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Легенда заповнення"
            className="flex items-center gap-2 text-style-caption text-subtle select-none"
          >
            <span>менше</span>
            {HEATMAP.levels.map((c, i) => (
              <span
                key={i}
                role="img"
                aria-label={`Рівень ${i + 1}`}
                className={cn(
                  "w-2.5 h-2.5 rounded-sm inline-block shrink-0",
                  c,
                )}
              />
            ))}
            <span>більше</span>
          </div>
        )}
      </div>
    </Card>
  );
}
