/**
 * O3 (Phase 2.B) — builder integration tests. Mockа кожна джерельна
 * функція (Stripe / PostHog / GitHub PRs / Sentry) через `vi.mock` —
 * перевіряємо що mapper-и коректно мапять, fallback на narrative
 * стабільний, і shipped/open mapping filtersять за `closed_at`/
 * `created_at`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StubProvider } from "../../../lib/llm/provider.js";

vi.mock("../tools.js", () => ({
  getStripeMetrics: vi.fn(),
  getSentryIssues: vi.fn(),
}));

vi.mock("../code-tools.js", () => ({
  githubPrs: vi.fn(),
}));

import { githubPrs } from "../code-tools.js";
import { getSentryIssues, getStripeMetrics } from "../tools.js";
import { assembleWeeklyReview } from "./builder.js";

const mockedStripe = vi.mocked(getStripeMetrics);
const mockedSentry = vi.mocked(getSentryIssues);
const mockedGithubPrs = vi.mocked(githubPrs);

// 2026-05-15 18:00 UTC, день generation-у (Friday 18:00 Kyiv).
const NOW_MS = Date.parse("2026-05-15T18:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mockedStripe.mockResolvedValue({
    windowDays: 7,
    successfulCount: 28,
    failedCount: 1,
    grossAmountUah: 12_000,
  });
  mockedSentry.mockResolvedValue({
    issues: [
      {
        title: "TypeError: foo",
        level: "error",
        count: "5",
        permalink: "https://sentry.io/issues/1/",
      },
    ],
  });
  mockedGithubPrs.mockImplementation((input) => {
    if (input.state === "closed") {
      return Promise.resolve({
        url: "https://api.github.com/…/pulls?state=closed",
        status: 200,
        body: [
          {
            number: 101,
            title: "merged this week",
            html_url: "https://github.com/x/y/pull/101",
            closed_at: new Date(NOW_MS - 2 * DAY).toISOString(),
            merged_at: new Date(NOW_MS - 2 * DAY).toISOString(),
            user: { login: "alice" },
          },
          {
            number: 102,
            title: "closed but not merged",
            html_url: "https://github.com/x/y/pull/102",
            closed_at: new Date(NOW_MS - 1 * DAY).toISOString(),
            merged_at: null,
          },
          {
            number: 50,
            title: "merged 30 days ago — out of window",
            html_url: "https://github.com/x/y/pull/50",
            closed_at: new Date(NOW_MS - 30 * DAY).toISOString(),
            merged_at: new Date(NOW_MS - 30 * DAY).toISOString(),
          },
        ],
      });
    }
    // open
    return Promise.resolve({
      url: "https://api.github.com/…/pulls?state=open",
      status: 200,
      body: [
        {
          number: 200,
          title: "fresh open",
          html_url: "https://github.com/x/y/pull/200",
          created_at: new Date(NOW_MS - 2 * DAY).toISOString(),
        },
        {
          number: 201,
          title: "stale open",
          html_url: "https://github.com/x/y/pull/201",
          created_at: new Date(NOW_MS - 14 * DAY).toISOString(),
        },
      ],
    });
  });
});

describe("assembleWeeklyReview — happy path with stub LLM", () => {
  it("returns markdown + structured data with LLM narrative", async () => {
    const provider = new StubProvider({ text: "Custom stub narrative." });
    const result = await assembleWeeklyReview({ nowMs: NOW_MS }, { provider });

    expect(result.markdown).toContain("📅 *Тижневий ритуал");
    expect(result.data.windowEnd).toBe("2026-05-15");
    expect(result.data.windowStart).toBe("2026-05-08");
    expect(result.data.narrative.source).toBe("llm");
    expect(result.data.narrative.text).toBe("Custom stub narrative.");
  });

  it("filters merged PRs by closed_at window (excludes 30-days-ago PR)", async () => {
    const provider = new StubProvider();
    const result = await assembleWeeklyReview({ nowMs: NOW_MS }, { provider });
    expect(result.data.shipped.mergedCount).toBe(1);
    expect(result.data.shipped.closedCount).toBe(1);
    expect(result.data.shipped.topMerged?.[0]?.number).toBe(101);
    expect(result.data.shipped.topMerged?.[0]?.author).toBe("alice");
  });

  it("marks stale open PRs older than staleDays", async () => {
    const provider = new StubProvider();
    const result = await assembleWeeklyReview(
      { nowMs: NOW_MS, staleDays: 7 },
      { provider },
    );
    expect(result.data.openCommitments.openCount).toBe(2);
    expect(result.data.openCommitments.staleCount).toBe(1);
    expect(result.data.openCommitments.staleTop?.[0]?.number).toBe(201);
    expect(result.data.openCommitments.staleTop?.[0]?.ageDays).toBe(14);
  });

  it("computes metrics delta with cumulative-prev arithmetic", async () => {
    // Mock returns different gross/count per `days` — emulates cumulative
    // `2*windowDays` being twice as big.
    mockedStripe.mockImplementation((input) => {
      const days = input.days ?? 7;
      return Promise.resolve({
        windowDays: days,
        successfulCount: days === 7 ? 28 : 50,
        failedCount: 1,
        grossAmountUah: days === 7 ? 12_000 : 20_000,
      });
    });
    const provider = new StubProvider();
    const result = await assembleWeeklyReview({ nowMs: NOW_MS }, { provider });
    expect(result.data.metrics.successCountThis).toBe(28);
    expect(result.data.metrics.successCountPrev).toBe(22);
    expect(result.data.metrics.grossUahThis).toBe(12_000);
    expect(result.data.metrics.grossUahPrev).toBe(8_000);
  });
});

describe("assembleWeeklyReview — fallback branches", () => {
  it("falls back to template narrative when LLM returns empty text", async () => {
    const provider = new StubProvider({ text: "" });
    const result = await assembleWeeklyReview(
      { nowMs: NOW_MS },
      { provider, fallbackOnError: true },
    );
    expect(result.data.narrative.source).toBe("template");
    expect(result.data.narrative.text.length).toBeGreaterThan(0);
  });

  it("marks all sources notConfigured when subsystems flag it", async () => {
    mockedStripe.mockResolvedValue({ notConfigured: true });
    mockedSentry.mockResolvedValue({ notConfigured: true });
    mockedGithubPrs.mockResolvedValue({
      url: "x",
      status: 401,
      body: { message: "Bad credentials" },
    });
    const provider = new StubProvider({ text: "Note narrative." });
    const result = await assembleWeeklyReview({ nowMs: NOW_MS }, { provider });
    expect(result.data.shipped.notConfigured).toBe(true);
    expect(result.data.openCommitments.notConfigured).toBe(true);
    expect(result.data.metrics.notConfigured).toBe(true);
    expect(result.data.alerts.notConfigured).toBe(true);
    // narrative still runs because stub-provider doesn't care about sources
    expect(result.data.narrative.text).toBe("Note narrative.");
  });

  it("handles rejected Promise from a source without throwing", async () => {
    mockedSentry.mockRejectedValueOnce(new Error("network down"));
    const provider = new StubProvider();
    const result = await assembleWeeklyReview({ nowMs: NOW_MS }, { provider });
    expect(result.data.alerts.notConfigured).toBe(true);
  });
});
