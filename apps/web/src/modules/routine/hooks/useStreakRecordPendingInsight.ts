import { useMemo } from "react";
import { pluralDays } from "@sergeant/shared";
import {
  flexibleMaxActiveStreak,
  longestStreakAcrossHabits,
} from "../lib/streaks";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
import type { RoutineState } from "../lib/types";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Fires when the current cross-habit streak is exactly one day away from
 * the user's personal all-time record — i.e. `currentStreak === longestStreak - 1`
 * and `currentStreak > 0`.
 *
 * Копі чесне про арифметику: на `longest - 1` ще один день рекорд лише
 * ПОВТОРЮЄ (серія стає рівною рекорду), побити його можна тільки днем після.
 * Тому заголовок/підзаголовок/промпт кажуть «повториш рекорд», а не «побити».
 *
 * `currentStreak` = `flexibleMaxActiveStreak` across all active habits
 * (today's date, device-local anchor per ADR-0078) — гнучкий стрік, тож
 * заявлена пауза чи пропуск із причиною рекорд не обнуляють.
 * `longestStreak` = `longestStreakAcrossHabits` (той самий гнучкий рахунок) —
 * purely local, derived from completion history.
 *
 * Returns `null` when the condition is not met, or when either value is 0:
 * без живої серії (`currentStreak <= 0`) «рекорд поруч» не має змісту — це
 * казало б «Серія: 0 днів / Ще один, і рекорд 1» людині, яка щойно її
 * обнулила, а без історії (`longestStreak <= 0`) рекорду немає взагалі.
 */
export function useStreakRecordPendingInsight(
  routine: RoutineState,
): Insight | null {
  const todayKey = useDeviceDayKey();

  const currentStreak = useMemo(
    () =>
      flexibleMaxActiveStreak(
        routine.habits,
        routine.completions,
        todayKey,
        routine.skips ?? {},
      ),
    [routine.habits, routine.completions, routine.skips, todayKey],
  );

  // Той самий гнучкий рахунок, що й у `currentStreak` (і ті самі виключені
  // гнучкі «N на тиждень»): жорсткий `maxStreakAllTime` давав рекорд МЕНШИЙ
  // за поточну серію (FULL-20261126-ROUTINE-1).
  const longestStreak = useMemo(
    () =>
      longestStreakAcrossHabits(
        routine.habits,
        routine.completions,
        todayKey,
        routine.skips ?? {},
      ),
    [routine.habits, routine.completions, routine.skips, todayKey],
  );

  return useMemo((): Insight | null => {
    if (longestStreak <= 0 || currentStreak <= 0) return null;
    if (currentStreak !== longestStreak - 1) return null;
    const record = `${longestStreak} ${pluralDays(longestStreak)}`;
    return {
      id: "routine-streak-record-pending",
      module: "routine",
      title: `Серія: ${currentStreak} ${pluralDays(currentStreak)}`,
      subtitle: `Ще день, і повториш рекорд ${record}`,
      // Стрік тут — cross-habit агрегат (flexibleMaxActiveStreak по ВСІХ
      // активних звичках разом), не конкретна звичка — те саме, що й title
      // вище, без назви. Founder-рішення 2026-08-30: без підстановки назви.
      askAiPrompt: `Моя серія зараз ${currentStreak} ${pluralDays(currentStreak)}, а особистий рекорд ${record}. Ще день, і я його повторю. Дай коротку мотивацію і підкажи, як не зірватись завтра.`,
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    };
  }, [currentStreak, longestStreak]);
}
