/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { workoutMomentText } from "./WorkoutMomentLine";

describe("текст моменту тренування", () => {
  it("наближення узгоджує число з «тренування»", () => {
    expect(workoutMomentText({ kind: "approach", target: "w", value: 1 })).toBe(
      "До висновку про найкращий день для тренувань лишилось 1 тренування.",
    );
    expect(workoutMomentText({ kind: "approach", target: "w", value: 4 })).toBe(
      "До висновку про найкращий день для тренувань лишилось 4 тренування.",
    );
  });

  it("поріг підставляє назву висновку", () => {
    expect(
      workoutMomentText({
        kind: "threshold",
        target: "w",
        detail: "Найпродуктивніший день для тренувань",
      }),
    ).toBe(
      "Тренувань досить для нового висновку: «Найпродуктивніший день для тренувань». Він уже у Звітах.",
    );
  });
});
