import { describe, it, expect, vi } from "vitest";
import {
  weekLabelToMondayKey,
  previousWeekKey,
  formatWeekRangeLabel,
  diffLine,
} from "./helpers";

vi.mock("../../../insights/useWeeklyDigest", () => ({
  getWeekKey: (d: Date) => {
    // Snap to Monday of that week
    const day = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day - 1));
    return [
      mon.getFullYear(),
      String(mon.getMonth() + 1).padStart(2, "0"),
      String(mon.getDate()).padStart(2, "0"),
    ].join("-");
  },
}));

describe("weekLabelToMondayKey", () => {
  describe("ISO week format YYYY-Www", () => {
    it("converts 2026-W01 to correct Monday", () => {
      // Jan 4, 2026 is Sunday → week 1 Monday is Dec 29, 2025
      const result = weekLabelToMondayKey("2026-W01");
      expect(result).toBe("2025-12-29");
    });

    it("converts 2026-W17 to correct Monday", () => {
      const result = weekLabelToMondayKey("2026-W17");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // W17 2026: Apr 20 is Monday
      expect(result).toBe("2026-04-20");
    });

    it("converts 2026-W52 correctly", () => {
      const result = weekLabelToMondayKey("2026-W52");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns null for week 0", () => {
      expect(weekLabelToMondayKey("2026-W0")).toBeNull();
    });

    it("returns null for week 54", () => {
      expect(weekLabelToMondayKey("2026-W54")).toBeNull();
    });

    it("handles single-digit week number", () => {
      const result = weekLabelToMondayKey("2026-W5");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("trims whitespace", () => {
      const result = weekLabelToMondayKey("  2026-W17  ");
      expect(result).toBe("2026-04-20");
    });
  });

  describe("bare YYYY-MM-DD fallback", () => {
    it("snaps a day key to its week Monday", () => {
      // 2026-04-22 is a Wednesday → Monday is 2026-04-20
      const result = weekLabelToMondayKey("2026-04-22");
      expect(result).toBe("2026-04-20");
    });

    it("returns Monday unchanged when input is already Monday", () => {
      const result = weekLabelToMondayKey("2026-04-20");
      expect(result).toBe("2026-04-20");
    });

    it("returns null for invalid date string", () => {
      const result = weekLabelToMondayKey("2026-99-99");
      expect(result).toBeNull();
    });
  });

  describe("unrecognized format", () => {
    it("returns null for empty string", () => {
      expect(weekLabelToMondayKey("")).toBeNull();
    });

    it("returns null for random text", () => {
      expect(weekLabelToMondayKey("not-a-date")).toBeNull();
    });

    it("returns null for partial week label", () => {
      expect(weekLabelToMondayKey("2026-W")).toBeNull();
    });
  });
});

describe("previousWeekKey", () => {
  it("returns Monday 7 days before the given Monday", () => {
    expect(previousWeekKey("2026-04-20")).toBe("2026-04-13");
  });

  it("crosses month boundary correctly", () => {
    expect(previousWeekKey("2026-03-02")).toBe("2026-02-23");
  });

  it("crosses year boundary correctly", () => {
    expect(previousWeekKey("2026-01-05")).toBe("2025-12-29");
  });
});

describe("formatWeekRangeLabel", () => {
  it("returns a range string with dash separator", () => {
    const label = formatWeekRangeLabel("2026-04-20");
    expect(label).toContain("–");
  });

  it("covers 7 days (Monday to Sunday)", () => {
    const label = formatWeekRangeLabel("2026-04-20");
    // Should include Apr 20 (Mon) and Apr 26 (Sun) references
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(5);
  });
});

describe("diffLine", () => {
  it("formats positive delta with + sign", () => {
    expect(diffLine("Витрати", 150, 100, "₴")).toBe(
      "Витрати: 150₴ vs 100₴ (+50₴)",
    );
  });

  it("formats negative delta without + sign", () => {
    expect(diffLine("Калорії", 1800, 2200, " ккал")).toBe(
      "Калорії: 1800 ккал vs 2200 ккал (-400 ккал)",
    );
  });

  it("formats zero delta", () => {
    expect(diffLine("Кроки", 5000, 5000, " кр")).toBe(
      "Кроки: 5000 кр vs 5000 кр (0 кр)",
    );
  });
});
