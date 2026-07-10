/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for RecipesCard pure helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guessMealTypeIdNow } from "./RecipesCard.helpers";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("guessMealTypeIdNow", () => {
  it("returns breakfast between 05:00 and 10:59", () => {
    vi.setSystemTime(new Date("2026-06-24T08:30:00"));
    expect(guessMealTypeIdNow()).toBe("breakfast");
  });

  it("returns lunch between 11:00 and 15:59", () => {
    vi.setSystemTime(new Date("2026-06-24T13:00:00"));
    expect(guessMealTypeIdNow()).toBe("lunch");
  });

  it("returns dinner between 16:00 and 21:59", () => {
    vi.setSystemTime(new Date("2026-06-24T19:00:00"));
    expect(guessMealTypeIdNow()).toBe("dinner");
  });

  it("returns snack outside main meal windows", () => {
    vi.setSystemTime(new Date("2026-06-24T23:30:00"));
    expect(guessMealTypeIdNow()).toBe("snack");
  });
});
