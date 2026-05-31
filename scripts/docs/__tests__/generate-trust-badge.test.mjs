// scripts/docs/__tests__/generate-trust-badge.test.mjs
//
// Unit tests for the pure helpers in generate-trust-badge.mjs. Live `gh`
// is NOT invoked — getCronHealth() accepts a runListImpl injection point
// so tests pass deterministic JSON without shelling out.
//
//   node --test scripts/docs/__tests__/generate-trust-badge.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MONITORED_WORKFLOWS,
  computeTrust,
  countConsecutiveFailures,
  getCronHealth,
  renderBlock,
  spliceReadme,
} from "../generate-trust-badge.mjs";

// ── countConsecutiveFailures ────────────────────────────────────────────

describe("countConsecutiveFailures", () => {
  it("returns 0 for empty list", () => {
    assert.equal(countConsecutiveFailures([]), 0);
  });

  it("returns 0 when newest run is success", () => {
    assert.equal(
      countConsecutiveFailures([
        { conclusion: "success" },
        { conclusion: "failure" },
        { conclusion: "failure" },
      ]),
      0,
    );
  });

  it("counts trailing failures + cancelled (newest first)", () => {
    assert.equal(
      countConsecutiveFailures([
        { conclusion: "failure" },
        { conclusion: "cancelled" },
        { conclusion: "failure" },
        { conclusion: "success" },
        { conclusion: "failure" },
      ]),
      3,
    );
  });

  it("breaks streak on neutral / skipped", () => {
    assert.equal(
      countConsecutiveFailures([
        { conclusion: "failure" },
        { conclusion: "skipped" },
        { conclusion: "failure" },
      ]),
      1,
    );
  });

  it("counts the whole list when all failed", () => {
    assert.equal(
      countConsecutiveFailures(
        Array.from({ length: 13 }, () => ({ conclusion: "failure" })),
      ),
      13,
    );
  });
});

// ── getCronHealth ───────────────────────────────────────────────────────

describe("getCronHealth", () => {
  it("aggregates per-workflow streaks across MONITORED_WORKFLOWS", () => {
    const fakeRuns = {
      "docs-daily-brief.yml": [
        { conclusion: "failure" },
        { conclusion: "failure" },
        { conclusion: "success" },
      ],
      "changelog-auto-cut.yml": [{ conclusion: "success" }],
    };
    const result = getCronHealth({
      runListImpl: (wf) => fakeRuns[wf] ?? [],
    });
    assert.equal(result.available, true);
    assert.equal(result.workflows.length, MONITORED_WORKFLOWS.length);
    const dbb = result.workflows.find(
      (w) => w.workflow === "docs-daily-brief.yml",
    );
    assert.equal(dbb.consecutiveFailures, 2);
    const cac = result.workflows.find(
      (w) => w.workflow === "changelog-auto-cut.yml",
    );
    assert.equal(cac.consecutiveFailures, 0);
  });

  it("degrades gracefully when probe throws", () => {
    const result = getCronHealth({
      runListImpl: () => {
        throw new Error("gh: command not found");
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.workflows.length, 0);
    assert.match(result.reason, /gh: command not found/);
  });

  it("degrades gracefully when probe returns non-array", () => {
    const result = getCronHealth({ runListImpl: () => ({}) });
    assert.equal(result.available, false);
    assert.match(result.reason, /unexpected gh output/);
  });
});

// ── computeTrust ────────────────────────────────────────────────────────

describe("computeTrust", () => {
  const noCron = { available: false, workflows: [] };
  const cleanCron = {
    available: true,
    workflows: MONITORED_WORKFLOWS.map((w) => ({
      workflow: w,
      consecutiveFailures: 0,
      totalSeen: 5,
    })),
  };

  it("healthy when everything zero (cron unavailable counts as no signal)", () => {
    const t = computeTrust({
      wipRows: [],
      overdueCount: 0,
      cronHealth: noCron,
    });
    assert.equal(t.status, "healthy");
    assert.equal(t.cronStatus, "healthy");
    assert.equal(t.cronSummary, null);
  });

  it("healthy when cron probe is clean", () => {
    const t = computeTrust({
      wipRows: [],
      overdueCount: 0,
      cronHealth: cleanCron,
    });
    assert.equal(t.status, "healthy");
  });

  it("warning when exactly one workflow has 2 consecutive failures", () => {
    const cron = {
      available: true,
      workflows: [
        {
          workflow: "docs-daily-brief.yml",
          consecutiveFailures: 2,
          totalSeen: 5,
        },
        {
          workflow: "changelog-auto-cut.yml",
          consecutiveFailures: 0,
          totalSeen: 5,
        },
      ],
    };
    const t = computeTrust({ wipRows: [], overdueCount: 0, cronHealth: cron });
    assert.equal(t.status, "warning");
    assert.equal(t.cronStatus, "warning");
    assert.match(t.cronSummary, /docs-daily-brief\.yml failed 2/);
  });

  it("critical when one workflow has ≥3 consecutive failures", () => {
    const cron = {
      available: true,
      workflows: [
        {
          workflow: "docs-daily-brief.yml",
          consecutiveFailures: 13,
          totalSeen: 13,
        },
        {
          workflow: "changelog-auto-cut.yml",
          consecutiveFailures: 0,
          totalSeen: 5,
        },
      ],
    };
    const t = computeTrust({ wipRows: [], overdueCount: 0, cronHealth: cron });
    assert.equal(t.status, "critical");
    assert.equal(t.cronStatus, "critical");
    assert.match(t.cronSummary, /docs-daily-brief\.yml failed 13/);
  });

  it("critical when two workflows are at warning-or-worse", () => {
    const cron = {
      available: true,
      workflows: [
        {
          workflow: "docs-daily-brief.yml",
          consecutiveFailures: 2,
          totalSeen: 5,
        },
        {
          workflow: "changelog-auto-cut.yml",
          consecutiveFailures: 2,
          totalSeen: 5,
        },
      ],
    };
    const t = computeTrust({ wipRows: [], overdueCount: 0, cronHealth: cron });
    assert.equal(t.status, "critical");
    assert.match(t.cronSummary, /\+1 more/);
  });

  it("stays critical when WIP > 1 even if cron is clean", () => {
    const wipRows = [{ severity: "warn" }, { severity: "warn" }];
    const t = computeTrust({ wipRows, overdueCount: 0, cronHealth: cleanCron });
    assert.equal(t.status, "critical");
  });

  it("escalates to critical when cron-fail-streak is the only red flag", () => {
    const cron = {
      available: true,
      workflows: [
        {
          workflow: "docs-daily-brief.yml",
          consecutiveFailures: 5,
          totalSeen: 5,
        },
        {
          workflow: "changelog-auto-cut.yml",
          consecutiveFailures: 0,
          totalSeen: 5,
        },
      ],
    };
    const t = computeTrust({ wipRows: [], overdueCount: 0, cronHealth: cron });
    assert.equal(t.status, "critical");
  });
});

// ── renderBlock ─────────────────────────────────────────────────────────

describe("renderBlock", () => {
  it("includes cron warning line when cronSummary is present", () => {
    const block = renderBlock({
      status: "warning",
      overdueCount: 0,
      violations: 0,
      cronStatus: "warning",
      cronSummary: "docs-daily-brief.yml failed 2× поспіль",
    });
    assert.match(block, /Cron health: docs-daily-brief\.yml failed 2/);
  });

  it("omits cron line entirely when cronSummary is null", () => {
    const block = renderBlock({
      status: "healthy",
      overdueCount: 0,
      violations: 0,
      cronStatus: "healthy",
      cronSummary: null,
    });
    assert.equal(block.includes("Cron health"), false);
  });
});

// ── spliceReadme ────────────────────────────────────────────────────────

describe("spliceReadme", () => {
  it("replaces content between markers", () => {
    const before = [
      "# README",
      "",
      "<!-- TRUST-BADGE:START -->",
      "old content",
      "<!-- TRUST-BADGE:END -->",
      "",
      "tail",
    ].join("\n");
    const next = spliceReadme(
      before,
      "<!-- TRUST-BADGE:START -->\nNEW\n<!-- TRUST-BADGE:END -->",
    );
    assert.match(next, /NEW/);
    assert.equal(next.includes("old content"), false);
    assert.match(next, /tail$/);
  });

  it("throws when markers are missing", () => {
    assert.throws(
      () => spliceReadme("# README\nno markers", "x"),
      /markers not found/,
    );
  });

  it("throws when markers are out of order", () => {
    const reversed = [
      "<!-- TRUST-BADGE:END -->",
      "content",
      "<!-- TRUST-BADGE:START -->",
    ].join("\n");
    assert.throws(() => spliceReadme(reversed, "x"), /out of order/);
  });
});
