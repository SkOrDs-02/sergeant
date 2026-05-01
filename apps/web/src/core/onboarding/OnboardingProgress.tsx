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
  // `Math.round` keeps the visible width snapped to whole percentages so
  // the transition lands cleanly on each step (0 / 25 / 50 / 75 / 100).
  const percent = Math.round((count / totalModules) * 100);

  return (
    <div
      className="flex items-center gap-3 px-1"
      role="progressbar"
      aria-valuenow={count}
      aria-valuemin={0}
      aria-valuemax={totalModules}
      aria-label={`Активовано ${count} з ${totalModules} модулів`}
    >
      <div className="flex-1 h-1.5 rounded-full bg-line/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-muted font-medium whitespace-nowrap">
        {count}/{totalModules} модулів
      </span>
    </div>
  );
}
