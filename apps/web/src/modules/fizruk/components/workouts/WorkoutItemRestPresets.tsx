/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";

export interface WorkoutItemRestPresetsProps {
  catLabel: string;
  defSec: number;
  quickOptions: number[];
  exerciseId: string | undefined;
  setRestTimer: (state: RestTimerState | null) => void;
  setDefaultForExercise?:
    ((exerciseId: string, sec: number) => void) | undefined;
}

/**
 * Per-item rest-timer quick-pick row (recommended duration + alternate
 * presets) rendered inside `WorkoutItemCard` for standalone (non-grouped)
 * strength items on an in-progress workout. Extracted out of the card to
 * keep it under the 600-line module cap (Hard Rule #18) — purely
 * presentational, every action flows through a prop.
 */
export function WorkoutItemRestPresets({
  catLabel,
  defSec,
  quickOptions,
  exerciseId,
  setRestTimer,
  setDefaultForExercise,
}: WorkoutItemRestPresetsProps) {
  const rt = messages.fizruk.restTimer;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-line">
      <div className="flex items-center justify-between w-full gap-1">
        <SectionHeading as="span" size="xs" variant="fizruk">
          {rt.presetsHeading}
        </SectionHeading>
        <span className="text-style-caption text-muted">
          {catLabel} · {rt.presetsRecommendedPrefix} {defSec}
          {rt.presetsSecondsShort}
        </span>
      </div>
      <button
        type="button"
        className="min-h-[44px] px-4 rounded-xl border-2 border-success bg-success/10 text-style-label text-success-strong dark:text-success hover:bg-success/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        onClick={() => setRestTimer({ remaining: defSec, total: defSec })}
        title={`${rt.presetsRecommendedTitle} ${catLabel.toLowerCase()}`}
      >
        {defSec} {rt.presetsSecondsShort}
      </button>
      {quickOptions.map((sec) => (
        <button
          key={sec}
          type="button"
          className="min-h-[44px] px-4 rounded-xl border border-line bg-panelHi text-sm text-text hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          onClick={() => {
            if (exerciseId) {
              setDefaultForExercise?.(exerciseId, sec);
            }
            setRestTimer({ remaining: sec, total: sec });
          }}
          title={rt.presetsSaveDefaultTitle}
        >
          {sec} {rt.presetsSecondsShort}
        </button>
      ))}
    </div>
  );
}
