import {
  FINYK_QUICK_STATS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  ROUTINE_QUICK_STATS_KEY,
} from "./keys";
import { writeJSON } from "./utils";

// Hub-dashboard quick-stats payloads. Shape matches `selectModulePreview`
// in `@sergeant/shared`:
//   - finyk:     { todaySpent, budgetLeft } — both numbers in UAH
//   - fizruk:    { weekWorkouts, streak }
//   - routine:   { todayDone, todayTotal, streak }
//   - nutrition: { todayCal, calGoal }
// Numeric zero is rendered as "no value" (the selector treats it
// falsy-ish), so all figures here are non-zero by design.
export function seedHubQuickStats(): void {
  // Finyk: today's expenses = 145 + 220 + 85 = 450 UAH, budget 28k minus
  // rough month-to-date spend ≈ 9 200 → ~18 800 left.
  writeJSON(FINYK_QUICK_STATS_KEY, {
    todaySpent: 450,
    budgetLeft: 18800,
  });
  // Fizruk: two workouts seeded in the last 7 days; a modest rolling
  // streak feels natural without looking unrealistic.
  writeJSON(FIZRUK_QUICK_STATS_KEY, {
    weekWorkouts: 2,
    streak: 5,
  });
  // Routine: all 5 habits completed today (seeder marks `today` for
  // every habit) and the longest continuous streak in the seed is 14d.
  writeJSON(ROUTINE_QUICK_STATS_KEY, {
    todayDone: 5,
    todayTotal: 5,
    streak: 14,
  });
  // Nutrition: today's meals sum to 420 + 640 + 190 = 1 250 kcal
  // against a 2 200 kcal target (matches NUTRITION_PREFS_KEY).
  writeJSON(NUTRITION_QUICK_STATS_KEY, {
    todayCal: 1250,
    calGoal: 2200,
  });
}
