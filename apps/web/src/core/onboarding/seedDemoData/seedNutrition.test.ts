import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeJSONMock } = vi.hoisted(() => ({ writeJSONMock: vi.fn() }));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return { ...actual, writeJSON: writeJSONMock };
});

import { seedNutrition } from "./seedNutrition";

describe("seedNutrition", () => {
  beforeEach(() => {
    writeJSONMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the nutrition log, prefs, and water keys", () => {
    seedNutrition();
    const keys = writeJSONMock.mock.calls.map(([k]) => k);
    expect(keys).toContain("nutrition_log_v1");
    expect(keys).toContain("nutrition_prefs_v1");
    expect(keys).toContain("nutrition_water_v1");
  });

  it("seeds a non-empty nutrition log for today", () => {
    seedNutrition();
    const logCall = writeJSONMock.mock.calls.find(
      ([key]) => key === "nutrition_log_v1",
    );
    const log = logCall![1] as Record<string, unknown>;
    expect(Object.keys(log).length).toBeGreaterThan(0);
  });
});
