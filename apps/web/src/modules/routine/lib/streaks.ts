/**
 * Routine streak + completion-rate helpers — moved into
 * `@sergeant/routine-domain` (Phase 5 / PR 2). Re-exports under the
 * historical import path so existing web call-sites and tests continue
 * to work unchanged.
 */

export {
  calcRoutineDayProgress,
  completionRateForRange,
  habitCompletionRate,
  maxActiveStreak,
  maxStreakAllTime,
  streakForHabit,
  // Хвиля 4 — гнучкий стрік (канон §4/§5). Жорсткі `streakForHabit` /
  // `maxActiveStreak` лишаються експортованими для тестів і порівнянь,
  // але продуктові поверхні читають гнучкі.
  flexibleMaxActiveStreak,
  flexibleMaxStreakAllTime,
  flexibleMaxStreakAllTimeAcrossHabits,
  flexibleStreakBreakdown,
  flexibleStreakForHabit,
} from "@sergeant/routine-domain";
