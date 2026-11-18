import { describe, expect, it } from "vitest";

import { isSetCompleted } from "./setCompletion.js";

describe("isSetCompleted — єдине визначення зарахованого підходу", () => {
  it("підхід зараховано, коли є повторення (вага може бути 0: власна вага)", () => {
    expect(isSetCompleted({ weightKg: 60, reps: 8 })).toBe(true);
    expect(isSetCompleted({ weightKg: 0, reps: 12 })).toBe(true);
  });

  it("рядок лише з вагою — не виконаний підхід (посів старту програми)", () => {
    expect(isSetCompleted({ weightKg: 60, reps: 0 })).toBe(false);
    expect(isSetCompleted({ weightKg: 0, reps: 0 })).toBe(false);
    expect(isSetCompleted(null)).toBe(false);
    expect(isSetCompleted({ weightKg: Number.NaN, reps: Number.NaN })).toBe(
      false,
    );
  });

  it("утримання з вагою, де час живе на вправі (імпорт зі Strong), лишається зарахованим", () => {
    const hold = { type: "strength", durationSec: 90 };
    expect(isSetCompleted({ weightKg: 20, reps: 0 }, hold)).toBe(true);
    // Без ваги й без повторень і там нічого не зроблено.
    expect(isSetCompleted({ weightKg: 0, reps: 0 }, hold)).toBe(false);
    // Без часу на вправі вага сама по собі не робить підхід виконаним.
    expect(
      isSetCompleted({ weightKg: 20, reps: 0 }, { type: "strength" }),
    ).toBe(false);
  });
});
