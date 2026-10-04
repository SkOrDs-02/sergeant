import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameExerciseName, newCustomExerciseId } from "./customExerciseId";

afterEach(() => vi.useRealTimers());

describe("customExerciseId", () => {
  it("формат: custom_<uuid>, без slug назви", () => {
    expect(newCustomExerciseId()).toMatch(
      /^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("два виклики в ту саму мілісекунду дають різні id", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    const ids = new Set(
      Array.from({ length: 100 }, () => newCustomExerciseId()),
    );
    expect(ids.size).toBe(100);
  });

  it("isSameExerciseName: регістр і пробіли не важливі, порожня назва ніколи не збігається", () => {
    expect(isSameExerciseName("  Hip   Thrust ", "hip thrust")).toBe(true);
    expect(isSameExerciseName("Жим 2", "Біг 2")).toBe(false);
    expect(isSameExerciseName("", "")).toBe(false);
    expect(isSameExerciseName(undefined, null)).toBe(false);
  });
});
