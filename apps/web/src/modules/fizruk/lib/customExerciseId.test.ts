import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customExerciseIdFromName,
  slugifyExerciseName,
} from "./customExerciseId";

afterEach(() => vi.useRealTimers());

describe("customExerciseId", () => {
  it("латинська назва → детермінований slug", () => {
    expect(slugifyExerciseName("  Hip  Thrust! ")).toBe("hip_thrust");
    expect(customExerciseIdFromName("Hip Thrust")).toBe("custom_hip_thrust");
  });

  it("кирилична назва (порожній slug) → custom_<Date.now()>", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    expect(slugifyExerciseName("Жим Гантелей")).toBe("");
    expect(customExerciseIdFromName("Жим Гантелей")).toBe(
      `custom_${Date.parse("2026-10-03T12:00:00.000Z")}`,
    );
  });
});
