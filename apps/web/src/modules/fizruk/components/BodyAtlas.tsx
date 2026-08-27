/**
 * Last validated: 2026-06-12
 * Status: Active
 */
import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { messages } from "@shared/i18n/uk";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import type { AtlasData, AtlasMuscleDatum } from "../lib/atlasData";
import { BodyAtlasSegGroup } from "./BodyAtlasSegGroup";
import { atlasHitStroke, fatiguePercent, heatColor } from "../lib/atlasHeat";
import { formatNumberUk } from "@sergeant/shared";

const t = messages.fizruk.atlas;

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

/**
 * Cold (unworked) muscles and silhouette fill with a theme-aware neutral
 * derived from design tokens — warm-gray on the cream theme, slate on ink.
 * Exposed as a CSS var so it flips with the active theme (no raw light/dark
 * hex pair). Muscle `<path>`s reference `NEUTRAL_BASE`; the SVG sets the var.
 */
const NEUTRAL_BASE = "var(--atlas-neutral)";
const NEUTRAL_VAR =
  "color-mix(in srgb, rgb(var(--c-muted)) 42%, rgb(var(--c-panel)))";
const SELECTED_STROKE = "rgb(var(--c-fg))";

/**
 * Vertical gloss stops that turn a flat fill into a sculpted, lit volume:
 * lightened top highlight → base → darkened bottom, plus a matching edge.
 *
 * Endpoints are var-backed (`--c-bg` / `--c-fg`), not literal `#ffffff`/
 * `#000000` — a static white/black mix reads as a fixed light-mode gloss
 * and goes muddy/blown-out on the ink (dark) surface. `--c-bg` (near-white
 * on cream, near-black on ink) and `--c-fg` (near-black on cream,
 * near-white on ink) invert together with the theme, so "top" and
 * "bottom" stay the lighter/darker edge of the sculpt in both themes
 * instead of a hardcoded light-mode-only highlight direction.
 */
function glossStops(base: string) {
  return {
    top: `color-mix(in srgb, ${base}, rgb(var(--c-bg)) 30%)`,
    mid: base,
    bottom: `color-mix(in srgb, ${base}, rgb(var(--c-fg)) 30%)`,
    stroke: `color-mix(in srgb, ${base}, rgb(var(--c-fg)) 42%)`,
  };
}

/** Substitute `{key}` placeholders in a catalog template string. */
function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/** Parse a `"x y x y …"` points string into coordinate pairs. */
function parsePts(s: string): Array<[number, number]> {
  const n = s.trim().split(/\s+/).map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n.length; i += 2)
    out.push([n[i] ?? 0, n[i + 1] ?? 0]);
  return out;
}

/**
 * Closed Catmull-Rom → cubic-bézier path. Runs the same atlas polygons through
 * a smoothing pass so the angular keyspace reads as anatomical muscle curves.
 */
function smoothPath(points: string): string {
  const pts = parsePts(points);
  const n = pts.length;
  if (n < 3) return `M ${pts.map((p) => p.join(" ")).join(" L ")} Z`;
  const at = (i: number): [number, number] => pts[((i % n) + n) % n] ?? [0, 0];
  const [sx, sy] = at(0);
  let d = `M ${sx.toFixed(2)} ${sy.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} `;
  }
  return `${d}Z`;
}

/**
 * Intensity for the active mode: fatigue / recency / normalised volume.
 *
 * AI-DANGER: `fatigue` приходить із `recoveryCompute` НЕ як частка 0..1, а
 * як накопичувальний бал і може перевищити одиницю. Насичення шкали живе в
 * `heatColor` (`../lib/atlasHeat`) — не «спрощуй» його назад до сирого
 * множення, інакше повернеться чорний мʼяз із QA 2026-08-23.
 */
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
    label: "Втома: бірюзовий – відновлено, кораловий – потребує відпочинку",
    left: "відновлено",
    right: "втомлено",
  },
  last: {
    label: "Давність: яскравіше – тренувалось нещодавно",
    left: "давно",
    right: "сьогодні",
  },
  volume: {
    label: "Обʼєм за 7 днів: яскравіше – більше навантаження",
    left: "0",
    right: "макс",
  },
};

const STATUS_PILL: Record<RecoveryStatus, { label: string; dot: string }> = {
  green: { label: "готовий до роботи", dot: "bg-success" },
  yellow: { label: "відновлюється", dot: "bg-warning" },
  red: { label: "потребує відпочинку", dot: "bg-danger" },
};

/**
 * Обгортає САМ силует у кнопку «відкрити повний атлас», коли колбек є.
 * Модульного рівня (а не вкладений у `BodyAtlas`) навмисно: вкладене
 * оголошення міняло б identity компонента щорендеру й перемонтовувало весь
 * SVG. Без колбека — прозорий фрагмент, тобто повна сторінка атласа лишається
 * рівно такою, як була.
 */
function SilhouetteTap({
  onOpenFull,
  children,
}: {
  onOpenFull?: (() => void) | undefined;
  children: ReactNode;
}) {
  if (!onOpenFull) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onOpenFull}
      aria-label={t.openFullLabel}
      className="block w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </button>
  );
}

interface BodyAtlasProps {
  data: AtlasData;
  /**
   * Compact preview (dashboard card): silhouette + legend + side toggle
   * only — no mode switch, no leader labels, no detail card.
   */
  compact?: boolean;
  /**
   * Compact-only: тап по САМОМУ силуету відкриває повний атлас.
   *
   * AI-DANGER: цей колбек мусить лишатись ТУТ, на рівні `<svg>`, а не на
   * обгортці всього компонента. До 2026-08-08 `RecoveryFocusCard` загортав
   * увесь `<BodyAtlas compact />` у власний `<button>` — разом із
   * перемикачем «Спереду/Ззаду». Виходила кнопка всередині кнопки
   * (невалідний HTML), і тап по «Ззаду» спершу гортав бік, а потім клік
   * спливав до обгортки й викидав людину на сторінку Атласа — гортати
   * мініатюру на місці було неможливо (скарга власника 2026-08-08).
   */
  onOpenFull?: (() => void) | undefined;
  /** Optional CTA: ask the coach for a session focused on a muscle. */
  onAskCoach?: (muscleLabel: string) => void;
}

export function BodyAtlas({
  data,
  compact = false,
  onOpenFull,
  onAskCoach,
}: BodyAtlasProps) {
  const uid = useId();
  const { announce } = useAnnounce();
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
    if (!d) return NEUTRAL_BASE;
    return heatColor(metricFor(d, mode, maxLoad)) ?? NEUTRAL_BASE;
  }

  function pickSide(next: BodyAtlasSide) {
    setSide(next);
    setSelected(null);
  }

  /**
   * Selecting a muscle on the silhouette has no native "selected" semantics
   * a screen reader announces on its own (defect #2, fizruk audit wave 2) —
   * `aria-pressed` covers the on-demand state check, but nothing narrates
   * the *change*. Mirrors the milestone-`announce()` pattern already used
   * by `RestTimerOverlay`.
   */
  function selectMuscle(id: BodyAtlasMuscleId) {
    setSelected(id);
    const d = data[id];
    const label = BODY_ATLAS_MUSCLE_LABELS_UK[id];
    const status = d ? STATUS_PILL[d.status].label : undefined;
    announce(
      status
        ? `${t.selectedPrefix} ${label}, ${status}`
        : `${t.selectedPrefix} ${label}`,
    );
  }

  const selectedDatum = selected ? data[selected] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <BodyAtlasSegGroup
            options={MODES}
            value={mode}
            onChange={setMode}
            ariaLabel="Режим карти мʼязів"
          />
        )}
        <div className="flex-1" />
        <BodyAtlasSegGroup
          options={SIDES}
          value={side}
          onChange={pickSide}
          ariaLabel="Бік тіла"
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "min-w-0 shrink rounded-2xl bg-bg p-3",
            compact
              ? "mx-auto max-w-[200px] basis-[200px]"
              : "max-w-[300px] basis-[300px]",
          )}
        >
          <div className="mb-1.5 flex items-center justify-center gap-2 text-style-caption text-subtle">
            <span>{LEGEND_COPY[mode].left}</span>
            <div className="flex h-1.5 w-28 overflow-hidden rounded-full">
              {Array.from({ length: 24 }, (_, i) => (
                <span
                  key={i}
                  className="flex-1"
                  style={{
                    background:
                      heatColor(Math.max(0.03, i / 23)) ?? NEUTRAL_BASE,
                  }}
                />
              ))}
            </div>
            <span>{LEGEND_COPY[mode].right}</span>
          </div>

          {/*
            No explicit `role="img"` here (fixed 2026-08-08, fizruk audit
            wave 2 defect #1): ARIA treats `img` as one of the roles whose
            descendants are forced presentational, so the `role="button"`
            muscles below became unreachable by keyboard/AT despite
            rendering fine visually and even resolving in jsdom queries
            (dom-testing-library doesn't emulate that AT-side pruning).
            `<svg>` already maps to `graphics-document` per SVG-AAM without
            an explicit role, which keeps an accessible name (via
            `aria-label` below) *and* exposes interactive descendants — the
            fix is strictly "remove the role", not add a different one.
          */}
          <SilhouetteTap onOpenFull={compact ? onOpenFull : undefined}>
            <svg
              viewBox={ATLAS_VIEWBOX}
              className="mx-auto block w-full max-w-[300px]"
              style={{ "--atlas-neutral": NEUTRAL_VAR } as CSSProperties}
              aria-label={fillVars(t.imageLabel, {
                view: side === "front" ? t.viewFront : t.viewBack,
              })}
            >
              <defs>
                {geometry.muscles.flatMap((m) => {
                  const g = glossStops(fillFor(m.id));
                  return m.polygons.map((_, i) => {
                    const gid = `${uid}-${side}-${m.id}-${i}`;
                    return (
                      <linearGradient
                        key={gid}
                        id={gid}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={g.top} />
                        <stop offset="38%" stopColor={g.mid} />
                        <stop offset="100%" stopColor={g.bottom} />
                      </linearGradient>
                    );
                  });
                })}
              </defs>

              {geometry.neutral.map((s) => (
                <path
                  key={s.id}
                  d={smoothPath(s.points)}
                  style={{
                    fill: NEUTRAL_BASE,
                    stroke: `color-mix(in srgb, ${NEUTRAL_BASE}, rgb(var(--c-fg)) 18%)`,
                    strokeWidth: 0.4,
                    strokeLinejoin: "round",
                  }}
                />
              ))}

              {/*
                ШАР ТАП-ЗОН (нижній). Кожна група отримує копію свого
                контуру з ПРОЗОРИМ широким штрихом і `pointer-events: all`.
                Це і є носій `role="button"`: його `getBoundingClientRect()`
                дорівнює контуру ПЛЮС штрих, тож група дотягується до
                підлоги 44×44 під `pointer: coarse`, а проміжок між
                половинами грудей (клік у центр bounding-box групи падав у
                голий `<svg>` і не робив нічого — браузерне QA 2026-08-23)
                перекривається розширенням.

                AI-DANGER: шар навмисно стоїть НИЖЧЕ видимих мʼязів, а не
                всередині них. Розширені зони сусідів перетинаються, і в SVG
                перекриття вирішує лише порядок малювання: якби ця копія
                лежала зверху, штрих групи, намальованої пізніше, забирав би
                кліки з ВИДИМОГО тіла сусіда (front-deltoids проти chest,
                abs проти obliques). Знизу вона ловить рівно промахи.
                Ширина штриха — `atlasHitStroke`: великі групи отримують
                лише слоп, малі — рівно стільки, скільки бракує до 28
                одиниць viewBox.
              */}
              {!compact &&
                geometry.muscles.map((m) => (
                  <g
                    key={`hit-${m.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={BODY_ATLAS_MUSCLE_LABELS_UK[m.id]}
                    aria-pressed={selected === m.id}
                    className={cn(
                      "cursor-pointer",
                      // Kill the browser default SVG focus outline (renders as a
                      // black bounding-box rect on the <g> when clicked); keep a
                      // tidy keyboard focus-visible cue by overriding the muscle
                      // edge stroke — на hit-контурі це дає рівно ту саму
                      // тонку обводку по силуету мʼяза, що й раніше.
                      "focus:outline-none",
                      "[&:focus-visible>path]:[stroke:rgb(var(--c-fg))]",
                      "[&:focus-visible>path]:[stroke-width:1px]",
                    )}
                    onClick={() => selectMuscle(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectMuscle(m.id);
                      }
                    }}
                  >
                    <title>{BODY_ATLAS_MUSCLE_LABELS_UK[m.id]}</title>
                    {m.polygons.map((p, i) => (
                      <path
                        key={i}
                        d={smoothPath(p)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={atlasHitStroke(m.polygons)}
                        strokeLinejoin="round"
                        pointerEvents="all"
                      />
                    ))}
                  </g>
                ))}

              {geometry.muscles.map((m) => {
                const isSel = selected === m.id;
                const edge = glossStops(fillFor(m.id)).stroke;
                return (
                  <g
                    key={m.id}
                    // Видимий шар — суто картинка для AT (імʼя, стан і
                    // клавіатура живуть на hit-шарі вище), але кліки він
                    // ловить сам: прямий тап по тілу мʼяза не має права
                    // дістатись розширеної зони сусіда під ним.
                    aria-hidden="true"
                    className={cn(!compact && "cursor-pointer")}
                    onClick={compact ? undefined : () => selectMuscle(m.id)}
                  >
                    <title>{BODY_ATLAS_MUSCLE_LABELS_UK[m.id]}</title>
                    {m.polygons.map((p, i) => (
                      <path
                        key={i}
                        d={smoothPath(p)}
                        className="[stroke:var(--atlas-edge)] [stroke-linejoin:round] [stroke-width:0.5]"
                        style={
                          {
                            fill: `url(#${uid}-${side}-${m.id}-${i})`,
                            "--atlas-edge": edge,
                          } as CSSProperties
                        }
                      />
                    ))}
                    {isSel &&
                      m.polygons.map((p, i) => (
                        <path
                          key={`sel-${i}`}
                          d={smoothPath(p)}
                          style={{
                            fill: "none",
                            stroke: SELECTED_STROKE,
                            strokeWidth: 1,
                            strokeLinejoin: "round",
                          }}
                        />
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
          </SilhouetteTap>
        </div>

        {!compact && (
          <div className="min-w-0 flex-1 basis-[260px]">
            <div className="rounded-2xl border border-line bg-bg p-4">
              {selected && selectedDatum ? (
                <SelectedCard
                  label={BODY_ATLAS_MUSCLE_LABELS_UK[selected]}
                  datum={selectedDatum}
                  onAskCoach={onAskCoach}
                />
              ) : (
                <>
                  <p className="text-style-label text-text">{t.emptyTitle}</p>
                  <p className="mt-1 text-style-caption text-subtle">
                    {t.emptyDescription}
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
        {/* AI-DANGER: `text-xs` тут — ГЕОМЕТРІЯ пігулки, не роль тексту.
            Падинг `px-2.5 py-1` підібраний під 12px із line-height 1rem;
            роль `text-style-caption` дає 1.4, тобто пігулка стала б вищою
            за сусідній рядок і поїхала б із базової лінії. Це і є справжня
            причина правила «рамка + падинг = не текст»: не рамка сама по
            собі, а те, що висота вузла вже узгоджена з чимось поруч.
            Пор. банер конфлікту в `WorkoutItemCard` — там роль ЗАСТОСОВАНА,
            бо line-height явно пришпилений `leading-snug`. */}
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
        <Stat label="Обʼєм 7д" value={formatNumberUk(datum.load7d)} />
        {/* Втома — накопичувальний бал, не частка: без насичення картка
            показувала «Втома 160%» (QA 2026-08-23). Стеля шкали одна і та
            сама для числа й для кольору — `fatiguePercent`/`heatColor`. */}
        <Stat label="Втома" value={`${fatiguePercent(datum.fatigue)}%`} />
      </div>

      {datum.exercises.length > 0 && (
        <>
          <p className="mb-1.5 text-style-caption text-subtle">
            Вправи на цю групу
          </p>
          <div className="flex flex-wrap gap-1.5">
            {datum.exercises.map((ex) => (
              <span
                key={ex}
                // AI-DANGER: та сама геометрія, що й у пігулці вище —
                // падинг узгоджений із 12px/1rem. Рамки немає, але
                // висота однаково зафіксована фоном і падингом.
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
          className="mt-3 min-h-[44px] rounded-full border border-line px-3 text-style-caption text-text transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50"
        >
          Підказати наступне тренування →
        </button>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <p className="text-style-caption text-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-medium text-text">{value}</p>
    </div>
  );
}
