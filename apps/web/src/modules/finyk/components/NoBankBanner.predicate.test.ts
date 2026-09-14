/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін умови показу банера «підключити банк» (PR-F5).
 *
 * Чому окремий файл на одну функцію: у `FinykApp.extra.test.tsx` моки
 * роблять сам банер недосяжним, тож тест «у демо банер не показується»
 * там зеленів би незалежно від умови. Порожній пін гірший за відсутній —
 * він виглядає як захист. Тут перевіряється рівно предикат.
 */
import { describe, it, expect } from "vitest";
import { shouldShowNoBankBanner } from "./NoBankBanner.visibility";

const BASE = {
  hasConnectedProvider: false,
  manualOnly: false,
  inDemo: false,
};

describe("shouldShowNoBankBanner", () => {
  it("без банку, без вибору «без банку», поза демо — показується", () => {
    expect(shouldShowNoBankBanner(BASE)).toBe(true);
  });

  it("у демо — не показується", () => {
    expect(shouldShowNoBankBanner({ ...BASE, inDemo: true })).toBe(false);
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
