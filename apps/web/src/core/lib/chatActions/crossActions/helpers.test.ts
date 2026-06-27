import { describe, expect, it, vi } from "vitest";

vi.mock("../../../insights/useWeeklyDigest", () => ({
  getWeekKey: vi.fn((d: Date) => {
    // Return Monday of the week for the given date
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day - 1));
    return [
      monday.getFullYear(),
      String(monday.getMonth() + 1).padStart(2, "0"),
      String(monday.getDate()).padStart(2, "0"),
    ].join("-");
  }),
}));

import {
  diffLine,
  formatWeekRangeLabel,
  previousWeekKey,
  weekLabelToMondayKey,
} from "./helpers";

// ─── weekLabelToMondayKey ─────────────────────────────────────────────────────

describe("weekLabelToMondayKey", () => {
  it("returns null for invalid input", () => {
    expect(weekLabelToMondayKey("bad-input")).toBeNull();
  });

  it("returns null for week 0", () => {
    expect(weekLabelToMondayKey("2026-W0")).toBeNull();
  });

  it("returns null for week 54", () => {
    expect(weekLabelToMondayKey("2026-W54")).toBeNull();
  });

  it("converts 2026-W17 to correct Monday", () => {
    // ISO week 17 of 2026: Monday = 2026-04-20
    expect(weekLabelToMondayKey("2026-W17")).toBe("2026-04-20");
  });

  it("converts 2026-W01 to correct Monday", () => {
    // ISO week 1 of 2026 starts 2025-12-29 (week straddles year boundary)
    const result = weekLabelToMondayKey("2026-W01");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts bare YYYY-MM-DD and snaps to Monday", () => {
    // 2026-04-22 is Wednesday → Monday = 2026-04-20
    const result = weekLabelToMondayKey("2026-04-22");
    expect(result).toBe("2026-04-20");
  });

  it("returns null for invalid date string", () => {
    expect(weekLabelToMondayKey("9999-99-99")).toBeNull();
  });
});

// ─── previousWeekKey ──────────────────────────────────────────────────────────

describe("previousWeekKey", () => {
  it("returns Monday 7 days before", () => {
    expect(previousWeekKey("2026-04-20")).toBe("2026-04-13");
  });

  it("crosses month boundary correctly", () => {
    expect(previousWeekKey("2026-05-04")).toBe("2026-04-27");
  });
});

// ─── formatWeekRangeLabel ─────────────────────────────────────────────────────

describe("formatWeekRangeLabel", () => {
  it("returns a string with dash separator", () => {
    const result = formatWeekRangeLabel("2026-04-20");
    expect(result).toContain("–");
  });

  it("includes both the monday and sunday dates", () => {
    const result = formatWeekRangeLabel("2026-04-20");
    // Monday 20 and Sunday 26 April
    expect(result).toContain("20");
    expect(result).toContain("26");
  });
});

// ─── diffLine ─────────────────────────────────────────────────────────────────

describe("diffLine", () => {
  it("formats positive delta with + sign", () => {
    expect(diffLine("Витрати", 1000, 800, " грн")).toBe(
      "Витрати: 1000 грн vs 800 грн (+200 грн)",
    );
  });

  it("formats negative delta without + sign", () => {
    expect(diffLine("Тренування", 3, 5, "")).toBe("Тренування: 3 vs 5 (-2)");
  });

  it("formats zero delta without sign", () => {
    expect(diffLine("Ккал", 2000, 2000, " ккал")).toBe(
      "Ккал: 2000 ккал vs 2000 ккал (0 ккал)",
    );
  });
});
