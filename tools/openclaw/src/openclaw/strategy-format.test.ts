import { describe, expect, it } from "vitest";
import {
  formatStrategyList,
  kyivMondayOf,
  parseStrategyCommand,
  STRATEGY_PERSONA_GLYPH,
  STRATEGY_STATUS_GLYPH,
  type StrategyGoalForRender,
} from "./strategy-format.js";

/**
 * Unit-tests for the `/strategy` slash-command parser + UI renderer
 * (PR-34 follow-up). Зробити парсер pure щоб тестувати grammar-edge-
 * case-и без spinning up grammy.
 */

describe("parseStrategyCommand", () => {
  it("returns help on empty / whitespace input", () => {
    expect(parseStrategyCommand("")).toEqual({ kind: "help" });
    expect(parseStrategyCommand("   ")).toEqual({ kind: "help" });
    expect(parseStrategyCommand("help")).toEqual({ kind: "help" });
  });

  it("parses /strategy list (no args) — default status=active", () => {
    expect(parseStrategyCommand("list")).toEqual({
      kind: "list",
      status: "active",
    });
  });

  it("parses /strategy list <status> for each supported status", () => {
    for (const status of [
      "active",
      "achieved",
      "abandoned",
      "carried_over",
    ] as const) {
      expect(parseStrategyCommand(`list ${status}`)).toEqual({
        kind: "list",
        status,
      });
    }
  });

  it("parses /strategy list all — no status filter, persona undefined", () => {
    expect(parseStrategyCommand("list all")).toEqual({
      kind: "list",
      status: "all",
    });
  });

  it("parses /strategy list <persona> — persona-only", () => {
    expect(parseStrategyCommand("list finyk")).toEqual({
      kind: "list",
      persona: "finyk",
      status: "active",
    });
  });

  it("parses /strategy list <persona> <status> in either order", () => {
    expect(parseStrategyCommand("list finyk achieved")).toEqual({
      kind: "list",
      persona: "finyk",
      status: "achieved",
    });
    expect(parseStrategyCommand("list achieved finyk")).toEqual({
      kind: "list",
      persona: "finyk",
      status: "achieved",
    });
  });

  it("emits error on unknown list filter", () => {
    const out = parseStrategyCommand("list foo");
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.message).toMatch(/foo/);
    }
  });

  it("parses /strategy add <persona>: <text>", () => {
    expect(
      parseStrategyCommand("add finyk: Cut coffee spend by 60% by Sunday"),
    ).toEqual({
      kind: "add",
      persona: "finyk",
      goalText: "Cut coffee spend by 60% by Sunday",
    });
  });

  it("handles whitespace around colon in /strategy add", () => {
    expect(parseStrategyCommand("add  fizruk  :  Squat 5x5  ")).toEqual({
      kind: "add",
      persona: "fizruk",
      goalText: "Squat 5x5",
    });
  });

  it("preserves colons inside goal text body", () => {
    const out = parseStrategyCommand("add routine: Wake at 06:30, no excuses");
    expect(out).toEqual({
      kind: "add",
      persona: "routine",
      goalText: "Wake at 06:30, no excuses",
    });
  });

  it("emits error when /strategy add lacks colon separator", () => {
    const out = parseStrategyCommand("add finyk goal text without colon");
    expect(out.kind).toBe("error");
  });

  it("emits error when /strategy add has unknown persona", () => {
    const out = parseStrategyCommand("add unknown: text");
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.message).toMatch(/unknown/);
    }
  });

  it("emits error when /strategy add has empty goal text", () => {
    const out = parseStrategyCommand("add finyk:   ");
    expect(out.kind).toBe("error");
  });

  it.each([
    ["done", "done"],
    ["abandon", "abandon"],
    ["carry", "carry"],
  ])("parses /strategy %s <id>", (sub, expected) => {
    expect(parseStrategyCommand(`${sub} 42`)).toEqual({
      kind: expected,
      id: 42,
    });
  });

  it("emits error for /strategy done with non-numeric id", () => {
    const out = parseStrategyCommand("done abc");
    expect(out.kind).toBe("error");
  });

  it("emits error for /strategy carry with negative id", () => {
    const out = parseStrategyCommand("carry -5");
    expect(out.kind).toBe("error");
  });

  it("emits error for /strategy carry with no id", () => {
    expect(parseStrategyCommand("carry").kind).toBe("error");
  });

  it("emits error for unknown subcommand", () => {
    const out = parseStrategyCommand("delete 1");
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.message).toMatch(/delete/);
    }
  });

  it("is case-insensitive for subcommand and filter tokens", () => {
    expect(parseStrategyCommand("LIST ACTIVE")).toEqual({
      kind: "list",
      status: "active",
    });
    expect(parseStrategyCommand("Done 1")).toEqual({ kind: "done", id: 1 });
  });
});

describe("formatStrategyList", () => {
  function goal(over: Partial<StrategyGoalForRender>): StrategyGoalForRender {
    return {
      id: 1,
      persona: "finyk",
      weekStart: "2026-05-11",
      goalText: "Test goal",
      status: "active",
      ...over,
    };
  }

  it("renders 'no goals' message when goals empty", () => {
    expect(formatStrategyList([])).toMatch(/Жодних/);
    expect(formatStrategyList([], { status: "achieved" })).toMatch(/achieved/);
    expect(formatStrategyList([], { persona: "fizruk" })).toMatch(/fizruk/);
  });

  it("groups by persona and includes status glyph + id", () => {
    const out = formatStrategyList([
      goal({ id: 1, persona: "finyk", goalText: "A" }),
      goal({ id: 2, persona: "fizruk", goalText: "B" }),
      goal({
        id: 3,
        persona: "finyk",
        status: "achieved",
        goalText: "C",
      }),
    ]);
    expect(out).toContain(STRATEGY_PERSONA_GLYPH.finyk);
    expect(out).toContain(STRATEGY_PERSONA_GLYPH.fizruk);
    expect(out).toContain(STRATEGY_STATUS_GLYPH.active);
    expect(out).toContain(STRATEGY_STATUS_GLYPH.achieved);
    expect(out).toContain("#1");
    expect(out).toContain("#2");
    expect(out).toContain("#3");
  });

  it("escapes HTML in goal text", () => {
    const out = formatStrategyList([
      goal({ goalText: "<script>alert(1)</script>" }),
    ]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("truncates goal text over 200 chars", () => {
    const long = "x".repeat(500);
    const out = formatStrategyList([goal({ goalText: long })]);
    expect(out).toContain("…");
    expect(out).not.toContain("x".repeat(300));
  });

  it("orders personas by canonical sequence (finyk, fizruk, nutrition, routine)", () => {
    const out = formatStrategyList([
      goal({ id: 4, persona: "routine" }),
      goal({ id: 1, persona: "finyk" }),
      goal({ id: 3, persona: "nutrition" }),
      goal({ id: 2, persona: "fizruk" }),
    ]);
    const finIdx = out.indexOf("finyk");
    const fizIdx = out.indexOf("fizruk");
    const nutIdx = out.indexOf("nutrition");
    const routIdx = out.indexOf("routine");
    expect(finIdx).toBeLessThan(fizIdx);
    expect(fizIdx).toBeLessThan(nutIdx);
    expect(nutIdx).toBeLessThan(routIdx);
  });
});

describe("kyivMondayOf", () => {
  it("returns the same Monday for any day Mon-Sun within ISO-week", () => {
    // Week 19, 2026: Mon May 11 – Sun May 17 (Kyiv local).
    // Use noon UTC to avoid DST/midnight edge — all of these should map
    // to Kyiv calendar days inside that week.
    const days = [
      new Date("2026-05-11T12:00:00Z"), // Mon
      new Date("2026-05-12T12:00:00Z"), // Tue
      new Date("2026-05-13T12:00:00Z"), // Wed
      new Date("2026-05-14T12:00:00Z"), // Thu
      new Date("2026-05-15T12:00:00Z"), // Fri
      new Date("2026-05-16T12:00:00Z"), // Sat
      new Date("2026-05-17T12:00:00Z"), // Sun
    ];
    for (const d of days) {
      expect(kyivMondayOf(d)).toBe("2026-05-11");
    }
  });

  it("crosses month boundary cleanly", () => {
    // Sun 2026-04-05 Kyiv → Monday of that ISO week is 2026-03-30.
    expect(kyivMondayOf(new Date("2026-04-05T12:00:00Z"))).toBe("2026-03-30");
  });

  it("returns a YYYY-MM-DD string", () => {
    const out = kyivMondayOf(new Date());
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
