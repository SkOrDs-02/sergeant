import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn(),
  lsSet: vi.fn(),
}));

import { ls, lsSet } from "../../hubChatUtils";
import { addProgramDay } from "./programs";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockLsSet = vi.mocked(lsSet);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue({});
});

describe("addProgramDay", () => {
  it("returns error for invalid weekday (< 0)", () => {
    expect(
      addProgramDay({
        type: "add_program_day",
        input: { weekday: -1, name: "Chest" },
      }),
    ).toContain("0..6");
  });

  it("returns error for invalid weekday (> 6)", () => {
    expect(
      addProgramDay({
        type: "add_program_day",
        input: { weekday: 7, name: "Chest" },
      }),
    ).toContain("0..6");
  });

  it("returns error for empty name", () => {
    expect(
      addProgramDay({
        type: "add_program_day",
        input: { weekday: 1, name: "" },
      }),
    ).toContain("назва");
  });

  it("saves the day and returns confirmation", () => {
    const result = addProgramDay({
      type: "add_program_day",
      input: { weekday: 1, name: "Спина" },
    }) as string;
    expect(result).toContain("Спина");
    expect(result).toContain("пн");
    expect(mockLsSet).toHaveBeenCalledWith(
      "fizruk_plan_template_v1",
      expect.objectContaining({
        schemaVersion: 1,
        days: expect.objectContaining({
          "1": expect.objectContaining({ name: "Спина" }),
        }),
      }),
    );
  });

  it("shows correct weekday label for Sunday (0)", () => {
    const result = addProgramDay({
      type: "add_program_day",
      input: { weekday: 0, name: "Відпочинок" },
    }) as string;
    expect(result).toContain("нд");
  });

  it("parses exercises array", () => {
    const result = addProgramDay({
      type: "add_program_day",
      input: {
        weekday: 2,
        name: "Груди",
        exercises: [
          { name: "Жим лежачи", sets: 4, reps: 8, weight: 80 },
          { name: "Розводки", sets: 3, reps: 12 },
        ],
      },
    }) as string;
    expect(result).toContain("2 вправ");
  });

  it("skips exercises with empty names", () => {
    const result = addProgramDay({
      type: "add_program_day",
      input: {
        weekday: 3,
        name: "Ноги",
        exercises: [{ name: "" }, { name: "Присідання", sets: 4, reps: 5 }],
      },
    }) as string;
    expect(result).toContain("1 вправ");
  });

  it("skips non-object exercises", () => {
    const result = addProgramDay({
      type: "add_program_day",
      input: {
        weekday: 4,
        name: "Біцепс",
        exercises: [null, "invalid", { name: "Підйоми" }],
      },
    }) as string;
    expect(result).toContain("1 вправ");
  });

  it("merges into existing days from localStorage", () => {
    mockLs.mockReturnValue({
      schemaVersion: 1,
      days: { "0": { name: "Sunday", exercises: [] } },
    });
    addProgramDay({
      type: "add_program_day",
      input: { weekday: 1, name: "Monday" },
    });
    const saved = mockLsSet.mock.calls[0]![1] as {
      days: Record<string, unknown>;
    };
    expect(Object.keys(saved.days)).toContain("0");
    expect(Object.keys(saved.days)).toContain("1");
  });
});
