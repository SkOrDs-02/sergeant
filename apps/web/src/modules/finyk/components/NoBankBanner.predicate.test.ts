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
};

describe("shouldShowNoBankBanner", () => {
  it("без банку і без вибору «без банку» — показується", () => {
    expect(shouldShowNoBankBanner(BASE)).toBe(true);
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
