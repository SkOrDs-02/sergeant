import { describe, expect, it } from "vitest";
import {
  formatRitualEndpointFailure,
  formatRitualMorningReply,
  formatRitualNotImplemented,
  parseRitualCommand,
  RITUAL_HELP_TEXT,
} from "./ritual-format.js";

describe("parseRitualCommand", () => {
  it("defaults to morning when argument is empty", () => {
    expect(parseRitualCommand("")).toEqual({
      subcommand: "morning",
      rawArgument: "",
    });
  });

  it("defaults to morning when argument is whitespace-only", () => {
    expect(parseRitualCommand("   ")).toEqual({
      subcommand: "morning",
      rawArgument: "",
    });
  });

  it.each(["morning", "weekly", "monthly", "help"] as const)(
    "parses '%s' as a valid subcommand",
    (token) => {
      expect(parseRitualCommand(token)).toEqual({
        subcommand: token,
        rawArgument: token,
      });
    },
  );

  it.each([
    ["MORNING", "morning"],
    ["Weekly", "weekly"],
    ["MONTHLY ", "monthly"],
    ["Help", "help"],
  ] as const)(
    "is case-insensitive — '%s' → '%s'",
    (input, expectedSubcommand) => {
      const result = parseRitualCommand(input);
      expect(result.subcommand).toBe(expectedSubcommand);
    },
  );

  it("ignores trailing tokens — only first one wins", () => {
    const result = parseRitualCommand("morning  --foo bar");
    expect(result.subcommand).toBe("morning");
    expect(result.rawArgument).toBe("morning  --foo bar");
  });

  it("returns unknown + Ukrainian error for an unrecognized token", () => {
    const result = parseRitualCommand("daily");
    expect(result.subcommand).toBe("unknown");
    expect(result.error).toMatch(/Невідомий режим/);
    expect(result.error).toContain("«daily»");
    expect(result.error).toContain("morning");
  });

  it("treats Cyrillic input as unknown (Telegram /^[a-z0-9_]/ contract)", () => {
    const result = parseRitualCommand("ранок");
    expect(result.subcommand).toBe("unknown");
    expect(result.error).toBeDefined();
  });
});

describe("RITUAL_HELP_TEXT", () => {
  it("lists every supported subcommand", () => {
    expect(RITUAL_HELP_TEXT).toContain("/ritual morning");
    expect(RITUAL_HELP_TEXT).toContain("/ritual weekly");
    expect(RITUAL_HELP_TEXT).toContain("/ritual monthly");
    expect(RITUAL_HELP_TEXT).toContain("/ritual help");
  });

  it("flags weekly + monthly as not-yet-implemented", () => {
    expect(RITUAL_HELP_TEXT).toMatch(/weekly[\s\S]*ще не зашиплено/);
    expect(RITUAL_HELP_TEXT).toMatch(/monthly[\s\S]*ще не зашиплено/);
  });

  it("references the cron schedule so founder knows /ritual is for ad-hoc", () => {
    expect(RITUAL_HELP_TEXT).toContain("07:00 Kyiv");
    expect(RITUAL_HELP_TEXT).toContain("WF-25");
  });

  it("is HTML-safe (no raw '[' / ']' outside <code> blocks)", () => {
    // HELP_TEXT у `handler-constants.ts` навмисно HTML — Markdown ламається
    // на [tool] tokens. Make sure the same constraint holds тут.
    const withoutCode = RITUAL_HELP_TEXT.replace(/<code>[^<]*<\/code>/g, "");
    expect(withoutCode).not.toMatch(/[[\]]/);
  });
});

describe("formatRitualNotImplemented", () => {
  it("renders weekly with the 'Weekly review' label + O3 roadmap pointer", () => {
    const out = formatRitualNotImplemented("weekly");
    expect(out).toContain("Weekly review");
    expect(out).toContain("ще не зашиплено");
    expect(out).toContain("O3");
    expect(out).toContain("docs/planning/sprint-roadmap-q2q3-2026.md");
  });

  it("renders monthly with the 'Monthly OKR' label", () => {
    const out = formatRitualNotImplemented("monthly");
    expect(out).toContain("Monthly OKR");
    expect(out).toContain("ще не зашиплено");
  });

  it("always points to morning as the working alternative", () => {
    for (const mode of ["weekly", "monthly"] as const) {
      expect(formatRitualNotImplemented(mode)).toContain("/ritual morning");
    }
  });
});

describe("formatRitualMorningReply", () => {
  it("passes through markdown verbatim when non-empty", () => {
    const reply = formatRitualMorningReply({
      markdown: "# Briefing\n\nMRR: $5,000",
      data: {},
    });
    expect(reply).toBe("# Briefing\n\nMRR: $5,000");
  });

  it("falls back to defensive note when markdown is missing", () => {
    expect(formatRitualMorningReply({ data: {} })).toMatch(
      /Briefing зібрано.*markdown-payload порожній/,
    );
  });

  it("falls back to defensive note when markdown is empty string", () => {
    expect(formatRitualMorningReply({ markdown: "", data: {} })).toMatch(
      /Briefing зібрано.*markdown-payload порожній/,
    );
  });

  it("falls back when markdown is whitespace-only", () => {
    expect(formatRitualMorningReply({ markdown: "   \n  ", data: {} })).toMatch(
      /порожній/,
    );
  });

  it("falls back when markdown is non-string (defensive against schema drift)", () => {
    // Server might one day return numeric payload — defensive coding.
    const reply = formatRitualMorningReply({
      markdown: 42 as unknown as string,
      data: {},
    });
    expect(reply).toMatch(/порожній/);
  });
});

describe("formatRitualEndpointFailure", () => {
  it("includes the HTTP status code", () => {
    expect(formatRitualEndpointFailure(500)).toContain("HTTP 500");
    expect(formatRitualEndpointFailure(429)).toContain("HTTP 429");
  });

  it("points operator to Sentry / Railway / WF-98 errorWorkflow", () => {
    const reply = formatRitualEndpointFailure(503);
    expect(reply).toContain("Sentry");
    expect(reply).toContain("Railway");
    expect(reply).toContain("WF-98");
  });
});
