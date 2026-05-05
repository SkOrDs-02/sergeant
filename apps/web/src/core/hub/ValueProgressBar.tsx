/**
 * ValueProgressBar — pre-first-entry «value-promise» bar (FTUX S3.3a + S3.3b).
 *
 * Sits where `OnboardingProgress` used to sit (above the bento grid,
 * gated on `!hasRealEntry`) but replaces the generic «N/4 модулів»
 * counter with a per-module promise driven by the user's onboarding
 * goals: the bar reads back the budget / habit / weekly-target the
 * user just spelled out, so the «empty hub» moment carries explicit
 * intent instead of static guilt.
 *
 * The bar list is computed by `buildValueProgressBars` from
 * `@sergeant/shared` so web and mobile (S3.3 mobile parity) share
 * the exact same per-module copy and ordering. The component itself
 * is intentionally _presentational_:
 *
 *   - It renders nothing when no goal applies to any active module.
 *   - It does not read `hasRealEntry` itself — the parent already
 *     handles the «hide after first real entry» gate where the
 *     generic `OnboardingProgress` was hidden.
 *   - It does not read storage directly. Goals come in as a prop so
 *     this same component can be swapped into a Storybook fixture or
 *     a tour replay without seeding localStorage.
 */

import {
  buildValueProgressBars,
  hasAnyValueProgressBar,
  type OnboardingGoals,
  type ValueProgressBarsInput,
} from "@sergeant/shared";

interface ValueProgressBarProps {
  /**
   * Module ids the user has activated (e.g. via vibePicks). A bar
   * renders only when its module is in this list AND has a non-null
   * goal. Empty list → no bars render.
   */
  activeModules: readonly string[];
  /** Goals payload from `getOnboardingGoals(webKVStore)`. */
  goals: OnboardingGoals;
}

export function ValueProgressBar({
  activeModules,
  goals,
}: ValueProgressBarProps) {
  const bars = buildValueProgressBars({ activeModules, goals });
  if (bars.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="value-progress-bars"
      aria-label="Прогрес до твоїх цілей"
    >
      {bars.map((bar) => (
        <div
          key={bar.testId}
          data-testid={bar.testId}
          className="flex items-center gap-3 px-1"
          role="progressbar"
          aria-valuenow={bar.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${bar.label} — ${bar.current}`}
        >
          <div className="flex-1 h-1.5 rounded-full bg-line/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${bar.percent}%` }}
            />
          </div>
          <span className="text-style-caption text-muted whitespace-nowrap">
            <span className="font-medium text-text">{bar.label}</span>
            <span className="mx-1.5 text-line">·</span>
            <span>{bar.current}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Re-export of the shared helper under the call-site's preferred
 * name. The web `HubDashboard` reads back as `hasAnyValueBar(...)`
 * and we keep that import surface stable across the refactor.
 */
export function hasAnyValueBar(props: ValueProgressBarsInput): boolean {
  return hasAnyValueProgressBar(props);
}
