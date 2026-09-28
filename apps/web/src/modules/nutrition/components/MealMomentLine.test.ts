/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { mealMomentText } from "./MealMomentLine";

const target = "nutrition:day";

describe("текст моменту їжі", () => {
  it("наближення до звʼязку рахує дні і називає модуль", () => {
    expect(
      mealMomentText({ kind: "approach", target, value: 2, detail: "routine" }),
    ).toBe(
      "Ще 2 дні із записами тут і в модулі Рутина, і я перевірю, чи вони повʼязані.",
    );
  });

  it("наближення до висновку про калорії", () => {
    expect(mealMomentText({ kind: "approach", target, value: 5 })).toBe(
      "До висновку про калорії в дні тренувань лишилось 5 днів із записами їжі.",
    );
  });

  it("звʼязок і поріг підставляють назву", () => {
    expect(
      mealMomentText({
        kind: "link",
        target,
        detail: "коли тримаєш звички, їси більше",
      }),
    ).toBe(
      "Зʼявився звʼязок: коли тримаєш звички, їси більше. Деталі у Звітах.",
    );
    expect(
      mealMomentText({
        kind: "threshold",
        target,
        detail: "Калорії в дні тренувань",
      }),
    ).toBe(
      "Записів досить для нового висновку: «Калорії в дні тренувань». Він уже у Звітах.",
    );
  });
});
