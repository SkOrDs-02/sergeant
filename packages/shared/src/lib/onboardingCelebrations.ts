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
 *
 * 2026-05-13 extension — `nextStepTip` + `primaryCtaLabel` close two
 * carryover items from the 2026-05-03 roast (`docs/audits/archive/`):
 *
 *   • **B-11 §2.9** — generic «Продовжуй додавати записи. Після
 *     кількох днів отримаєш перші інсайти…» on every celebration
 *     reads as another TODO. Each module now ships a concrete
 *     promise («Додай ще 2-3 витрати — Sergeant покаже…»).
 *   • **P2-15 §2.9 / §4** — generic «Продовжити» CTA on every
 *     celebration ignores the user's intent. Each module now ships
 *     a CTA label that promises the next action.
 */
import type { DashboardModuleId } from "./dashboard";

export interface FirstEntryCelebrationCopy {
  /** Hero headline rendered as `<h2>`. ≤ 32 Cyrillic chars. */
  headline: string;
  /** Single-line subtext under the headline. ≤ 90 chars. */
  subtext: string;
  /**
   * «Що далі» tip — concrete, module-specific next step (B-11), stated as
   * a fact, not a promise or a pep talk (redesign v3, catalogue item 19).
   * ≤ 110 chars so it fits comfortably below the headline on phones.
   */
  nextStepTip: string;
  /**
   * Primary CTA label that promises the next action (P2-15).
   * Replaces the generic «Продовжити». Imperative, ≤ 24 chars, no
   * trailing punctuation. The CTA still closes the modal — the
   * promise lives in the copy, not in routing (which would expand
   * the surface for a P2 polish item).
   */
  primaryCtaLabel: string;
}

export const FIRST_ENTRY_CELEBRATIONS: Record<
  DashboardModuleId | "default",
  FirstEntryCelebrationCopy
> = {
  finyk: {
    headline: "Перша витрата записана",
    subtext: "Витрата вже в історії операцій і в бюджеті місяця.",
    nextStepTip: "Після кількох витрат в Аналізі Фініка зʼявляться категорії.",
    primaryCtaLabel: "Записати ще витрату",
  },
  fizruk: {
    headline: "Перше тренування у щоденнику",
    subtext:
      "Тренування вже в журналі, відновлення мʼязів рахується від нього.",
    nextStepTip: "Наступне тренування можна запланувати в календарі Фізрука.",
    primaryCtaLabel: "Запланувати наступне",
  },
  routine: {
    headline: "Звичка стартувала",
    // Факт без оцінки (редизайн v3, каталог п. 19): що сталося з відміткою.
    // Audit-guard у `onboardingCelebrations.test.ts` блокує повернення
    // «Streak / Серія» у subtext (рахунок серії в перший день читався як 0).
    subtext: "Сьогоднішня відмітка вже в календарі звички.",
    nextStepTip: "Нагадування про звичку вмикається в її налаштуваннях.",
    primaryCtaLabel: "Налаштувати нагадування",
  },
  nutrition: {
    headline: "Перший прийом їжі залогований",
    subtext: "Калорії й БЖВ прийому вже в денному балансі.",
    nextStepTip: "Додай обід чи вечерю, і баланс БЖВ за день стане повним.",
    primaryCtaLabel: "Додати ще прийом",
  },
  default: {
    headline: "Перший запис",
    subtext: "Запис збережено.",
    nextStepTip: "Записи з різних розділів звʼязуються на вкладці «Звʼязки».",
    primaryCtaLabel: "Продовжити",
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
