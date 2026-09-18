/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { formatLogDateSubline } from "./formatLogDateSubline";

describe("formatLogDateSubline", () => {
  it("formats an ISO date key as a human uk-UA weekday + day + month string", () => {
    // 2026-09-01 is a Tuesday.
    expect(formatLogDateSubline("2026-09-01")).toBe("вівторок, 1 вересня");
  });

  it("does not leak the raw ISO string into the formatted output", () => {
    expect(formatLogDateSubline("2026-01-02")).not.toContain("2026-01-02");
  });

  it("falls back to the raw input for a malformed key", () => {
    expect(formatLogDateSubline("not-a-date")).toBe("not-a-date");
  });
});
