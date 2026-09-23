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
import { shouldShowNoBankBanner } from "./NoBankBanner.visibility";

const BASE = {
  hasConnectedProvider: false,
  manualOnly: false,
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

  it("людина обрала «без банку» — не показується", () => {
    expect(shouldShowNoBankBanner({ ...BASE, manualOnly: true })).toBe(false);
  });
});
