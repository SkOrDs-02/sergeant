/** H: controls are neutral; hue is reserved for data and the hero. */
export const ROUTINE_THEME = {
  emptyStateWarm: "py-7 text-left",
  linkAccent: "font-semibold text-text underline underline-offset-2",
  chipOn: "border-text bg-panelHi text-text",
  chipOff: "border-line bg-transparent text-muted hover:text-text",
  dot: "bg-chart-routine",
  monthSel: "border-b-2 border-text text-text font-semibold",
  done: "border-text bg-text text-bg",
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
  WEEKLY_TARGET_CHOICES,
} from "@sergeant/routine-domain";
