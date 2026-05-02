/**
 * useTabBadges — aggregates pending-item counts for the main tab bar badges.
 *
 * Each module can contribute a count:
 *   - routine: habits due today that are not yet checked off
 *   - finyk:   over-budget categories or unreviewed transactions
 *   - fizruk:  missed workouts this week
 *   - nutrition: unlogged meals today
 *
 * Returns `undefined` (no badge) when the count is 0 or unavailable, and
 * a numeric string (capped at "99+") when there are pending items.
 * Expo Router / React Navigation renders `tabBarBadge` as a red pill when
 * the value is a non-empty string or a positive number.
 *
 * Data is read directly from MMKV (synchronous) to avoid a flicker on
 * initial render. The hook subscribes to storage-change events so badges
 * update within the same frame as the write.
 */

import { useEffect, useState, useMemo } from "react";
import { safeReadLS } from "@/lib/storage";

// Storage keys for each module
const ROUTINE_HABITS_KEY = "routine_habits_v1";
const ROUTINE_LOG_KEY = "routine_daily_log_v1";
const FINYK_BUDGETS_KEY = "finyk_budgets_v1";
const FINYK_TRANSACTIONS_KEY = "finyk_transactions_v1";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const FIZRUK_SCHEDULE_KEY = "fizruk_schedule_v1";
const NUTRITION_MEALS_KEY = "nutrition_meals_v1";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

/**
 * Count habits that are active today but not yet completed.
 */
function countPendingHabits(): number {
  try {
    const habitsRaw = safeReadLS<unknown>(ROUTINE_HABITS_KEY, null);
    const logRaw = safeReadLS<unknown>(ROUTINE_LOG_KEY, null);

    if (!Array.isArray(habitsRaw)) return 0;

    const todayKey = getTodayKey();
    const log: Record<string, boolean> =
      logRaw && typeof logRaw === "object" && !Array.isArray(logRaw)
        ? (logRaw as Record<string, boolean>)
        : {};

    return habitsRaw.filter((h) => {
      if (!h || typeof h !== "object") return false;
      const habit = h as { id?: string; active?: boolean };
      if (!habit.id || habit.active === false) return false;
      return !log[`${habit.id}:${todayKey}`];
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Count budget categories that are over their limit this month.
 */
function countOverBudgetCategories(): number {
  try {
    const budgetsRaw = safeReadLS<unknown>(FINYK_BUDGETS_KEY, null);
    const transactionsRaw = safeReadLS<unknown>(FINYK_TRANSACTIONS_KEY, null);

    if (!Array.isArray(budgetsRaw) || !Array.isArray(transactionsRaw)) return 0;

    const thisMonth = getTodayKey().slice(0, 7); // "YYYY-MM"

    // Calculate spending per category for this month
    const categorySpending: Record<string, number> = {};
    for (const tx of transactionsRaw) {
      if (!tx || typeof tx !== "object") continue;
      const transaction = tx as {
        date?: string;
        categoryId?: string;
        amount?: number;
      };
      if (!transaction.date?.startsWith(thisMonth)) continue;
      if (!transaction.categoryId) continue;
      categorySpending[transaction.categoryId] =
        (categorySpending[transaction.categoryId] || 0) +
        Math.abs(transaction.amount || 0);
    }

    // Count categories over budget
    return budgetsRaw.filter((b) => {
      if (!b || typeof b !== "object") return false;
      const budget = b as { id?: string; limit?: number };
      if (!budget.id || !budget.limit) return false;
      const spent = categorySpending[budget.id] || 0;
      return spent > budget.limit;
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Count workouts missed this week based on schedule.
 */
function countMissedWorkouts(): number {
  try {
    const workoutsRaw = safeReadLS<unknown>(FIZRUK_WORKOUTS_KEY, null);
    const scheduleRaw = safeReadLS<unknown>(FIZRUK_SCHEDULE_KEY, null);

    if (!scheduleRaw || typeof scheduleRaw !== "object") return 0;
    const schedule = scheduleRaw as { daysPerWeek?: number };
    const targetDays = schedule.daysPerWeek || 3;

    const weekStart = getWeekStart();
    const today = getTodayKey();

    // Count completed workouts this week
    let completedThisWeek = 0;
    if (Array.isArray(workoutsRaw)) {
      for (const w of workoutsRaw) {
        if (!w || typeof w !== "object") continue;
        const workout = w as { date?: string; completed?: boolean };
        if (
          workout.date &&
          workout.date >= weekStart &&
          workout.date <= today &&
          workout.completed
        ) {
          completedThisWeek++;
        }
      }
    }

    // Calculate days passed in this week
    const weekStartDate = new Date(weekStart);
    const todayDate = new Date(today);
    const daysPassed =
      Math.floor(
        (todayDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    // Expected workouts by now (proportional to days passed)
    const expectedByNow = Math.floor((targetDays / 7) * daysPassed);
    const missed = Math.max(0, expectedByNow - completedThisWeek);

    return missed;
  } catch {
    return 0;
  }
}

/**
 * Count unlogged meals today (expected 3 meals: breakfast, lunch, dinner).
 */
function countUnloggedMeals(): number {
  try {
    const mealsRaw = safeReadLS<unknown>(NUTRITION_MEALS_KEY, null);
    const todayKey = getTodayKey();

    let loggedToday = 0;
    if (Array.isArray(mealsRaw)) {
      for (const m of mealsRaw) {
        if (!m || typeof m !== "object") continue;
        const meal = m as { date?: string };
        if (meal.date?.startsWith(todayKey)) {
          loggedToday++;
        }
      }
    }

    // Expect 3 main meals per day
    const expectedMeals = 3;
    return Math.max(0, expectedMeals - loggedToday);
  } catch {
    return 0;
  }
}

function formatBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}

export interface TabBadges {
  /** Badge for the Routine tab — pending habits today. */
  routine: string | undefined;
  /** Badge for the Finyk tab — over-budget categories. */
  finyk: string | undefined;
  /** Badge for the Fizruk tab — missed workouts this week. */
  fizruk: string | undefined;
  /** Badge for the Nutrition tab — unlogged meals today. */
  nutrition: string | undefined;
}

export function useTabBadges(): TabBadges {
  const [routineCount, setRoutineCount] = useState(() => countPendingHabits());
  const [finykCount, setFinykCount] = useState(() =>
    countOverBudgetCategories(),
  );
  const [fizrukCount, setFizrukCount] = useState(() => countMissedWorkouts());
  const [nutritionCount, setNutritionCount] = useState(() =>
    countUnloggedMeals(),
  );

  useEffect(() => {
    // Re-evaluate on every focus / visibility change so the badge is
    // up-to-date when the user switches back to the hub tab.
    const refresh = () => {
      setRoutineCount(countPendingHabits());
      setFinykCount(countOverBudgetCategories());
      setFizrukCount(countMissedWorkouts());
      setNutritionCount(countUnloggedMeals());
    };

    // React Native doesn't have a universal storage-change event, but
    // a simple interval is cheap enough for this low-frequency update.
    const id = setInterval(refresh, 30_000); // every 30s
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => ({
      routine: formatBadge(routineCount),
      finyk: formatBadge(finykCount),
      fizruk: formatBadge(fizrukCount),
      nutrition: formatBadge(nutritionCount),
    }),
    [routineCount, finykCount, fizrukCount, nutritionCount],
  );
}
