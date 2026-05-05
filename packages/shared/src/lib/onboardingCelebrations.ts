/**
 * Module-aware copy table for the first-entry CelebrationModal.
 *
 * The previous copy bragged about engineering speed
 * («Готово за {N} с!», «Блискавично!»), which celebrates the *app*
 * instead of the user and decays to a cringe-pull on slower devices
 * or noisy networks. This table makes the moment about what the
 * user just did — записав витрату / зафіксував тренування /
 * запустив звичку / залогував їжу — і обіцяє наступний крок.
 *
 * Time-to-value (`ttvMs`) lives only in the analytics payload
 * (`celebration_shown { ttvMs, source }`) — it is *not* a copy input.
 */
import type { DashboardModuleId } from "./dashboard";

export interface FirstEntryCelebrationCopy {
  /** Hero headline rendered as `<h2>`. ≤ 32 Cyrillic chars. */
  headline: string;
  /** Single-line subtext under the headline. ≤ 90 chars. */
  subtext: string;
}

export const FIRST_ENTRY_CELEBRATIONS: Record<
  DashboardModuleId | "default",
  FirstEntryCelebrationCopy
> = {
  finyk: {
    headline: "Перша витрата записана",
    subtext:
      "Тепер бюджет — твій. Ще кілька записів, і Sergeant покаже тренди.",
  },
  fizruk: {
    headline: "Перше тренування у щоденнику",
    subtext:
      "Тепер це твоя історія. Стабільно 2-3 рази на тиждень — і прогрес буде видно.",
  },
  routine: {
    headline: "Звичка стартувала",
    // Outcome-first frame (S6.6 / B-4): сказати, що користувач *купує*
    // регулярністю — автоматизм без сили волі — а не просто розповісти
    // про мехнику ("Streak з'явиться", «Серія днів: 0»). Поріг 30 синхро-
    // нізований з `ROUTINE_TARGET_DAYS` у `ValueProgressBar.tsx`; якщо
    // число почне дрейфувати — винесемо в спільну константу. Audit-guard
    // у `onboardingCelebrations.test.ts` блокує повернення слова
    // «Streak / Серія» у subtext (mechanism-first regression).
    subtext: "Перший день у банку. Через 30 підряд це стає автоматичним.",
  },
  nutrition: {
    headline: "Перший прийом їжі залогований",
    subtext: "КБЖВ почав рахуватися. Кілька днів — і побачиш свій баланс.",
  },
  default: {
    headline: "Перший запис",
    subtext: "Це вже твої дані. Sergeant працює для тебе.",
  },
};

/**
 * Look up celebration copy for a module. Falls back to `default` when
 * the calling site could not detect which module flipped the
 * first-real-entry flag (e.g. multiple sources flipped in the same
 * tick — rare race, but the contract has to be safe).
 */
export function getFirstEntryCelebrationCopy(
  moduleId: DashboardModuleId | null,
): FirstEntryCelebrationCopy {
  if (!moduleId) return FIRST_ENTRY_CELEBRATIONS.default;
  return FIRST_ENTRY_CELEBRATIONS[moduleId];
}
