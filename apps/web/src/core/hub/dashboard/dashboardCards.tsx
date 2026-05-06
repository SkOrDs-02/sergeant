import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { StreakBadge } from "@shared/components/ui/StreakFlame";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS, countRealEntries } from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../../observability/analytics";
import { getWeekRange } from "../../insights/useWeeklyDigest";
import { MODULE_CONFIGS, type ModuleId } from "./moduleConfigs";
import { localStorageStore } from "./dashboardStore";

const STREAK_MILESTONES = [7, 14, 21, 30, 60, 90, 100, 365] as const;

function highestMilestoneCrossed(
  current: number,
  previous: number,
): number | null {
  for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    const m = STREAK_MILESTONES[i];
    if (current >= m! && previous < m!) return m!;
  }
  return null;
}

const PILL_MODULES: ModuleId[] = ["finyk", "routine", "nutrition", "fizruk"];

// AI-CONTEXT: Pill numbers render as bold text on the cream `bg-panel`
// surface. The saturated `text-{module}` shades only clear ~2.4–3.1:1
// against cream; switch to the `-strong` companion in light mode and
// keep the saturated tone in dark mode where it clears AA on the
// charcoal panel. See docs/design/BRANDBOOK.md → "WCAG-AA `-strong` Tier".
const PILL_ACCENT: Record<ModuleId, string> = {
  finyk: "text-finyk-strong dark:text-finyk",
  fizruk: "text-fizruk-strong dark:text-fizruk",
  routine: "text-routine-strong dark:text-routine",
  nutrition: "text-nutrition-strong dark:text-nutrition",
};

/**
 * Horizontal pill strip ("Твій день") that surfaces the latest `main`
 * preview value per module — glanceable numbers without opening the
 * full bento card. Hidden entirely when no module has data.
 */
export function TodaySummaryStrip({
  onOpenModule,
}: {
  onOpenModule: (m: string) => void;
}) {
  const pills = useMemo(() => {
    return PILL_MODULES.map((id) => {
      const cfg = MODULE_CONFIGS[id];
      const preview = cfg.getPreview();
      return {
        id,
        label: cfg.label,
        main: preview.main,
        accent: PILL_ACCENT[id],
      };
    });
  }, []);

  const hasSomeData = pills.some((p) => p.main);
  if (!hasSomeData) return null;

  return (
    <div
      className="relative -mx-1 px-1"
      style={{
        maskImage: "linear-gradient(to right, black 85%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, black 85%, transparent 100%)",
      }}
    >
      <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        {pills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => onOpenModule(pill.id)}
            className={cn(
              "shrink-0 flex flex-col items-center rounded-2xl",
              "bg-panel border border-line px-3 py-2 min-w-[72px]",
              "transition-all active:scale-[0.97]",
              "hover:bg-panelHi hover:border-line",
            )}
          >
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                pill.main ? pill.accent : "text-subtle",
              )}
            >
              {pill.main || "\u2014"}
            </span>
            <span className="text-2xs text-muted font-medium mt-0.5">
              {pill.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Streak chip rendered above the hero card. Picks the longest active
 * streak across Routine and Fizruk (both must be ≥2 to render anything).
 *
 * Reads quick-stats from localStorage with a `safeReadLS` -> raw fallback
 * because legacy clients wrote bare JSON without our wrapper schema and
 * the safe wrapper would otherwise yield null and silently hide the chip.
 */
export function StreakIndicator() {
  const streak = useMemo(() => {
    const readLegacy = (key: string): Record<string, unknown> | null => {
      const raw = safeReadStringLS(key, null);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    };
    const routine =
      safeReadLS<Record<string, unknown>>(
        STORAGE_KEYS.ROUTINE_QUICK_STATS,
        null,
      ) || readLegacy("routine_quick_stats");
    const fizruk =
      safeReadLS<Record<string, unknown>>(
        STORAGE_KEYS.FIZRUK_QUICK_STATS,
        null,
      ) || readLegacy("fizruk_quick_stats");

    const streaks = [
      { days: Number(routine?.streak) || 0 },
      { days: Number(fizruk?.streak) || 0 },
    ]
      .filter((s) => s.days >= 2)
      .sort((a, b) => b.days - a.days);

    return streaks[0]?.days ?? 0;
  }, []);

  // Detect streak-milestone crossings on the hub itself rather than
  // inside the (currently unused) `<StreakCelebration>` modal — that
  // way the funnel sees `streak_milestone_reached` even when the
  // celebration UI hasn't been wired into the dashboard yet. We seed
  // `previousStreakRef` to `streak` on first mount so a returning user
  // who already crossed a milestone doesn't get double-tracked.
  const previousStreakRef = useRef<number | null>(null);
  useEffect(() => {
    if (previousStreakRef.current === null) {
      previousStreakRef.current = streak;
      return;
    }
    const previous = previousStreakRef.current;
    if (streak <= previous) {
      previousStreakRef.current = streak;
      return;
    }
    const crossed = highestMilestoneCrossed(streak, previous);
    if (crossed !== null) {
      trackEvent(ANALYTICS_EVENTS.STREAK_MILESTONE_REACHED, {
        days: crossed,
        // Hub renders a `<StreakBadge>` for every crossing; the modal
        // (`<StreakCelebration>`) is a separate UI path that isn't
        // mounted here yet. Keeping `type` on the payload lets PostHog
        // segment by surface once the modal lands without a payload-
        // shape change to chase.
        type: "toast" as const,
      });
    }
    previousStreakRef.current = streak;
  }, [streak]);

  if (streak < 2) return null;

  return (
    <StreakBadge streak={streak} label="днів поспіль" className="shadow-sm" />
  );
}

/**
 * Wraps a dashboard *group* in a fade-up animation. The hub uses three
 * stable groups — Hero / Modules / Insights — and each `index` maps to
 * a fixed delay (`index * 30ms`, capped at 150ms per Hard Rule #17)
 * instead of the per-element ramp we used before. Grouping keeps the
 * reveal under ~100ms for the three current groups so users don't see
 * a long staircase of fades on slower devices, and prevents the index
 * counter from drifting whenever a section toggles in or out.
 */
export function StaggerChild({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    // Hard Rule #17 (Animation budget): stagger ≤ 30 ms between children,
    // total delay cap ≤ 150 ms. Three fixed groups (Hero / Modules /
    // Insights) map to indices 0–2 → 0/30/60ms, so the cap rarely bites
    // — but keep the `Math.min` so any future fourth group still
    // respects the rule.
    animationDelay: `${Math.min(index * 30, 150)}ms`,
  };
  return (
    <div className="motion-safe:animate-stagger-in" style={style}>
      {children}
    </div>
  );
}

/**
 * Bottom-of-dashboard small-talk: counts real entries (across all modules)
 * and shows a "Вже N записів — продовжуй!" line once the user has at
 * least one real entry across any module. Returns `null` until then —
 * до першого real entry юзер бачить онбординг-нагадування / FirstAction
 * вгорі дашборду, і pre-emptive «Sergeant працює офлайн» внизу плутав
 * 'one-hero rule' — два полюси уваги до того, як з'явилась причина
 * святкувати. Реальний engagement-маркер живе вище (StreakIndicator).
 */
export function MotivationalFooter() {
  const entryCount = useMemo(() => countRealEntries(localStorageStore), []);

  if (entryCount === 0) return null;

  const message =
    entryCount === 1
      ? "Вже 1 запис \u2014 продовжуй!"
      : `Вже ${entryCount} записів \u2014 продовжуй!`;

  return <p className="text-xs text-subtle text-center py-8">{message}</p>;
}

/**
 * Compact "Звіт тижня" footer shown when a digest is fresh OR on Mon/Tue.
 * Tapping it expands the full `WeeklyDigestCard` inline.
 */
export function WeeklyDigestFooter({
  onExpand,
  fresh,
}: {
  onExpand: () => void;
  fresh: boolean;
}) {
  const weekRange = getWeekRange();
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Розгорнути звіт тижня"
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5",
        "shadow-card hover:shadow-float transition-[box-shadow,filter,opacity,transform]",
        "text-left",
      )}
    >
      <span
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
          "bg-linear-to-br from-brand-100 to-teal-100",
          "dark:from-brand-900/40 dark:to-teal-900/30",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-strong dark:text-brand"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </span>
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="flex items-center gap-1.5">
          <span className="text-style-label text-text">Звіт тижня</span>
          {fresh && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-primary"
              aria-label="Новий звіт"
            />
          )}
        </span>
        <span className="text-2xs text-muted truncate">{weekRange}</span>
      </span>
      <Icon
        name="chevron-right"
        size={14}
        strokeWidth={2.5}
        className="text-muted shrink-0"
      />
    </button>
  );
}
