import { describe, expect, it } from "vitest";
import { _internals } from "./builder.js";

/**
 * `builder.test.ts` exercises `assembleMorningBriefing()` end-to-end via
 * fetch-mocked routes. This file targets the pure helper functions exposed
 * through `_internals` directly — `sumPostHogTrend` and `parseGithubPrs`
 * shape-mismatch/fallback branches are otherwise hard to hit without a very
 * specific PostHog/GitHub response body, and `computeReportingDate` doesn't
 * need any fetch mocking at all.
 */

const { computeReportingDate, sumPostHogTrend, parseGithubPrs } = _internals;

describe("computeReportingDate", () => {
  it("returns the Kyiv-local day BEFORE `nowMs`", () => {
    // 2026-05-16T10:00:00Z = 2026-05-16 13:00 Kyiv (summer, UTC+3).
    // Reporting date is "yesterday" relative to Kyiv now → 2026-05-15.
    const nowMs = new Date("2026-05-16T10:00:00Z").getTime();
    expect(computeReportingDate(nowMs)).toBe("2026-05-15");
  });

  it("crosses the UTC day boundary correctly at the Kyiv midnight edge", () => {
    // 2026-05-16T21:30:00Z = 2026-05-17 00:30 Kyiv. Yesterday (Kyiv) is
    // 2026-05-16, even though subtracting 24h in UTC lands on 05-15T21:30Z.
    const nowMs = new Date("2026-05-16T21:30:00Z").getTime();
    expect(computeReportingDate(nowMs)).toBe("2026-05-16");
  });
});

describe("sumPostHogTrend", () => {
  it("returns null for a non-object body", () => {
    expect(sumPostHogTrend(null)).toBeNull();
    expect(sumPostHogTrend("not an object")).toBeNull();
    expect(sumPostHogTrend(42)).toBeNull();
  });

  it("returns null when result is missing or not an array", () => {
    expect(sumPostHogTrend({})).toBeNull();
    expect(sumPostHogTrend({ result: "nope" })).toBeNull();
    expect(sumPostHogTrend({ result: [] })).toBeNull();
  });

  it("returns null when the first series entry isn't an object", () => {
    expect(sumPostHogTrend({ result: [null] })).toBeNull();
    expect(sumPostHogTrend({ result: ["x"] })).toBeNull();
  });

  it("prefers aggregated_value when it's a finite number", () => {
    expect(
      sumPostHogTrend({ result: [{ aggregated_value: 12.4, count: 999 }] }),
    ).toBe(12);
  });

  it("falls back to count when aggregated_value is missing/non-finite", () => {
    expect(sumPostHogTrend({ result: [{ count: 7 }] })).toBe(7);
    expect(
      sumPostHogTrend({ result: [{ aggregated_value: NaN, count: 8.9 }] }),
    ).toBe(9);
  });

  it("falls back to summing a numeric data[] array when count is absent", () => {
    expect(sumPostHogTrend({ result: [{ data: [1, 2, 3.4] }] })).toBe(6);
  });

  it("returns null when no recognised numeric shape is present", () => {
    expect(sumPostHogTrend({ result: [{ data: ["a", "b"] }] })).toBeNull();
    expect(sumPostHogTrend({ result: [{ unrelated: true }] })).toBeNull();
  });
});

describe("parseGithubPrs", () => {
  it("returns [] for a non-array body", () => {
    expect(parseGithubPrs(null)).toEqual([]);
    expect(parseGithubPrs({})).toEqual([]);
    expect(parseGithubPrs("nope")).toEqual([]);
  });

  it("skips non-object rows", () => {
    expect(parseGithubPrs([null, "x", 42])).toEqual([]);
  });

  it("skips rows missing number/title/url", () => {
    expect(
      parseGithubPrs([
        { number: 1, title: "no url" },
        { title: "x", html_url: "y" },
      ]),
    ).toEqual([]);
  });

  it("excludes draft PRs from the queue", () => {
    expect(
      parseGithubPrs([
        { number: 1, title: "draft one", html_url: "u1", draft: true },
      ]),
    ).toEqual([]);
  });

  it("falls back to `url` when `html_url` is absent", () => {
    const out = parseGithubPrs([{ number: 5, title: "t", url: "u5" }]);
    expect(out).toEqual([
      { number: 5, title: "t", url: "u5", needsReview: true },
    ]);
  });

  it("marks needsReview=false when reviewers or teams are already requested", () => {
    const out = parseGithubPrs([
      {
        number: 1,
        title: "has reviewer",
        html_url: "u1",
        requested_reviewers: [{ login: "octocat" }],
        requested_teams: [],
      },
      {
        number: 2,
        title: "has team",
        html_url: "u2",
        requested_reviewers: [],
        requested_teams: [{ slug: "backend" }],
      },
    ]);
    expect(out.map((p) => p.needsReview)).toEqual([false, false]);
  });

  it("marks needsReview=true when neither reviewers nor teams are set", () => {
    const out = parseGithubPrs([
      { number: 3, title: "unassigned", html_url: "u3" },
    ]);
    expect(out[0]?.needsReview).toBe(true);
  });
});
