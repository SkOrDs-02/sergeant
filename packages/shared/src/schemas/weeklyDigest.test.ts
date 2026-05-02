import { describe, expect, it } from "vitest";
import {
  WeeklyDigestReportSchema,
  WeeklyDigestSuccessSchema,
  WeeklyDigestErrorSchema,
  WeeklyDigestResponseSchema,
} from "./api";

/**
 * Lock `POST /api/weekly-digest` response contract (AGENTS.md Hard Rule #3).
 * The server validates Claude's JSON against these schemas before emitting
 * the 200 response, so any drift in the prompt output → here becomes a
 * 502 at the edge, not a typed lie reaching the UI.
 */

const EMPTY_BLOCK = {
  summary: "Нічого не відбулось.",
  comment: "Даних за тиждень немає.",
  recommendations: [],
};
const VALID_REPORT = {
  finyk: EMPTY_BLOCK,
  fizruk: EMPTY_BLOCK,
  nutrition: EMPTY_BLOCK,
  routine: EMPTY_BLOCK,
  overallRecommendations: ["Пиши кожен день."],
};

describe("WeeklyDigestReportSchema", () => {
  it("accepts a fully-populated report", () => {
    const parsed = WeeklyDigestReportSchema.parse(VALID_REPORT);
    expect(parsed.finyk?.summary).toBe("Нічого не відбулось.");
    expect(parsed.overallRecommendations).toHaveLength(1);
  });

  it("accepts null module blocks (prompt's 'no data → null' contract)", () => {
    const parsed = WeeklyDigestReportSchema.parse({
      finyk: null,
      fizruk: null,
      nutrition: VALID_REPORT.nutrition,
      routine: null,
      overallRecommendations: [],
    });
    expect(parsed.finyk).toBeNull();
    expect(parsed.nutrition).not.toBeNull();
  });

  it("rejects an empty overallRecommendations key being absent", () => {
    const { overallRecommendations: _oa, ...rest } = VALID_REPORT;
    void _oa;
    expect(() => WeeklyDigestReportSchema.parse(rest)).toThrow();
  });

  it("rejects a module block missing `recommendations`", () => {
    expect(() =>
      WeeklyDigestReportSchema.parse({
        ...VALID_REPORT,
        finyk: { summary: "s", comment: "c" },
      }),
    ).toThrow();
  });

  it("caps per-recommendation length and per-block count (prompt-injection guardrail)", () => {
    const tooLong = "x".repeat(501);
    expect(() =>
      WeeklyDigestReportSchema.parse({
        ...VALID_REPORT,
        finyk: {
          summary: "ok",
          comment: "ok",
          recommendations: [tooLong],
        },
      }),
    ).toThrow();

    const tooMany = Array.from({ length: 21 }, (_, i) => `rec ${i}`);
    expect(() =>
      WeeklyDigestReportSchema.parse({
        ...VALID_REPORT,
        finyk: {
          summary: "ok",
          comment: "ok",
          recommendations: tooMany,
        },
      }),
    ).toThrow();
  });
});

describe("WeeklyDigestSuccessSchema", () => {
  it("wraps a valid report + ISO generatedAt", () => {
    const parsed = WeeklyDigestSuccessSchema.parse({
      report: VALID_REPORT,
      generatedAt: "2026-04-29T12:00:00.000Z",
    });
    expect(parsed.generatedAt).toMatch(/^\d{4}/);
  });

  it("rejects empty generatedAt", () => {
    expect(() =>
      WeeklyDigestSuccessSchema.parse({
        report: VALID_REPORT,
        generatedAt: "",
      }),
    ).toThrow();
  });

  it("rejects a response with report omitted (must be explicit envelope)", () => {
    expect(() =>
      WeeklyDigestSuccessSchema.parse({
        generatedAt: "2026-04-29T12:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("WeeklyDigestErrorSchema", () => {
  it("requires a non-empty error string", () => {
    expect(
      WeeklyDigestErrorSchema.parse({ error: "Quota exceeded" }).error,
    ).toBe("Quota exceeded");
    expect(() => WeeklyDigestErrorSchema.parse({ error: "" })).toThrow();
  });
});

describe("WeeklyDigestResponseSchema", () => {
  it("matches the success variant", () => {
    const parsed = WeeklyDigestResponseSchema.parse({
      report: VALID_REPORT,
      generatedAt: "2026-04-29T12:00:00.000Z",
    });
    expect("report" in parsed).toBe(true);
  });

  it("matches the error variant", () => {
    const parsed = WeeklyDigestResponseSchema.parse({
      error: "Сервіс недоступний",
    });
    expect("error" in parsed).toBe(true);
  });

  it("rejects a shape that is neither success nor error", () => {
    expect(() =>
      WeeklyDigestResponseSchema.parse({ somethingElse: 1 }),
    ).toThrow();
  });
});
