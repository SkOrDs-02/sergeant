import { describe, expect, it } from "vitest";
import { GROUP_SEPARATOR, formatNumberUk } from "./formatNumber";

describe("formatNumberUk", () => {
  it("групує розряди звичайним нерозривним пробілом", () => {
    expect(formatNumberUk(1234567)).toBe(
      `1${GROUP_SEPARATOR}234${GROUP_SEPARATOR}567`,
    );
  });

  it("не лишає вузького U+202F, хай що віддав Intl цього рушія", () => {
    // Node і Chromium розходяться: ICU у браузері групує uk-UA вузьким
    // U+202F, у Node — звичайним nbsp. Без нормалізації та сама сума
    // виглядала б по-різному залежно від середовища.
    expect(formatNumberUk(1234567)).not.toContain("\u202f");
    expect(
      formatNumberUk(9876543.21, { maximumFractionDigits: 2 }),
    ).not.toContain("\u202f");
  });

  it("десятковий роздільник лишається комою локалі", () => {
    expect(formatNumberUk(12.5, { minimumFractionDigits: 1 })).toBe("12,5");
  });

  it("малі числа не групуються", () => {
    expect(formatNumberUk(999)).toBe("999");
  });
});
