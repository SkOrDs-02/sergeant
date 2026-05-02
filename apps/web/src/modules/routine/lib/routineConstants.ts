/**
 * Sergeant Design System — Routine Module Theme Constants
 *
 * Soft & Organic aesthetic with coral accent.
 * Inspired by: Duolingo gamification, warm friendly feel
 */

export const ROUTINE_THEME = {
  // Text accents
  eyebrow: "text-routine-strong dark:text-routine",
  heroKicker: "text-routine-strong dark:text-routine",

  // Cards & surfaces
  statCard:
    "rounded-2xl bg-panel/80 border border-routine-soft-border/60 p-3 text-center shadow-card backdrop-blur-sm",
  statCardHighlight:
    "rounded-2xl bg-routine-surface/80 border border-routine-ring/50 dark:border-routine-border-dark/30 p-3 text-center shadow-card",

  // Empty state — Wave 1b: `border-routine-soft-border` +
  // `bg-routine-soft` are preset-owned, light/dark pair lives in
  // `--c-routine-soft*` (apps/web/src/index.css).
  emptyStateWarm:
    "rounded-2xl border border-routine-soft-border/60 bg-routine-soft/50 p-6 text-center shadow-card",

  // Links & accents
  linkAccent:
    "font-semibold text-routine-strong dark:text-routine hover:text-routine-hover underline decoration-routine-ring/60 dark:decoration-routine/50 transition-colors",

  // Habit list items — Wave 1b: `bg-routine-soft` carries both themes.
  habitRowAccent: "border-l-routine",
  habitRowDone: "border-l-routine bg-routine-soft/50",

  // Icon containers
  iconBox:
    "bg-routine-surface dark:bg-routine-surface-dark/10 border-coral-100 dark:border-routine-border-dark/30 text-routine-strong dark:text-routine",

  // Navigation
  navActive: "text-routine-strong dark:text-routine",
  navBar: "bg-routine",

  // Chips/pills
  chipOn:
    "border-routine-ring dark:border-routine-border-dark/40 bg-routine-surface dark:bg-routine-surface-dark/15 text-routine-strong dark:text-routine shadow-sm",
  chipOff:
    "border-line bg-panel text-muted hover:text-text hover:bg-panelHi transition-colors",

  // Calendar dots
  dot: "bg-routine",
  dotComplete: "bg-routine/80",

  // Month selector
  monthSel:
    "bg-routine-surface dark:bg-routine-surface-dark/15 border-routine-ring dark:border-routine-border-dark/40 ring-1 ring-coral-100/50 dark:ring-routine-border-dark/30",

  // Completion states
  done: "border-routine/45 bg-routine-surface dark:bg-routine-surface-dark/10 text-routine-strong dark:text-routine",
  doneCheck: "text-routine-strong dark:text-routine",

  // Primary button
  primary:
    "bg-routine-strong hover:bg-routine-hover text-white border-0 shadow-sm transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 active:scale-[0.98]",
  primarySoft:
    "bg-routine-surface hover:bg-coral-100 text-routine-strong dark:text-routine border border-routine-ring/50 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200",

  // Secondary/ghost
  secondary:
    "bg-panel hover:bg-panelHi text-text border border-line transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200",

  // Progress ring colors
  progressTrack: "text-routine-soft",
  progressFill: "text-routine-strong dark:text-routine",

  // Hero card gradient
  heroGradient: "bg-hero-coral",

  // Success animation colors
  successPulse: "rgba(249, 112, 102, 0.4)",
};

// Pure time-mode / recurrence / weekday constants moved into the
// `@sergeant/routine-domain` package (Phase 5 / PR 2). Re-exported here
// under the historical import path so existing web call-sites keep
// compiling unchanged. The Tailwind-class `ROUTINE_THEME` above stays
// in web because its class strings are tightly coupled to the web
// design-token layer.
export type {
  RecurrenceOption,
  RoutineTimeMode,
  RoutineTimeModeId,
} from "@sergeant/routine-domain";
export {
  RECURRENCE_OPTIONS,
  ROUTINE_TIME_MODES,
  WEEKDAY_LABELS,
} from "@sergeant/routine-domain";
