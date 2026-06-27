import { describe, it, expect, vi, beforeEach } from "vitest";
import { addProgramDay } from "./programs";

const mockLsData: Record<string, unknown> = {};
vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn((key: string, def: unknown) => mockLsData[key] ?? def),
  lsSet: vi.fn((key: string, val: unknown) => {
    mockLsData[key] = val;
  }),
}));

function makeAction(weekday: unknown, name: unknown, exercises?: unknown) {
  return {
    type: "add_program_day" as const,
    input: { weekday, name, exercises },
  };
}

describe("addProgramDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(mockLsData)) delete mockLsData[k];
  });

  it("returns error for weekday -1", () => {
    expect(addProgramDay(makeAction(-1, "Груди"))).toContain("0..6");
  });

  it("returns error for weekday 7", () => {
    expect(addProgramDay(makeAction(7, "Спина"))).toContain("0..6");
  });

  it("returns error for fractional weekday", () => {
    expect(addProgramDay(makeAction(1.5, "Ноги"))).toContain("0..6");
  });

  it("returns error for empty name", () => {
    expect(addProgramDay(makeAction(1, ""))).toContain("назва");
    expect(addProgramDay(makeAction(1, "   "))).toContain("назва");
  });

  it("saves a day with no exercises", () => {
    const result = addProgramDay(makeAction(1, "Груди", []));
    expect(result).toContain("пн");
    expect(result).toContain("Груди");
    expect(result).toContain("0 вправ");
  });

  it("saves a day with valid exercises", () => {
    const result = addProgramDay(
      makeAction(3, "Спина", [
        { name: "Підтягування", sets: 3, reps: 10 },
        { name: "Тяга", sets: 4, reps: 8, weight: 60 },
      ]),
    );
    expect(result).toContain("2 вправ");
    expect(result).toContain("ср");
  });

  it("skips exercises with empty name", () => {
    const result = addProgramDay(
      makeAction(5, "Плечі", [
        { name: "", sets: 3, reps: 10 },
        { name: "Жим стоячи", sets: 3, reps: 10 },
      ]),
    );
    expect(result).toContain("1 вправ");
  });

  it("skips non-object exercise entries", () => {
    const result = addProgramDay(
      makeAction(0, "Кардіо", [null, "squat", { name: "Біг" }]),
    );
    expect(result).toContain("1 вправ");
  });

  it("uses undefined for invalid sets/reps/weight", () => {
    const result = addProgramDay(
      makeAction(2, "Руки", [
        { name: "Біцепс", sets: -1, reps: 0, weight: -10 },
      ]),
    );
    // Should still save, just with undefined optional fields
    expect(result).toContain("1 вправ");
  });

  it("handles no exercises field (undefined)", () => {
    const result = addProgramDay(makeAction(6, "Відпочинок", undefined));
    expect(result).toContain("0 вправ");
    expect(result).toContain("сб");
  });

  it("all weekday labels map correctly", () => {
    const labels = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
    for (let i = 0; i <= 6; i++) {
      const result = addProgramDay(makeAction(i, "Test"));
      expect(result).toContain(labels[i]);
    }
  });
});
