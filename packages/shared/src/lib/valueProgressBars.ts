/**
 * Value-progress bars — pure pre-first-entry «value-promise» logic
 * shared between web (`apps/web/src/core/hub/ValueProgressBar.tsx`)
 * and mobile (`apps/mobile/src/core/dashboard/ValueProgressBar.tsx`).
 *
 * The hub renders a per-module bar that reads back the budget /
 * habit / weekly-target the user spelled out in the wizard goals
 * step. Pre-first-entry the bar is always at 0 % — it visually
 * communicates «here's your goal, here's where you are» rather than
 * acting as a live tracker. After the first real entry the parent
 * unmounts the bar entirely and the per-module dashboard cards take
 * over the live-tracking job.
 *
 * Bar order mirrors the wizard goal-step order
 * (`routine → finyk → nutrition → fizruk`) so the user reads back
 * their commitments in the same sequence they spelled them out.
 *
 * Mirrors the FTUX S3.3 spec (`docs/launch/ftux-sprint-plan.md`):
 *   - S3.3a — finyk + routine bars.
 *   - S3.3b — nutrition + fizruk bars (extension without changing
 *     the public surface).
 *   - S3.3 mobile parity — RN port reusing this same shared helper.
 *
 * The helper is intentionally _presentational_:
 *   - It returns nothing when no goal applies to any active module.
 *   - It does not read `hasRealEntry` itself — the parent already
 *     handles the «hide after first real entry» gate.
 *   - It does not read storage directly. Goals come in as an
 *     argument so the same helper can be swapped into a Storybook
 *     fixture or a tour replay without seeding storage.
 */

import type { OnboardingGoals } from "./onboardingGoals";

const ROUTINE_TARGET_DAYS = 30;

const ROUTINE_HABIT_LABELS: Record<string, string> = {
  water: "Пити воду",
  exercise: "Зарядка",
  reading: "Читання",
  custom: "Своя звичка",
};

// Nutrition copy maps directly to the wizard's three goal options
// (`nutrition_goal` in `onboardingGoals.ts`). We intentionally
// describe the *outcome the user picked* in the label and the
// *daily-meal counter* in the `current` slot — the daily counter
// resets, the goal does not, so they can't share a surface without
// lying about progress.
const NUTRITION_GOAL_LABELS: Record<"lose" | "gain" | "maintain", string> = {
  lose: "Схуднути",
  gain: "Набрати масу",
  maintain: "Підтримка ваги",
};

function formatThousand(uah: number): string {
  // 30000 → "30 000 ₴" — matches the slider label in the goals step.
  return `${uah.toLocaleString("uk-UA").replace(/,/g, " ")} ₴`;
}

export interface ValueProgressBarData {
  /** Stable id used as `data-testid` (web) / `testID` (mobile). */
  testId: string;
  /** The outcome promise — what the user is buying. */
  label: string;
  /** Current position (counter, formatted). */
  current: string;
  /** 0–100, always 0 pre-first-entry. */
  percent: number;
}

export interface ValueProgressBarsInput {
  /**
   * Module ids the user has activated (e.g. via vibePicks). A bar
   * is included only when its module is in this list AND has a
   * non-null goal. Empty list → no bars.
   */
  activeModules: readonly string[];
  /** Goals payload from `getOnboardingGoals(store)`. */
  goals: OnboardingGoals;
}

/**
 * Build the ordered list of value-progress bars to render.
 *
 * Order mirrors the wizard goal-step order (and
 * `FIRST_ACTION_PRIORITY`) so the user reads back their
 * commitments in the same sequence they spelled them out.
 */
export function buildValueProgressBars(
  input: ValueProgressBarsInput,
): readonly ValueProgressBarData[] {
  const { activeModules, goals } = input;
  const active = new Set(activeModules);
  const bars: ValueProgressBarData[] = [];

  // Routine first — lowest-friction, matches FIRST_ACTION_PRIORITY.
  // Outcome-first frame (S6.6 / B-4): the *label* names what the
  // user is buying (an automatic habit after `ROUTINE_TARGET_DAYS`
  // подряд), not the mechanism («Серія днів», «Streak»). The
  // *current* slot is the position counter — kept terse so 0/N
  // reads as "where you are on the way to automatic" rather than
  // as a 0-streak shame indicator.
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

  // Nutrition before fizruk — the wizard surfaces nutrition first
  // when both goals exist, so the bar order mirrors the goal-step
  // order and the user reads back their commitments in the same
  // sequence they spelled them out.
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

/**
 * Pure helper — exported for callers that need to know «do we have
 * any value-bar to show?» before deciding whether to render the
 * generic `OnboardingProgress` fallback.
 */
export function hasAnyValueProgressBar(input: ValueProgressBarsInput): boolean {
  return buildValueProgressBars(input).length > 0;
}
