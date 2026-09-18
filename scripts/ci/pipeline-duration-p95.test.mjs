// Runs under `node --test` (root `pnpm test:scripts`), not vitest — the
// vitest import this file used to carry made it crash under the node runner
// (`Cannot read properties of undefined (reading 'config')`).
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/** Мінімальний expect-шим: рівно ті матчери, які використовує цей файл. */
function expect(actual) {
  return {
    toBe: (expected) => assert.equal(actual, expected),
    toContain: (expected) =>
      assert.ok(
        actual.includes(expected),
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
      ),
    toHaveLength: (n) => assert.equal(actual.length, n),
    toHaveBeenCalledOnce: () => assert.equal(actual.mock.callCount(), 1),
    not: {
      toContain: (expected) =>
        assert.ok(
          !actual.includes(expected),
          `expected ${JSON.stringify(actual)} NOT to contain ${JSON.stringify(expected)}`,
        ),
    },
  };
}
import {
  percentile,
  formatDuration,
  deviation,
  sparkline,
  computeStats,
  renderMarkdown,
  durationSeconds,
  fetchWorkflowRuns,
  fetchRunJobs,
} from "./pipeline-duration-p95.mjs";

// ─── percentile() ─────────────────────────────────────────────────

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the only element for single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it("computes p50 on an even-sized array", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(50);
  });

  it("computes p95 on a 20-element array", () => {
    // sorted 1..20
    const sorted = Array.from({ length: 20 }, (_, i) => i + 1);
    // p95 → ceil(0.95 * 20) - 1 = 19 - 1 = 18 → sorted[18] = 19
    expect(percentile(sorted, 95)).toBe(19);
  });

  it("computes p99 on a 100-element array", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    // p99 → ceil(0.99 * 100) - 1 = 99 - 1 = 98 → sorted[98] = 99
    expect(percentile(sorted, 99)).toBe(99);
  });

  it("handles all-identical values", () => {
    const sorted = [5, 5, 5, 5, 5];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(5);
    expect(percentile(sorted, 99)).toBe(5);
  });
});

// ─── formatDuration() ─────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("handles negative values gracefully", () => {
    expect(formatDuration(-10)).toBe("0s");
  });
});

// ─── deviation() ──────────────────────────────────────────────────

describe("deviation", () => {
  it("shows positive deviation", () => {
    expect(deviation(112, 100)).toBe("+12.0%");
  });

  it("shows negative deviation", () => {
    expect(deviation(97, 100)).toBe("-3.0%");
  });

  it("shows zero deviation", () => {
    expect(deviation(100, 100)).toBe("+0.0%");
  });

  it("returns N/A when baseline is 0", () => {
    expect(deviation(42, 0)).toBe("N/A");
  });
});

// ─── sparkline() ──────────────────────────────────────────────────

describe("sparkline", () => {
  it("returns empty string for empty array", () => {
    expect(sparkline([])).toBe("");
  });

  it("returns block chars for varied values", () => {
    const result = sparkline([1, 5, 3, 8, 2]);
    expect(result).toHaveLength(5);
    // Each char should be a block character
    for (const ch of result) {
      expect("▁▂▃▄▅▆▇█").toContain(ch);
    }
  });

  it("handles all-same values", () => {
    const result = sparkline([5, 5, 5]);
    expect(result).toHaveLength(3);
  });
});

// ─── computeStats() ──────────────────────────────────────────────

describe("computeStats", () => {
  it("computes p50/p95/p99 from unsorted input", () => {
    const durations = Array.from({ length: 100 }, (_, i) => i + 1);
    // shuffle
    durations.sort(() => Math.random() - 0.5);

    const stats = computeStats(durations);
    expect(stats.p50).toBe(50);
    expect(stats.p95).toBe(95);
    expect(stats.p99).toBe(99);
  });

  it("handles single value", () => {
    const stats = computeStats([120]);
    expect(stats.p50).toBe(120);
    expect(stats.p95).toBe(120);
    expect(stats.p99).toBe(120);
  });
});

// ─── durationSeconds() ───────────────────────────────────────────

describe("durationSeconds", () => {
  it("computes difference in seconds", () => {
    expect(
      durationSeconds("2026-04-27T10:00:00Z", "2026-04-27T10:05:30Z"),
    ).toBe(330);
  });
});

// ─── renderMarkdown() ────────────────────────────────────────────

describe("renderMarkdown", () => {
  const baseData = {
    totalStats: { p50: 180, p95: 360, p99: 420 },
    currentTotal: 300,
    jobStats: {
      check: { p50: 60, p95: 120, p99: 150 },
      coverage: { p50: 90, p95: 180, p99: 210 },
    },
    currentJobs: { check: 70, coverage: 100 },
    recentTotals: [200, 250, 300, 280, 350],
    runCount: 50,
  };

  it("includes marker comment", () => {
    const md = renderMarkdown(baseData);
    expect(md).toContain("<!-- ci-pipeline-duration-summary -->");
  });

  it("includes overall p50/p95/p99 table", () => {
    const md = renderMarkdown(baseData);
    expect(md).toContain("| p50 | 3m 0s |");
    expect(md).toContain("| p95 | 6m 0s |");
    expect(md).toContain("| p99 | 7m 0s |");
  });

  it("includes current run and deviation", () => {
    const md = renderMarkdown(baseData);
    expect(md).toContain("| **Current run** | **5m 0s** |");
    expect(md).toContain("| vs p95 | -16.7% |");
  });

  it("includes per-job breakdown table", () => {
    const md = renderMarkdown(baseData);
    expect(md).toContain("| check |");
    expect(md).toContain("| coverage |");
  });

  it("includes trend sparkline", () => {
    const md = renderMarkdown(baseData);
    expect(md).toContain("Trend (last 5 runs):");
  });

  it("shows warning when current exceeds p95 + 20%", () => {
    const overData = {
      ...baseData,
      currentTotal: 500, // 500 > 360 * 1.2 = 432
    };
    const md = renderMarkdown(overData);
    expect(md).toContain("Warning:");
    expect(md).toContain("exceeds p95 + 20% threshold");
  });

  it("does NOT show warning when current is within p95 + 20%", () => {
    const md = renderMarkdown(baseData);
    expect(md).not.toContain("Warning:");
  });

  it("handles empty job stats gracefully", () => {
    const emptyJobData = {
      ...baseData,
      jobStats: {},
      currentJobs: {},
    };
    const md = renderMarkdown(emptyJobData);
    expect(md).toContain("<!-- ci-pipeline-duration-summary -->");
    expect(md).not.toContain("Per-Job Breakdown");
  });
});

// ─── fetchWorkflowRuns() with mocked fetch ──────────────────────

describe("fetchWorkflowRuns", () => {
  it("calls correct URL and returns workflow_runs", async () => {
    const mockRuns = [
      {
        id: 1,
        created_at: "2026-04-27T10:00:00Z",
        updated_at: "2026-04-27T10:05:00Z",
        run_started_at: "2026-04-27T10:00:00Z",
      },
      {
        id: 2,
        created_at: "2026-04-27T09:00:00Z",
        updated_at: "2026-04-27T09:04:00Z",
        run_started_at: "2026-04-27T09:00:00Z",
      },
    ];

    const fetchSpy = mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({ workflow_runs: mockRuns }),
    }));

    const result = await fetchWorkflowRuns(
      "owner/repo",
      "ci.yml",
      "fake-token",
      50,
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0].arguments[0];
    expect(calledUrl).toContain(
      "/repos/owner/repo/actions/workflows/ci.yml/runs",
    );
    expect(calledUrl).toContain("status=success");

    fetchSpy.mock.restore();
  });
});

describe("fetchRunJobs", () => {
  it("calls correct URL and returns jobs", async () => {
    const mockJobs = [
      {
        name: "check",
        started_at: "2026-04-27T10:00:00Z",
        completed_at: "2026-04-27T10:02:00Z",
        status: "completed",
        conclusion: "success",
      },
    ];

    const fetchSpy = mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({ jobs: mockJobs }),
    }));

    const result = await fetchRunJobs("owner/repo", 123, "fake-token");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("check");

    const calledUrl = fetchSpy.mock.calls[0].arguments[0];
    expect(calledUrl).toContain("/repos/owner/repo/actions/runs/123/jobs");

    fetchSpy.mock.restore();
  });
});
