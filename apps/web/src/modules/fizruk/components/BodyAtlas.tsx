/**
 * Last validated: 2026-06-02
 * Status: Active
 */
import { useEffect, useMemo, useRef, useState } from "react";
import createBodyHighlighter from "body-highlighter";
import { cn } from "@shared/lib/ui/cn";
import { THEME_HEX } from "@shared/lib/ui/themeHex";

const STATUS_TO_FREQ: Record<string, number> = { yellow: 1, red: 2 };

/** Human-readable Ukrainian labels for each body-highlighter muscle key. */
const MUSCLE_LABELS: Record<string, string> = {
  chest: "Грудні",
  "upper-back": "Верхня спина",
  "lower-back": "Нижня спина",
  trapezius: "Трапеція",
  biceps: "Біцепс",
  triceps: "Трицепс",
  forearm: "Передпліччя",
  "front-deltoids": "Передні дельти",
  "back-deltoids": "Задні дельти",
  abs: "Прес",
  obliques: "Косі м'язи",
  quadriceps: "Квадрицепс",
  hamstring: "Біцепс стегна",
  calves: "Литки",
  adductor: "Привідні",
  abductors: "Відвідні",
  gluteal: "Сідниці",
  neck: "Шия",
};

/** Muscles visible on the anterior (front) view. */
const ANTERIOR_MUSCLES = [
  "chest",
  "biceps",
  "triceps",
  "forearm",
  "front-deltoids",
  "abs",
  "obliques",
  "quadriceps",
  "calves",
  "adductor",
  "abductors",
  "neck",
] as const;

/** Muscles visible on the posterior (back) view. */
const POSTERIOR_MUSCLES = [
  "upper-back",
  "lower-back",
  "trapezius",
  "triceps",
  "forearm",
  "back-deltoids",
  "hamstring",
  "calves",
  "gluteal",
  "neck",
] as const;

/** Ukrainian status label shown in aria-label strings. */
const STATUS_LABELS: Record<string, string> = {
  green: "готовий",
  yellow: "відновлюється",
  red: "уникати",
};

function buildDataFromStatuses(
  statusByMuscle: Record<string, string> | null | undefined,
) {
  const out: Array<{ name: string; muscles: string[]; frequency: number }> = [];
  for (const [muscle, status] of Object.entries(statusByMuscle || {})) {
    const freq = STATUS_TO_FREQ[status as string];
    if (!freq) continue; // green = default bodyColor
    out.push({ name: muscle, muscles: [muscle], frequency: freq });
  }
  return out;
}

interface BodyHighlighterInstance {
  destroy?: () => void;
}
interface Selected {
  muscle: string;
  frequency?: number;
}

interface BodyAtlasProps {
  statusByMuscle: Record<string, string> | null | undefined;
  height?: number;
  showLegend?: boolean;
}

export function BodyAtlas({
  statusByMuscle,
  height = 320,
  showLegend = true,
}: BodyAtlasProps) {
  const [view, setView] = useState("anterior"); // anterior | posterior
  const [selected, setSelected] = useState<Selected | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<BodyHighlighterInstance | null>(null);

  const data = useMemo(
    () => buildDataFromStatuses(statusByMuscle),
    [statusByMuscle],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (instRef.current) {
      instRef.current.destroy?.();
      instRef.current = null;
    }
    const inst = createBodyHighlighter({
      container: containerRef.current,
      type: view as "anterior" | "posterior",
      data,
      // green as "ready" baseline
      bodyColor: THEME_HEX.success,
      highlightedColors: [THEME_HEX.warning, THEME_HEX.danger],
      // body-highlighter sometimes injects an SVG with its own height;
      // enforce scaling by constraining container and SVG.
      svgStyle: {
        width: "100%",
        height: "100%",
        maxHeight: "100%",
        display: "block",
      },
      style: { width: "100%", height: "100%" },
      onClick: ({ muscle, data: mdata }) => {
        setSelected({ muscle, ...mdata });
      },
    });
    instRef.current = inst;
    return () => {
      instRef.current?.destroy?.();
      instRef.current = null;
    };
  }, [view, data]);

  /** Muscles relevant to the current view, in render order. */
  const visibleMuscles =
    view === "anterior" ? ANTERIOR_MUSCLES : POSTERIOR_MUSCLES;

  function handleMuscleClick(muscle: string) {
    const freq = STATUS_TO_FREQ[statusByMuscle?.[muscle] ?? ""] ?? undefined;
    setSelected(freq !== undefined ? { muscle, frequency: freq } : { muscle });
  }

  function handleMuscleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    muscle: string,
  ) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleMuscleClick(muscle);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={view === "anterior"}
            aria-label="Вигляд спереду"
            className={cn(
              "text-xs px-3 min-h-[44px] min-w-[44px] rounded-full border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50",
              view === "anterior"
                ? "bg-text text-bg border-text"
                : "border-line text-subtle hover:text-text",
            )}
            onClick={() => setView("anterior")}
          >
            Спереду
          </button>
          <button
            type="button"
            aria-pressed={view === "posterior"}
            aria-label="Вигляд ззаду"
            className={cn(
              "text-xs px-3 min-h-[44px] min-w-[44px] rounded-full border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50",
              view === "posterior"
                ? "bg-text text-bg border-text"
                : "border-line text-subtle hover:text-text",
            )}
            onClick={() => setView("posterior")}
          >
            Ззаду
          </button>
        </div>
        {showLegend && (
          <div className="flex items-center gap-2 text-xs text-subtle">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" /> готово
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warning" /> норм
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-danger" /> рано
            </span>
          </div>
        )}
      </div>

      {/*
       * Keyboard-accessible muscle map container.
       *
       * body-highlighter renders SVG polygons imperatively via DOM
       * manipulation — they are pointer-only with no keyboard handling.
       * The sr-only <ul> below is a parallel keyboard path: every muscle
       * in the current view is Tab-reachable, activatable with Enter/Space,
       * and announces its name + recovery status via aria-label.
       *
       * Both paths share `setSelected` as the single source of truth.
       * The visual SVG is aria-hidden so screen-readers skip it and use
       * the parallel list instead.
       */}
      <div
        className="bg-bg border border-line rounded-2xl p-3"
        aria-label="Карта м'язів"
      >
        {/* Visual SVG body map — pointer-only, hidden from AT */}
        <div
          ref={containerRef}
          aria-hidden="true"
          className="w-full overflow-hidden"
          style={{ height, maxHeight: height }}
        />

        {/* Parallel keyboard-accessible muscle list (sr-only, NOT display:none) */}
        <ul className="sr-only" aria-label="Список м'язів">
          {visibleMuscles.map((muscle) => {
            const rawStatus = statusByMuscle?.[muscle] ?? "green";
            const statusLabel =
              STATUS_LABELS[rawStatus] ?? STATUS_LABELS["green"];
            const muscleName = MUSCLE_LABELS[muscle] ?? muscle;
            const isSelected = selected?.muscle === muscle;
            return (
              <li key={muscle}>
                <button
                  type="button"
                  aria-label={`${muscleName} — ${statusLabel}`}
                  aria-pressed={isSelected}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50"
                  onClick={() => handleMuscleClick(muscle)}
                  onKeyDown={(e) => handleMuscleKeyDown(e, muscle)}
                >
                  {muscleName}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <div className="text-xs text-subtle">
          Обрано:{" "}
          <span className="font-semibold text-muted">{selected.muscle}</span> ·
          разів:{" "}
          <span className="font-semibold text-muted">
            {selected.frequency || 0}
          </span>
        </div>
      )}
    </div>
  );
}
