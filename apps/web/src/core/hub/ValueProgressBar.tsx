/**
 * ValueProgressBar — pre-first-entry «value-promise» bar (FTUX S3.3a).
 *
 * Sits where `OnboardingProgress` used to sit (above the bento grid,
 * gated on `!hasRealEntry`) but replaces the generic «N/4 модулів»
 * counter with a per-module promise driven by the user's onboarding
 * goals: the bar reads back the budget / habit / weekly-target the
 * user just spelled out, so the «empty hub» moment carries explicit
 * intent instead of static guilt.
 *
 * For S3.3a we cover the two lowest-friction modules (routine + finyk)
 * — fizruk and nutrition land in S3.3b without changing the public
 * surface of this component.
 *
 * The component is intentionally _presentational_:
 *
 *   - It renders nothing when no goal applies to any active module.
 *   - It does not read `hasRealEntry` itself — the parent already
 *     handles the «hide after first real entry» gate where the
 *     generic `OnboardingProgress` was hidden.
 *   - It does not read storage directly. Goals come in as a prop so
 *     this same component can be swapped into a Storybook fixture or
 *     a tour replay without seeding localStorage.
 *
 * Progress is always 0 % pre-first-entry (the only state in which the
 * bar renders), so the bar visually communicates «here's your goal,
 * here's where you are» rather than acting as a live tracker. Once
 * the user logs their first real entry the parent unmounts the bar
 * and the per-module dashboard cards take over the live-tracking
 * job. Keeping that contract explicit lets us avoid wiring real
 * data sources (manual expenses + Mono cache + routine completions
 * across multiple keys) into the hub-render path until the data is
 * actually meaningful.
 */

import type { OnboardingGoals } from "@sergeant/shared";

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

const ROUTINE_TARGET_DAYS = 30;

const ROUTINE_HABIT_LABELS: Record<string, string> = {
  water: "Пити воду",
  exercise: "Зарядка",
  reading: "Читання",
  custom: "Своя звичка",
};

function formatThousand(uah: number): string {
  // 30000 → "30 000 ₴" — matches the slider label in the goals step
  // (`apps/web/src/core/onboarding/GoalsStep.tsx`).
  return `${uah.toLocaleString("uk-UA").replace(/,/g, " ")} ₴`;
}

interface BarData {
  testId: string;
  label: string;
  current: string;
  percent: number;
}

function buildBars(props: ValueProgressBarProps): BarData[] {
  const { activeModules, goals } = props;
  const active = new Set(activeModules);
  const bars: BarData[] = [];

  // Routine first — lowest-friction, matches FIRST_ACTION_PRIORITY.
  if (active.has("routine") && goals.routineFirstHabit) {
    const habitLabel =
      ROUTINE_HABIT_LABELS[goals.routineFirstHabit] ?? "Своя звичка";
    bars.push({
      testId: "value-progress-bar-routine",
      label: `Звичка «${habitLabel}»`,
      current: `0/${ROUTINE_TARGET_DAYS} днів`,
      percent: 0,
    });
  }

  if (active.has("finyk") && goals.finykBudget !== null) {
    bars.push({
      testId: "value-progress-bar-finyk",
      label: `Бюджет ${formatThousand(goals.finykBudget)}`,
      current: "Записано 0 ₴",
      percent: 0,
    });
  }

  return bars;
}

export function ValueProgressBar({
  activeModules,
  goals,
}: ValueProgressBarProps) {
  const bars = buildBars({ activeModules, goals });
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
 * Pure helper — exported for tests and for the hub render path that
 * needs to know «do we have any value-bar to show?» before deciding
 * whether to render the generic `OnboardingProgress` fallback.
 */
export function hasAnyValueBar(props: ValueProgressBarProps): boolean {
  return buildBars(props).length > 0;
}
