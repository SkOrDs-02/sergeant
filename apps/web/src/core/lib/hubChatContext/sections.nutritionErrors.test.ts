// @vitest-environment jsdom
/**
 * W8 P2 fix: `appendNutritionLines` had an empty `catch {}` wrapping the
 * whole section — a broken nutrition-log read silently disappeared from
 * the chat prompt. See `sections.ts` docblock for the model-facing
 * consequence.
 *
 * Split out from a combined error-test file to stay under the repo's
 * `vi.mock` cap (5 per file, `scripts/ci/check-vi-mock-cap.mjs`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerErrorMock, loadNutritionLogMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loadNutritionLogMock: vi.fn(() => ({})),
}));

vi.mock("@shared/lib", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: () => loadNutritionLogMock(),
  loadNutritionPrefs: () => null,
  loadNutritionGoalPeriods: () => [],
}));

import { appendNutritionLines } from "./sections";

const NOW = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  loadNutritionLogMock.mockReturnValue({});
});

describe("appendNutritionLines — секція гасне без сліду при кинутому винятку", () => {
  it("підставляє маркер і логує, коли читання логу харчування кидає", () => {
    loadNutritionLogMock.mockImplementation(() => {
      throw new Error("nutrition boom");
    });
    const lines: string[] = [];
    appendNutritionLines(lines, NOW);
    expect(lines).toEqual(["[Харчування] дані тимчасово недоступні"]);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
