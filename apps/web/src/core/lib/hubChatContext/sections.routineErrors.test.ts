// @vitest-environment jsdom
/**
 * W8 P2 fix: `appendRoutineLines` had an empty `catch {}` wrapping the
 * whole section — a broken routine-state read silently disappeared from
 * the chat prompt. See `sections.ts` docblock for the model-facing
 * consequence.
 *
 * Split out from a combined error-test file to stay under the repo's
 * `vi.mock` cap (5 per file, `scripts/ci/check-vi-mock-cap.mjs`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerErrorMock, loadRoutineStateMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loadRoutineStateMock: vi.fn(() => ({ habits: [], completions: {} })),
}));

vi.mock("@shared/lib", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: () => loadRoutineStateMock(),
}));

import { appendRoutineLines } from "./sections";

const NOW = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  loadRoutineStateMock.mockReturnValue({ habits: [], completions: {} });
});

describe("appendRoutineLines — секція гасне без сліду при кинутому винятку", () => {
  it("підставляє маркер і логує, коли читання стану рутини кидає", () => {
    loadRoutineStateMock.mockImplementation(() => {
      throw new Error("routine boom");
    });
    const lines: string[] = [];
    appendRoutineLines(lines, NOW);
    expect(lines).toEqual(["[Рутина] дані тимчасово недоступні"]);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
