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
 * For S3.3a we covered the two lowest-friction modules (routine +
 * finyk). S3.3b extends the same component to the remaining two
 * (fizruk + nutrition) without changing the public surface — the
 * call-site in `HubDashboard` keeps the original
 * `<ValueProgressBar activeModules goals/>` props.
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

// Nutrition copy maps directly to the wizard's three goal options
// (`packages/shared/src/lib/onboardingGoals.ts` — `nutrition_goal`).
// We intentionally describe the *outcome the user picked* in the
// label and the *daily-meal counter* in the `current` slot — the
// daily counter resets, the goal does not, so they can't share a
// surface without lying about progress.
const NUTRITION_GOAL_LABELS: Record<"lose" | "gain" | "maintain", string> = {
  lose: "Схуднути",
  gain: "Набрати масу",
  maintain: "Підтримка ваги",
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
  // Outcome-first frame (S6.6 / B-4): the *label* names what the user
  // is buying (an automatic habit after `ROUTINE_TARGET_DAYS` подряд),
  // not the mechanism («Серія днів», «Streak»). The *current* slot is
  // the position counter — kept terse so 0/N reads as "where you are
  // on the way to automatic" rather than as a 0-streak shame indicator.
  if (active.has("routine") && goals.routineFirstHabit) {
    const habitLabel =
      ROUTINE_HABIT_LABELS[goals.routineFirstHabit] ?? "Своя звичка";
    bars.push({
      testId: "value-progress-bar-routine",
      label: `«${habitLabel}» — через ${ROUTINE_TARGET_DAYS} днів автоматично`,
      current: `Зараз: 0/${ROUTINE_TARGET_DAYS}`,
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

  // Nutrition before fizruk — the wizard surfaces nutrition first when
  // both goals exist, so the bar order mirrors the goal-step order
  // and the user reads back their commitments in the same sequence
  // they spelled them out.
  if (active.has("nutrition") && goals.nutritionGoal !== null) {
    bars.push({
      testId: "value-progress-bar-nutrition",
      label: NUTRITION_GOAL_LABELS[goals.nutritionGoal],
      current: "0 страв сьогодні",
      percent: 0,
    });
  }

  if (active.has("fizruk") && goals.fizrukWeeklyGoal !== null) {
    const target = goals.fizrukWeeklyGoal;
    bars.push({
      testId: "value-progress-bar-fizruk",
      label: `${target}×/тиждень`,
      current: `0 з ${target}`,
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
