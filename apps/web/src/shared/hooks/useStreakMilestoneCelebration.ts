import { useEffect } from "react";
import {
  CELEBRATED_STREAK_MILESTONES,
  claimStreakMilestone,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { useToast } from "./useToast";

/**
 * Тиха плашка на віху стріку (7 / 30 / 100 днів).
 *
 * Рівень подачі — рішення власника 2026-09-13: САМЕ тост, не модалка й не
 * конфеті. Обґрунтування не естетичне: завершене тренування щойно знизили з
 * модалки до тосту як «часту подію», а `CelebrationModal` — `fixed inset-0
 * z-9999`, той самий клас, який у Фізруку перекривав відкритий аркуш (там
 * про це стоїть AI-DANGER). Сімка днів — подія регулярна, тож їй той самий
 * рівень, що й решті регулярних.
 *
 * AI-DANGER: подавай сюди стрік У ДНЯХ. Фізрук рахує тижні
 * (`computeWeeklyStreakWeeks`) — 30 тижнів це ~7 місяців, і поріг означав би
 * зовсім інше. Змішування одиниць уже коштувало мовчазного псування воронки
 * (аудит L-8): `days: 7` летіло за сім ТИЖНІВ підряд.
 *
 * Дедуп і засів першого запуску живуть у `claimStreakMilestone` — там же
 * пояснено, чому це зайняття, а не порівняння з попереднім значенням.
 *
 * `streak === null` означає «ще не порахували» (кеш не прогрівся). Нуль —
 * це вже відповідь, і засів на ньому коректний; `null` пропускаємо, інакше
 * засіяли б порожнечею холодного старту.
 *
 * Копі приходить ШАБЛОНОМ-РЯДКОМ, а не функцією, і це не стилістика:
 * інлайн-функція міняє identity щорендера, тож ефект або переганявся б на
 * кожен рендер (зайве читання сховища), або вимагав би ref-а, присвоєного
 * під час рендера — а це `react-hooks/refs`. Рядкова константа стабільна
 * сама собою.
 */
export function useStreakMilestoneCelebration(
  scope: string,
  streak: number | null,
  /** Шаблон із `{days}` — рядок, а не функція: див. нижче. */
  template: string,
): void {
  // Дістаємо саме `success`, а не весь контекст: контекстне значення
  // перемемоюється на КОЖНІЙ зміні списку плашок, тож ефект на ньому
  // переганявся б від кожного чужого тосту. `success` приходить із
  // внутрішнього `api`, який стабільний.
  const { success } = useToast();

  useEffect(() => {
    if (streak === null) return;
    const reached = claimStreakMilestone(
      webKVStore,
      scope,
      streak,
      CELEBRATED_STREAK_MILESTONES,
    );
    if (reached === null) return;

    hapticTap();
    // 4000 мс, а не дефолтні 3500 для `success`: рішення власника називає
    // саме «тиху плашку на 4 с», і це той самий час, що в
    // `FirstEntryCelebrationModal`.
    success(template.replace("{days}", String(reached)), 4000);

    // AI-DANGER: цей хук НЕ емітить `streak_milestone_reached` — і це не
    // недогляд. Подію вже емітить детектор у хабі
    // (`dashboard/dashboardCards.tsx`) на ТОМУ САМОМУ стріку: він читає
    // `ROUTINE_QUICK_STATS.streak`, який пише `useRoutineQuickStatsWriter`
    // із того ж `flexibleMaxActiveStreak`. Другий емітер подвоїв би кожен
    // перетин 7/30/100 у воронці, а видно це стало б лише як дивна різниця
    // між порогами — рівно той клас мовчазного псування, від якого
    // застерігає AI-DANGER у тому ж файлі (аудит L-8).
    //
    // Набори при цьому різні навмисно: хаб міряє вісім порогів
    // (`TRACKED_STREAK_MILESTONES`), святкуємо три. Тобто 14/21/60/90/365
    // лишаються у воронці, але людина їх не бачить.
  }, [scope, streak, success, template]);
}
