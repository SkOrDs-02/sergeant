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

  // AI-CONTEXT: регресія на форму `WaterLog`. Раніше сід писав
  // `{[date]: {ml: N}}`, а `WaterLog = Record<string, number>`
  // (`packages/nutrition-domain/src/waterLog.ts`) — `sanitizeMl`
  // рахує `Number({ml:1400})` → `NaN` → `0` → ключ відкидається
  // `normalizeWaterLog`-ом. Вода демо мовчки зникала при БУДЬ-ЯКОМУ
  // шляху читання, не лише через SQLite (аудит L-8, 2026-08-08).
  it("сід пише воду як число мілілітрів напряму, без обгортки {ml}", () => {
    seedNutrition();
    const waterCall = writeJSONMock.mock.calls.find(
      ([key]) => key === "nutrition_water_v1",
    );
    const water = waterCall![1] as Record<string, unknown>;
    expect(Object.keys(water).length).toBeGreaterThan(0);
    for (const value of Object.values(water)) {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value as number)).toBe(true);
    }
  });

  it("значення води виживають normalizeWaterLog (регресія: обʼєктна форма давала 0)", async () => {
    const { normalizeWaterLog } = await import("@sergeant/nutrition-domain");
    seedNutrition();
    const waterCall = writeJSONMock.mock.calls.find(
      ([key]) => key === "nutrition_water_v1",
    );
    const rawWater = waterCall![1];
    const normalized = normalizeWaterLog(rawWater);
    expect(Object.keys(normalized).length).toBe(
      Object.keys(rawWater as Record<string, unknown>).length,
    );
  });
});
