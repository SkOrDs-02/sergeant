/**
 * O3 (Phase 2.B) — builder integration tests для monthly OKR review.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StubProvider } from "../../../lib/llm/provider.js";

vi.mock("../tools.js", () => ({
  getSentryIssues: vi.fn(),
}));

vi.mock("../code-tools.js", () => ({
  githubPrs: vi.fn(),
}));

import { githubPrs } from "../code-tools.js";
import { getSentryIssues } from "../tools.js";
import { assembleMonthlyOkrReview } from "./builder.js";
import type { Okr } from "./okrs.js";

const mockedSentry = vi.mocked(getSentryIssues);
const mockedGithubPrs = vi.mocked(githubPrs);

// 2026-06-01 09:00 Kyiv = 06:00 UTC. Reporting month should be 2026-05.
const NOW_MS = Date.parse("2026-06-01T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const TEST_OKRS: readonly Okr[] = [
  {
    id: "test-okr",
    quarter: "Q2 2026",
    objective: "Test goal",
    krs: [
      {
        label: "Paying users",
        target: 50,
        current: 25,
        unit: "users",
        source: "stripe",
      },
      {
        label: "MRR",
        target: 10000,
        current: 5000,
        unit: "₴/mo",
        source: "stripe",
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedSentry.mockResolvedValue({
    issues: [
      {
        title: "Issue 1",
        level: "error",
        count: "10",
        permalink: "https://sentry.io/issues/1/",
      },
    ],
  });
  mockedGithubPrs.mockImplementation((input) => {
    if (input.state === "closed") {
      return Promise.resolve({
        url: "x",
        status: 200,
        body: [
          {
            number: 101,
            title: "merged 5 days ago",
            html_url: "https://github.com/x/y/pull/101",
            merged_at: new Date(NOW_MS - 5 * DAY).toISOString(),
            closed_at: new Date(NOW_MS - 5 * DAY).toISOString(),
            user: { login: "alice" },
          },
          {
            number: 50,
            title: "merged 60 days ago",
            html_url: "https://github.com/x/y/pull/50",
            merged_at: new Date(NOW_MS - 60 * DAY).toISOString(),
            closed_at: new Date(NOW_MS - 60 * DAY).toISOString(),
          },
        ],
      });
    }
    return Promise.resolve({
      url: "x",
      status: 200,
      body: [
        {
          number: 200,
          title: "fresh",
          html_url: "https://github.com/x/y/pull/200",
          created_at: new Date(NOW_MS - 10 * DAY).toISOString(),
        },
        {
          number: 201,
          title: "very stale",
          html_url: "https://github.com/x/y/pull/201",
          created_at: new Date(NOW_MS - 45 * DAY).toISOString(),
        },
      ],
    });
  });
});

describe("assembleMonthlyOkrReview — happy path", () => {
  it("computes per-OKR + avg progress correctly", async () => {
    const provider = new StubProvider({ text: "Stub narrative." });
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.progress.okrs).toHaveLength(1);
    expect(result.data.progress.okrs[0]?.progressPct).toBe(50);
    expect(result.data.progress.okrs[0]?.krs[0]?.progressPct).toBe(50);
    expect(result.data.progress.okrs[0]?.krs[1]?.progressPct).toBe(50);
  });

  it("derives reporting month from previous month in Kyiv", async () => {
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS },
      { provider },
    );
    expect(result.data.reportingMonth).toBe("2026-05");
  });

  it("filters merged PRs to past 30 days only", async () => {
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.wins.mergedCount).toBe(1);
    expect(result.data.wins.topMerged?.[0]?.number).toBe(101);
  });

  it("marks stale PRs older than 30 days", async () => {
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.risks.staleCommitmentsCount).toBe(1);
    expect(result.data.risks.topBlockers).toBeDefined();
    const stalePr = result.data.risks.topBlockers?.find(
      (b) => b.kind === "stale_pr",
    );
    expect(stalePr?.title).toContain("#201");
  });

  it("includes sentry blockers in topBlockers", async () => {
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.risks.sentryUnresolvedCount).toBe(1);
    const sentryBlocker = result.data.risks.topBlockers?.find(
      (b) => b.kind === "sentry",
    );
    expect(sentryBlocker?.title).toBe("Issue 1");
  });

  it("renders LLM narrative when provider returns non-empty", async () => {
    const provider = new StubProvider({ text: "LLM said this." });
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.narrative.source).toBe("llm");
    expect(result.data.narrative.text).toBe("LLM said this.");
  });
});

describe("assembleMonthlyOkrReview — fallback paths", () => {
  it("falls back to template narrative when LLM text empty", async () => {
    const provider = new StubProvider({ text: "   " });
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider, fallbackOnError: true },
    );
    expect(result.data.narrative.source).toBe("template");
    expect(result.data.narrative.text).toContain("Avg OKR progress");
  });

  it("marks wins notConfigured on GitHub failure", async () => {
    mockedGithubPrs.mockResolvedValue({
      url: "x",
      status: 401,
      body: { message: "Bad credentials" },
    });
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.wins.notConfigured).toBe(true);
  });

  it("survives Sentry rejection without throwing", async () => {
    mockedSentry.mockRejectedValueOnce(new Error("timeout"));
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS, okrsOverride: TEST_OKRS },
      { provider },
    );
    expect(result.data.risks.note).toContain("Sentry-запит відхилений");
  });

  it("uses INTERIM_OKRS by default when no override supplied", async () => {
    const provider = new StubProvider();
    const result = await assembleMonthlyOkrReview(
      { nowMs: NOW_MS },
      { provider },
    );
    expect(result.data.progress.okrs.length).toBeGreaterThanOrEqual(2);
    expect(result.data.progress.note).toContain("Interim hardcoded OKR");
  });
});
