/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін умови показу банера «підключити банк» (PR-F5).
 *
 * Чому окремий файл на одну функцію: у `FinykApp.extra.test.tsx` моки
 * роблять сам банер недосяжним, тож тест на умову показу там зеленів би
 * незалежно від неї. Порожній пін гірший за відсутній — він виглядає як
 * захист. Тут перевіряється рівно предикат.
 */
import { describe, it, expect } from "vitest";
import {
  BANK_BANNER_SNOOZE_DAYS,
  shouldShowNoBankBanner,
} from "./NoBankBanner.visibility";

const BASE = {
  hasConnectedProvider: false,
  manualOnly: false,
  manualExpenseCount: 0,
  dismissedAt: null as number | null,
  now: 1_800_000_000_000,
  page: "overview",
};

describe("shouldShowNoBankBanner", () => {
  it("без банку і без вибору «без банку» — показується", () => {
    expect(shouldShowNoBankBanner(BASE)).toBe(true);
  });

  it("показується лише на Огляді, не на решті вкладок", () => {
    // На mobile банер займав ~37% першого екрана КОЖНОЇ вкладки Фініка, а
    // порожній стан вкладки опинявся під згином (критика екранів
    // 2026-09-23). Вибір «банк чи вручну» робиться один раз.
    for (const page of ["transactions", "budgets", "analytics", "assets"]) {
      expect(shouldShowNoBankBanner({ ...BASE, page })).toBe(false);
    }
  });

  it("банк підключено — не показується", () => {
    expect(
      shouldShowNoBankBanner({ ...BASE, hasConnectedProvider: true }),
    ).toBe(false);
  });

  it("кілька ручних записів уже є вибором «вручну» — не показується", () => {
    expect(shouldShowNoBankBanner({ ...BASE, manualExpenseCount: 4 })).toBe(
      true,
    );
    expect(shouldShowNoBankBanner({ ...BASE, manualExpenseCount: 5 })).toBe(
      false,
    );
  });

  it("людина обрала «без банку» — не показується", () => {
    expect(shouldShowNoBankBanner({ ...BASE, manualOnly: true })).toBe(false);
  });

  describe("закриття на N днів", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const at = (days: number) => BASE.now + days * DAY;

    it("N = 7", () => {
      expect(BANK_BANNER_SNOOZE_DAYS).toBe(7);
    });

    it("щойно закритий — ховається", () => {
      expect(shouldShowNoBankBanner({ ...BASE, dismissedAt: BASE.now })).toBe(
        false,
      );
    });

    it("за мить до 7 днів — ще ховається, рівно через 7 — показується знову", () => {
      const dismissedAt = BASE.now;
      expect(
        shouldShowNoBankBanner({
          ...BASE,
          dismissedAt,
          now: at(7) - 1,
        }),
      ).toBe(false);
      expect(shouldShowNoBankBanner({ ...BASE, dismissedAt, now: at(7) })).toBe(
        true,
      );
    });

    it("з підключеним банком не показується навіть після спливу N днів", () => {
      expect(
        shouldShowNoBankBanner({
          ...BASE,
          hasConnectedProvider: true,
          dismissedAt: BASE.now,
          now: at(30),
        }),
      ).toBe(false);
    });
  });
});
