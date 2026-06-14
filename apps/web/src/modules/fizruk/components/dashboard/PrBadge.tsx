/**
 * Fizruk Dashboard — persistent PR badge (Phase 6.7).
 *
 * Mounts on the hero card at the top-right corner (mirroring where
 * Routine's `StreakFlame` lives on its hero) and surfaces the user's
 * most-recent personal record as a short pill: «PR · {вправа} ·
 * {вага} кг». Pure presentational — `usePrLatest` does the
 * derivation; this component just decides whether the result is
 * fresh enough to render and how to format the copy.
 *
 * Motion budget (Hard Rule #17): STATIC. The hero already owns the
 * AMBIENT slot via the decorative `--hero-grad-fizruk` overlay, so
 * the badge ships with only a one-shot `fade-in` on initial mount
 * (gated by `motion-safe:`) and zero pulse / shimmer / animation
 * loop afterwards.
 *
 * Hidden when `daysAgo > 14` so a stale month-old PR doesn't squat
 * on the hero. `usePrLatest` caps lookback at 30 days for the cache;
 * the additional 14-day display gate keeps the surface motivating.
 */

import { messages } from "@shared/i18n/uk";
import type { PrLatest } from "../../hooks/usePrLatest";

/**
 * Past which the badge is hidden — see file-level note. 14 days is a
 * "still recent" window; further out and the user has either had a
 * deload week, an injury, or a long gap, none of which is a
 * motivating message on the hero.
 */
const DISPLAY_WINDOW_DAYS = 14;

/**
 * Truncate exercise names to fit the compact pill. We aim for the
 * first word ("Жим") rather than a hard character slice ("Жим леж…")
 * because the head of every Sergeant strength label is the
 * meaningful movement; the tail is a qualifier ("лежачи", "стоячи").
 * Falls back to a character cap when there's no space (e.g. legacy
 * single-token names) so the badge never overflows the corner.
 */
function shortExerciseName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const firstWord = trimmed.split(/\s+/u, 1)[0] ?? trimmed;
  if (firstWord.length <= 10) return firstWord;
  return `${firstWord.slice(0, 9)}…`;
}

export interface PrBadgeProps {
  readonly pr: PrLatest | null;
}

/**
 * Renders nothing when the PR is missing or stale; otherwise emits a
 * compact soft-tone pill positioned absolutely at the top-right of
 * the hero card. The wrapper carries a 44×44 touch-target box (per
 * the design system's touch-target convention even for read-only
 * chrome) and `aria-hidden` because the badge is a decorative
 * summary — the underlying PR data is reachable through Progress.
 */
export function PrBadge({ pr }: PrBadgeProps) {
  if (!pr) return null;
  if (pr.daysAgo > DISPLAY_WINDOW_DAYS) return null;

  const exerciseShort = shortExerciseName(pr.exerciseName);
  // Round to one decimal so "82.5" stays exact but "80" doesn't show
  // a trailing ".0". Kopiykas-style: kg are the user-facing unit, the
  // decimal exists only when meaningful.
  const weightLabel = Number.isInteger(pr.weightKg)
    ? `${pr.weightKg}`
    : `${Math.round(pr.weightKg * 10) / 10}`;

  return (
    <div
      aria-hidden
      className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-end pointer-events-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
    >
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-xl border whitespace-nowrap bg-fizruk-soft text-fizruk-strong border-fizruk-ring/50 dark:bg-fizruk-surface-dark/15 dark:text-fizruk-300 dark:border-fizruk-border-dark/30 text-xs font-semibold">
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable={false}
        >
          {/* `award` glyph — Lucide-style trophy/medal substitute */}
          <circle cx={12} cy={8} r={6} />
          <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
        </svg>
        <span>
          PR · {exerciseShort} · {weightLabel} {messages.fizruk.kgUnit}
        </span>
      </span>
    </div>
  );
}
