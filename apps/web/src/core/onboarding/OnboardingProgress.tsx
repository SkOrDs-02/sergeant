import { ProgressBar } from "@shared/components/ui";

/**
 * OnboardingProgress — slim activation progress bar shown above the bento
 * grid for users who have not yet recorded a first real entry. Replaces
 * the implicit "do all the modules" pressure with a single explicit
 * count so a user who picked 2 of 4 modules during onboarding sees a
 * 2/4 progress instead of perpetual «3 empty cards» guilt.
 */

interface OnboardingProgressProps {
  /**
   * Module ids the user has activated (e.g. via `vibePicks`). The
   * length of this list drives the progress bar; the contents are not
   * inspected, so callers can pass either user-active modules or
   * modules with at least one real entry depending on the surface.
   */
  activeModules: readonly string[];
  /**
   * Total module count that maps to "100% activated". Defaults to 4 to
   * mirror the bento-grid layout (finyk / fizruk / routine / nutrition).
   */
  totalModules?: number;
}

export function OnboardingProgress({
  activeModules,
  totalModules = 4,
}: OnboardingProgressProps) {
  const count = Math.min(activeModules.length, totalModules);

  return (
    <div className="flex items-center gap-3 px-1">
      <ProgressBar
        value={count}
        max={totalModules}
        size="sm"
        className="flex-1"
        aria-label={`Модулів увімкнено: ${count} з ${totalModules}`}
      />
      {/* Було «{count}/{totalModules} розділів» — на порожньому FTUX-хабі
          це читалося як «4/4, все зроблено», хоча жодного запису ще немає.
          Смуга показує, скільки модулів УВІМКНЕНО, а не скільки пройдено. */}
      <span className="text-style-caption text-muted whitespace-nowrap">
        Модулів увімкнено: {count} з {totalModules}
      </span>
    </div>
  );
}
