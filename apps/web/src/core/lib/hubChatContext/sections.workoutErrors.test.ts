// @vitest-environment jsdom
/**
 * W8 P2 fix: `appendWorkoutLines` had two empty `catch {}` blocks (outer —
 * the whole section; inner — the active-workout hint) that swallowed any
 * exception with no marker and no diagnostics. See `sections.ts` docblock
 * for the model-facing consequence: an absent section reads as "no data",
 * not "a source broke".
 *
 * Split out from a combined error-test file to stay under the repo's
 * `vi.mock` cap (5 per file, `scripts/ci/check-vi-mock-cap.mjs`) — each
 * section's error path gets its own minimally-mocked file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerErrorMock, loggerWarnMock, safeReadStringLSMock } = vi.hoisted(
  () => ({
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    safeReadStringLSMock: vi.fn<(key: string) => string | null>(() => null),
  }),
);

vi.mock("@shared/lib", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: (key: string) => safeReadStringLSMock(key),
}));

import { appendWorkoutLines } from "./sections";
import {
  WORKOUTS_STORAGE_KEY,
  ACTIVE_WORKOUT_KEY,
} from "@sergeant/fizruk-domain";

beforeEach(() => {
  vi.clearAllMocks();
  safeReadStringLSMock.mockReturnValue(null);
});

describe("appendWorkoutLines — секція гасне без сліду при кинутому винятку", () => {
  it("outer catch: підставляє маркер і логує, коли читання тренувань кидає", () => {
    safeReadStringLSMock.mockImplementation(() => {
      throw new Error("storage boom");
    });
    const lines: string[] = [];
    appendWorkoutLines(lines);
    expect(lines).toEqual(["[Тренування] дані тимчасово недоступні"]);
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("inner catch (активне тренування): маркер замість тихого 'немає'", () => {
    safeReadStringLSMock.mockImplementation((key: string) => {
      if (key === WORKOUTS_STORAGE_KEY) {
        return JSON.stringify([
          { id: "w1", startedAt: new Date().toISOString(), items: [] },
        ]);
      }
      if (key === ACTIVE_WORKOUT_KEY) {
        throw new Error("active key boom");
      }
      return null;
    });
    const lines: string[] = [];
    appendWorkoutLines(lines);
    const activeLine = lines.find((l) => l.startsWith("[Фізрук активне"));
    expect(activeLine).toBe(
      "[Фізрук активне тренування] дані тимчасово недоступні",
    );
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
