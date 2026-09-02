/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { Button } from "@shared/components/ui/Button";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
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
 * Compact per-item rest-timer control rendered inside `WorkoutItemCard`
 * for standalone (non-grouped) strength items on an in-progress
 * workout.
 *
 * Redesign 2026-08 (item 7): replaces the old always-expanded heading +
 * row of 3-4 preset chips — repeated in every card, the second-loudest
 * block on the pre-redesign screen — with ONE button. A tap starts the
 * recommended duration; the small chevron trigger opens the remaining
 * presets in a menu (tapping a menu option also saves it as the new
 * default for this exercise, same as before). Extracted out of the
 * card to keep it under the 600-line module cap (Hard Rule #18).
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

  const menuItems: DropdownMenuItem[] = quickOptions.map((sec) => ({
    type: "item",
    id: String(sec),
    label: `${sec} ${rt.presetsSecondsShort}`,
    onSelect: () => {
      if (exerciseId) setDefaultForExercise?.(exerciseId, sec);
      setRestTimer({ remaining: sec, total: sec });
    },
  }));

  return (
    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-line">
      <Button
        type="button"
        variant="soft"
        // SLOP-2 (аудит 2026-09): «рекомендований» пресет — це вибір, не
        // успіх; зелений тут конфліктував із модульним акцентом Фізрука.
        tone="fizruk"
        size="sm"
        className="flex-1 justify-start"
        onClick={() => setRestTimer({ remaining: defSec, total: defSec })}
        title={`${rt.presetsRecommendedTitle} ${catLabel.toLowerCase()}`}
      >
        <Icon name="clock" size={14} aria-hidden />
        {defSec} {rt.presetsSecondsShort}
      </Button>
      {menuItems.length > 0 && (
        <DropdownMenu
          ariaLabel={rt.presetsMenuAriaLabel}
          items={menuItems}
          trigger={
            <Button
              type="button"
              variant="outline"
              tone="neutral"
              size="sm"
              iconOnly
              aria-label={rt.presetsMenuTriggerAriaLabel}
              title={rt.presetsSaveDefaultTitle}
            >
              <Icon name="chevron-down" size={14} aria-hidden />
            </Button>
          }
        />
      )}
    </div>
  );
}
