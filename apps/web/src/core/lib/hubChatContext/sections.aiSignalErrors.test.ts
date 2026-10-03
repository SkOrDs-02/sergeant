// @vitest-environment jsdom
/**
 * W8 P2 fix: `appendAiSignalLines` had three independent empty `catch {}`
 * blocks (recommendations / insights / profile) — each broken source
 * silently vanished from the chat prompt with no marker and no
 * diagnostics. See `sections.ts` docblock for the model-facing
 * consequence.
 *
 * Split out from a combined error-test file to stay under the repo's
 * `vi.mock` cap (5 per file, `scripts/ci/check-vi-mock-cap.mjs`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loggerErrorMock,
  generateRecommendationsMock,
  generateInsightsMock,
  readMemoryEntriesMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  generateRecommendationsMock: vi.fn(() => [] as unknown[]),
  generateInsightsMock: vi.fn(() => [] as unknown[]),
  readMemoryEntriesMock: vi.fn(() => [] as unknown[]),
}));

vi.mock("@shared/lib", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../recommendationEngine", () => ({
  generateRecommendations: () => generateRecommendationsMock(),
}));

vi.mock("../insightsEngine", () => ({
  generateInsights: () => generateInsightsMock(),
}));

vi.mock("../../profile/memoryBank", () => ({
  CATEGORY_META: {},
  readMemoryEntries: () => readMemoryEntriesMock(),
}));

import { appendAiSignalLines } from "./sections";

beforeEach(() => {
  vi.clearAllMocks();
  generateRecommendationsMock.mockReturnValue([]);
  generateInsightsMock.mockReturnValue([]);
  readMemoryEntriesMock.mockReturnValue([]);
});

describe("appendAiSignalLines — три незалежні секції гаснуть без сліду", () => {
  it("рекомендації: маркер + лог при винятку", () => {
    generateRecommendationsMock.mockImplementation(() => {
      throw new Error("recs boom");
    });
    const lines: string[] = [];
    appendAiSignalLines(lines);
    expect(lines).toContain("[Активні рекомендації] дані тимчасово недоступні");
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("інсайти: маркер + лог при винятку", () => {
    generateInsightsMock.mockImplementation(() => {
      throw new Error("insights boom");
    });
    const lines: string[] = [];
    appendAiSignalLines(lines);
    expect(lines).toContain("[Аналітичні інсайти] дані тимчасово недоступні");
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("профіль користувача: маркер + лог при винятку", () => {
    readMemoryEntriesMock.mockImplementation(() => {
      throw new Error("profile boom");
    });
    const lines: string[] = [];
    appendAiSignalLines(lines);
    expect(lines).toContain("[Профіль користувача] дані тимчасово недоступні");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
