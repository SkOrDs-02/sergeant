import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../profile/biometrics", () => ({
  mirrorWeightToBiometrics: vi.fn(),
}));
vi.mock("./shared", () => ({
  persistFizrukDailyLog: vi.fn(),
  readFizrukDailyLog: vi.fn(),
}));

import { mirrorWeightToBiometrics } from "../../../profile/biometrics";
import { persistFizrukDailyLog, readFizrukDailyLog } from "./shared";
import { logWellbeing } from "./wellbeing";

const mockPersist = vi.mocked(persistFizrukDailyLog);
const mockRead = vi.mocked(readFizrukDailyLog);
const mockMirrorWeight = vi.mocked(mirrorWeightToBiometrics);

beforeEach(() => {
  vi.clearAllMocks();
  mockRead.mockReturnValue([]);
});

describe("logWellbeing", () => {
  it("returns error when no valid fields provided", () => {
    const result = logWellbeing({ type: "log_wellbeing", input: {} });
    expect(result).toContain("Немає жодного");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("records weight when provided", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { weight_kg: 75 },
    }) as { result: string };
    expect(result.result).toContain("вага 75 кг");
    expect(mockPersist).toHaveBeenCalledOnce();
  });

  it("records sleep hours when provided", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { sleep_hours: 7.5 },
    }) as { result: string };
    expect(result.result).toContain("сон 7.5 год");
  });

  it("records energy level when in range 1-5", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { energy_level: 4 },
    }) as { result: string };
    expect(result.result).toContain("енергія 4/5");
  });

  it("records mood score when in range 1-5", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { mood_score: 3 },
    }) as { result: string };
    expect(result.result).toContain("настрій 3/5");
  });

  it("records multiple fields at once", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { weight_kg: 80, sleep_hours: 8, energy_level: 5, mood_score: 4 },
    }) as { result: string };
    expect(result.result).toContain("вага 80 кг");
    expect(result.result).toContain("сон 8 год");
    expect(result.result).toContain("енергія 5/5");
    expect(result.result).toContain("настрій 4/5");
  });

  it("ignores energy outside 1-5 range", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { energy_level: 10, note: "test" },
    }) as { result: string };
    expect(result.result).not.toContain("енергія");
  });

  it("ignores sleep hours above 24", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { sleep_hours: 25, note: "test" },
    }) as { result: string };
    expect(result.result).not.toContain("сон");
  });

  it("accepts note-only entry", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { note: "Почуваюся добре" },
    }) as { result: string };
    expect(result.result).toContain("Самопочуття записано");
    expect(mockPersist).toHaveBeenCalledOnce();
  });

  it("mirrors weight to biometrics when weight provided", () => {
    logWellbeing({ type: "log_wellbeing", input: { weight_kg: 72 } });
    expect(mockMirrorWeight).toHaveBeenCalledWith(72, expect.any(String));
  });

  it("does NOT mirror weight when weight not provided", () => {
    logWellbeing({ type: "log_wellbeing", input: { sleep_hours: 6 } });
    expect(mockMirrorWeight).not.toHaveBeenCalled();
  });

  it("returns object with undo function", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { mood_score: 3 },
    });
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("undo removes the logged entry", () => {
    const result = logWellbeing({
      type: "log_wellbeing",
      input: { mood_score: 2 },
    }) as { undo: () => void };
    const written = mockPersist.mock.calls[0]?.[0] as Array<{ id: string }>;
    const entryId = written?.[0]?.id;
    vi.clearAllMocks();
    mockRead.mockReturnValue([{ id: entryId, moodScore: 2 }]);
    result.undo();
    expect(mockPersist).toHaveBeenCalledWith([]);
  });
});
