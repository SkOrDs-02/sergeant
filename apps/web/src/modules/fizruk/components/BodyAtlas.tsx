/**
 * Last validated: 2026-06-12
 * Status: Active
 */
import { useMemo, useState } from "react";
import {
  ATLAS_VIEWBOX,
  BODY_ATLAS_GEOMETRY,
  BODY_ATLAS_MUSCLE_LABELS_UK,
  atlasGroupCentroid,
  type BodyAtlasMuscleId,
  type BodyAtlasSide,
} from "@sergeant/fizruk-domain/data";
import type { RecoveryStatus } from "@sergeant/fizruk-domain";
import { cn } from "@shared/lib/ui/cn";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
import type { AtlasData, AtlasMuscleDatum } from "../lib/atlasData";

export type { AtlasMuscleDatum, AtlasData } from "../lib/atlasData";

type AtlasMode = "recovery" | "last" | "volume";

const MODES: Array<{ id: AtlasMode; label: string }> = [
  { id: "recovery", label: "Відновлення" },
  { id: "last", label: "Останнє" },
  { id: "volume", label: "Обʼєм 7д" },
];

const SIDES: Array<{ id: BodyAtlasSide; label: string }> = [
  { id: "front", label: "Спереду" },
  { id: "back", label: "Ззаду" },
];

const MUSCLE_NEUTRAL = "#cbc7ba";
const SILHOUETTE_FILL = "#dad7cc";
const SELECTED_STROKE = "#5f5e5a";

/** Parse a `#rrggbb` string into an [r, g, b] tuple. */
function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const HEAT_LOW = toRgb(THEME_HEX.success);
const HEAT_MID = toRgb(THEME_HEX.warning);
const HEAT_HIGH = toRgb(THEME_HEX.danger);

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/**
 * Map an intensity 0..1 to a heat colour (success → warning → danger).
 * Returns `null` below a small floor so "cold" muscles keep the neutral
 * silhouette fill instead of a washed-out brand tint.
 */
function heatColor(t: number): string | null {
  if (t <= 0.02) return null;
  const from = t < 0.5 ? HEAT_LOW : HEAT_MID;
  const to = t < 0.5 ? HEAT_MID : HEAT_HIGH;
  const k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  return `#${[0, 1, 2]
    .map((i) =>
      mix(from[i] ?? 0, to[i] ?? 0, k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Intensity for the active mode: fatigue / recency / normalised volume. */
function metricFor(
  d: AtlasMuscleDatum,
  mode: AtlasMode,
  maxLoad: number,
): number {
  if (mode === "recovery") return d.fatigue;
  if (mode === "last")
    return d.daysSince == null ? 0 : Math.max(0, 1 - d.daysSince / 7);
  return maxLoad > 0 ? d.load7d / maxLoad : 0;
}

const LEGEND_COPY: Record<
  AtlasMode,
  { label: string; left: string; right: string }
> = {
  recovery: {
    label: "Втома: бірюзовий — відновлено, кораловий — потребує відпочинку",
    left: "відновлено",
    right: "втомлено",
  },
  last: {
    label: "Давність: яскравіше — тренувалось нещодавно",
    left: "давно",
    right: "сьогодні",
  },
  volume: {
    label: "Обʼєм за 7 днів: яскравіше — більше навантаження",
    left: "0",
    right: "макс",
  },
};

const STATUS_PILL: Record<RecoveryStatus, { label: string; dot: string }> = {
  green: { label: "готовий до роботи", dot: "bg-success" },
  yellow: { label: "відновлюється", dot: "bg-warning" },
  red: { label: "потребує відпочинку", dot: "bg-danger" },
};

interface BodyAtlasProps {
  data: AtlasData;
  /**
   * Compact preview (dashboard card): silhouette + legend + side toggle
   * only — no mode switch, no leader labels, no detail card.
   */
  compact?: boolean;
  /** Optional CTA: ask the coach for a session focused on a muscle. */
  onAskCoach?: (muscleLabel: string) => void;
}

export function BodyAtlas({
  data,
  compact = false,
  onAskCoach,
}: BodyAtlasProps) {
  const [side, setSide] = useState<BodyAtlasSide>("front");
  const [mode, setMode] = useState<AtlasMode>("recovery");
  const [selected, setSelected] = useState<BodyAtlasMuscleId | null>(null);

  const maxLoad = useMemo(() => {
    let max = 0;
    for (const d of Object.values(data))
      if (d && d.load7d > max) max = d.load7d;
    return max;
  }, [data]);

  const geometry = BODY_ATLAS_GEOMETRY[side];

  const centroids = useMemo(() => {
    const out = {} as Record<BodyAtlasMuscleId, [number, number]>;
    for (const m of geometry.muscles)
      out[m.id] = atlasGroupCentroid(m.polygons);
    return out;
  }, [geometry]);

  function fillFor(id: BodyAtlasMuscleId): string {
    const d = data[id];
    if (!d) return MUSCLE_NEUTRAL;
    return heatColor(metricFor(d, mode, maxLoad)) ?? MUSCLE_NEUTRAL;
  }

  function pickSide(next: BodyAtlasSide) {
    setSide(next);
    setSelected(null);
  }

  const selectedDatum = selected ? data[selected] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <SegGroup
            options={MODES}
            value={mode}
            onChange={setMode}
            ariaLabel="Режим карти м'язів"
          />
        )}
        <div className="flex-1" />
        <SegGroup
          options={SIDES}
          value={side}
          onChange={pickSide}
          ariaLabel="Бік тіла"
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "rounded-2xl bg-bg p-3",
            compact ? "mx-auto flex-[0_0_200px]" : "flex-[0_0_300px]",
          )}
        >
          <div className="mb-1.5 flex items-center justify-center gap-2 text-2xs text-subtle">
            <span>{LEGEND_COPY[mode].left}</span>
            <div className="flex h-1.5 w-28 overflow-hidden rounded-full">
              {Array.from({ length: 24 }, (_, i) => (
                <span
                  key={i}
                  className="flex-1"
                  style={{
                    background:
                      heatColor(Math.max(0.03, i / 23)) ?? MUSCLE_NEUTRAL,
                  }}
                />
              ))}
            </div>
            <span>{LEGEND_COPY[mode].right}</span>
          </div>

          <svg
            viewBox={ATLAS_VIEWBOX}
            className="mx-auto block w-full max-w-[300px]"
            role="img"
            aria-label={`Атлас м'язів, вигляд ${side === "front" ? "спереду" : "ззаду"}`}
          >
            {geometry.neutral.map((s) => (
              <polygon key={s.id} points={s.points} fill={SILHOUETTE_FILL} />
            ))}

            {geometry.muscles.map((m) => {
              const isSel = selected === m.id;
              const fill = fillFor(m.id);
              return (
                <g
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={BODY_ATLAS_MUSCLE_LABELS_UK[m.id]}
                  className={cn(
                    "cursor-pointer [&>polygon]:transition-colors",
                    // Kill the browser default SVG focus outline (renders as a
                    // black bounding-box rect on the <g> when clicked); keep a
                    // tidy keyboard focus-visible cue via the polygon stroke.
                    "focus:outline-none",
                    "[&:focus-visible>polygon]:stroke-line",
                    "[&:focus-visible>polygon]:[stroke-width:1px]",
                  )}
                  onClick={() => setSelected(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(m.id);
                    }
                  }}
                >
                  {m.polygons.map((p, i) => (
                    <polygon
                      key={i}
                      points={p}
                      style={{
                        fill,
                        stroke: isSel ? SELECTED_STROKE : "none",
                        strokeWidth: isSel ? 0.8 : 0,
                      }}
                    >
                      <title>{BODY_ATLAS_MUSCLE_LABELS_UK[m.id]}</title>
                    </polygon>
                  ))}
                </g>
              );
            })}

            {!compact &&
              geometry.labels.map((slot) => {
                const c = centroids[slot.id];
                if (!c) return null;
                const isL = slot.column === "L";
                const tx = isL ? -30 : 130;
                const elbow = isL ? -6 : 106;
                const isSel = selected === slot.id;
                return (
                  <g key={slot.id} aria-hidden="true">
                    <polyline
                      points={`${isL ? tx + 22 : tx - 22} ${slot.y} ${elbow} ${slot.y} ${c[0]} ${c[1]}`}
                      className="fill-none stroke-line"
                      strokeWidth={0.4}
                    />
                    <circle
                      cx={c[0]}
                      cy={c[1]}
                      r={0.9}
                      className="fill-subtle"
                    />
                    <text
                      x={tx}
                      y={slot.y + 2}
                      textAnchor={isL ? "start" : "end"}
                      fontSize={7.6}
                      className={cn(
                        "select-none",
                        isSel ? "fill-text font-medium" : "fill-subtle",
                      )}
                    >
                      {BODY_ATLAS_MUSCLE_LABELS_UK[slot.id]}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>

        {!compact && (
          <div className="min-w-[260px] flex-1">
            <div className="rounded-2xl border border-line bg-bg p-4">
              {selected && selectedDatum ? (
                <SelectedCard
                  label={BODY_ATLAS_MUSCLE_LABELS_UK[selected]}
                  datum={selectedDatum}
                  onAskCoach={onAskCoach}
                />
              ) : (
                <>
                  <p className="text-style-label text-text">Оберіть мʼяз</p>
                  <p className="mt-1 text-xs text-subtle">
                    Торкніться групи мʼязів або її назви — підсвітка покаже стан
                    і вправи.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SegOption<T extends string> {
  id: T;
  label: string;
}

function SegGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-full bg-bg p-0.5"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-[44px] rounded-full px-3 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50",
              on
                ? "bg-surface font-medium text-text"
                : "text-subtle hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectedCard({
  label,
  datum,
  onAskCoach,
}: {
  label: string;
  datum: AtlasMuscleDatum;
  onAskCoach?: ((muscleLabel: string) => void) | undefined;
}) {
  const pill = STATUS_PILL[datum.status];
  return (
    <>
      <div className="mb-1 flex items-center gap-2.5">
        <p className="text-base font-medium text-text">{label}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-text">
          <span className={cn("inline-block h-2 w-2 rounded-full", pill.dot)} />
          {pill.label}
        </span>
      </div>

      <div className="mb-3 mt-2 grid grid-cols-3 gap-2.5">
        <Stat
          label="Останнє"
          value={
            datum.daysSince == null
              ? "—"
              : datum.daysSince === 0
                ? "сьогодні"
                : `${datum.daysSince} дн.`
          }
        />
        <Stat label="Обʼєм 7д" value={datum.load7d.toLocaleString("uk-UA")} />
        <Stat label="Втома" value={`${Math.round(datum.fatigue * 100)}%`} />
      </div>

      {datum.exercises.length > 0 && (
        <>
          <p className="mb-1.5 text-xs text-subtle">Вправи на цю групу</p>
          <div className="flex flex-wrap gap-1.5">
            {datum.exercises.map((ex) => (
              <span
                key={ex}
                className="rounded-full bg-surface px-2.5 py-1 text-xs text-text"
              >
                {ex}
              </span>
            ))}
          </div>
        </>
      )}

      {onAskCoach && (
        <button
          type="button"
          onClick={() => onAskCoach(label)}
          className="mt-3 min-h-[44px] rounded-full border border-line px-3 text-xs text-text transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50"
        >
          Підказати наступне тренування →
        </button>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-2.5">
      <p className="text-2xs text-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-medium text-text">{value}</p>
    </div>
  );
}
