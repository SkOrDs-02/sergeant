import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMonobankRange } from "./monobank";
import type { ImportMonobankRangeAction } from "../types.finyk";

vi.mock("@shared/lib/storage/storage", () => ({
  safeRemoveLS: vi.fn(),
}));

// Loose params on purpose — several tests pass invalid dates (null, "",
// malformed) to exercise the handler's validation, so cast the fixture.
function makeAction(from: unknown, to: unknown) {
  return {
    name: "import_monobank_range",
    input: { from, to },
  } as ImportMonobankRangeAction;
}

describe("importMonobankRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for invalid from date format", () => {
    const result = importMonobankRange(makeAction("2026/01/01", "2026-01-31"));
    expect(result).toContain("YYYY-MM-DD");
  });

  it("returns error for invalid to date format", () => {
    const result = importMonobankRange(makeAction("2026-01-01", "31-01-2026"));
    expect(result).toContain("YYYY-MM-DD");
  });

  it("returns error when from > to", () => {
    const result = importMonobankRange(makeAction("2026-03-01", "2026-01-01"));
    expect(result).toContain("Некоректний");
  });

  it("returns error for empty strings", () => {
    const result = importMonobankRange(makeAction("", ""));
    expect(result).toContain("YYYY-MM-DD");
  });

  it("returns success message for valid single-month range", () => {
    const result = importMonobankRange(makeAction("2026-01-01", "2026-01-31"));
    expect(result).toContain("2026-01-01");
    expect(result).toContain("2026-01-31");
    expect(result).toContain("1 міс");
  });

  it("returns correct month count for multi-month range", () => {
    const result = importMonobankRange(makeAction("2026-01-01", "2026-03-31"));
    expect(result).toContain("3 міс");
    expect(result).toContain("2026-01");
    expect(result).toContain("2026-02");
    expect(result).toContain("2026-03");
  });

  it("crosses year boundary correctly", () => {
    const result = importMonobankRange(makeAction("2025-11-01", "2026-01-31"));
    expect(result).toContain("3 міс");
  });

  it("handles same from and to date (single day = single month)", () => {
    const result = importMonobankRange(makeAction("2026-06-15", "2026-06-15"));
    expect(result).toContain("1 міс");
  });

  it("handles null values as empty strings", () => {
    const result = importMonobankRange(makeAction(null, null));
    expect(result).toContain("YYYY-MM-DD");
  });
});
