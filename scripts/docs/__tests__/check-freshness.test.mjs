// scripts/docs/__tests__/check-freshness.test.mjs
//
// Unit tests for the doc-freshness nightly script (audit PR-11.A).
// Run with: node --test scripts/docs/__tests__/check-freshness.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseHeader,
  addDays,
  effectiveNextReview,
  isOverdue,
  daysBetween,
  freshnessMarker,
  issueTitle,
  issueBody,
} from "../check-freshness.mjs";

// ── parseHeader ──────────────────────────────────────────────────────────────

describe("parseHeader", () => {
  it("parses canonical format with Last validated + Next review", () => {
    const content = [
      "# My Doc",
      "",
      "> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.",
      "",
      "Some content here.",
    ].join("\n");

    const result = parseHeader(content);
    assert.deepEqual(result, {
      lastValidated: "2026-04-27",
      nextReview: "2026-07-26",
      format: "canonical",
    });
  });

  it("parses legacy format (Last reviewed: YYYY-MM-DD)", () => {
    const content = [
      "# Agents in Sergeant",
      "",
      "> Last reviewed: 2026-04-27. Reviewer: @Skords-01",
      "",
      "## Repo overview",
    ].join("\n");

    const result = parseHeader(content);
    assert.deepEqual(result, {
      lastValidated: "2026-04-27",
      nextReview: null,
      format: "legacy",
    });
  });

  it("returns nulls when no header is found", () => {
    const content = [
      "# Some Doc",
      "",
      "This doc has no freshness header.",
      "",
      "## Section",
    ].join("\n");

    const result = parseHeader(content);
    assert.deepEqual(result, {
      lastValidated: null,
      nextReview: null,
      format: null,
    });
  });

  it("respects lineLimit and ignores header beyond it", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`);
    lines[18] =
      "> **Last validated:** 2026-01-01 by @user. **Next review:** 2026-04-01.";
    const content = lines.join("\n");

    // With default limit (15), the header at line 18 should not be found
    const result = parseHeader(content, 15);
    assert.equal(result.lastValidated, null);

    // With a higher limit, it should be found
    const result2 = parseHeader(content, 20);
    assert.equal(result2.lastValidated, "2026-01-01");
  });

  it("handles canonical format without Next review gracefully", () => {
    const content = [
      "# Doc",
      "",
      "> **Last validated:** 2026-03-15 by @dev.",
      "",
      "Content.",
    ].join("\n");

    const result = parseHeader(content);
    assert.equal(result.lastValidated, "2026-03-15");
    assert.equal(result.nextReview, null);
    assert.equal(result.format, "canonical");
  });
});

// ── addDays ──────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds 90 days correctly", () => {
    assert.equal(addDays("2026-04-27", 90), "2026-07-26");
  });

  it("adds 60 days correctly", () => {
    assert.equal(addDays("2026-04-27", 60), "2026-06-26");
  });

  it("handles year boundary", () => {
    assert.equal(addDays("2026-12-01", 60), "2027-01-30");
  });

  it("handles leap year", () => {
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  });
});

// ── effectiveNextReview ──────────────────────────────────────────────────────

describe("effectiveNextReview", () => {
  it("returns explicit nextReview when present", () => {
    const header = {
      lastValidated: "2026-04-27",
      nextReview: "2026-07-26",
      format: "canonical",
    };
    assert.equal(effectiveNextReview(header, 90), "2026-07-26");
  });

  it("computes nextReview from lastValidated + cadence for legacy", () => {
    const header = {
      lastValidated: "2026-04-27",
      nextReview: null,
      format: "legacy",
    };
    assert.equal(effectiveNextReview(header, 60), "2026-06-26");
  });

  it("returns null when no header data", () => {
    const header = {
      lastValidated: null,
      nextReview: null,
      format: null,
    };
    assert.equal(effectiveNextReview(header, 90), null);
  });
});

// ── isOverdue ────────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("returns true when nextReview is before today", () => {
    assert.equal(isOverdue("2026-01-01", "2026-04-27"), true);
  });

  it("returns false when nextReview is today", () => {
    assert.equal(isOverdue("2026-04-27", "2026-04-27"), false);
  });

  it("returns false when nextReview is in the future", () => {
    assert.equal(isOverdue("2026-07-26", "2026-04-27"), false);
  });
});

// ── daysBetween ──────────────────────────────────────────────────────────────

describe("daysBetween", () => {
  it("computes positive difference", () => {
    assert.equal(daysBetween("2026-01-01", "2026-04-27"), 116);
  });

  it("returns 0 for same date", () => {
    assert.equal(daysBetween("2026-04-27", "2026-04-27"), 0);
  });

  it("returns negative for reversed dates", () => {
    assert.equal(daysBetween("2026-04-27", "2026-04-01"), -26);
  });
});

// ── freshnessMarker ──────────────────────────────────────────────────────────

describe("freshnessMarker", () => {
  it("produces the correct HTML comment", () => {
    assert.equal(
      freshnessMarker("docs/observability/runbook.md"),
      "<!-- doc-freshness:docs/observability/runbook.md -->",
    );
  });
});

// ── issueTitle ───────────────────────────────────────────────────────────────

describe("issueTitle", () => {
  it("includes the file path", () => {
    const title = issueTitle("docs/design/brandbook.md");
    assert.equal(title, "docs: freshness overdue — docs/design/brandbook.md");
  });
});

// ── issueBody ────────────────────────────────────────────────────────────────

describe("issueBody", () => {
  it("includes the freshness marker for idempotency", () => {
    const body = issueBody("README.md", "2026-04-27", "2026-07-26", 5);
    assert.ok(body.includes("<!-- doc-freshness:README.md -->"));
  });

  it("includes last validated date", () => {
    const body = issueBody("README.md", "2026-04-27", "2026-07-26", 5);
    assert.ok(body.includes("**Last validated:** 2026-04-27"));
  });

  it("includes days overdue", () => {
    const body = issueBody("README.md", "2026-04-27", "2026-07-26", 5);
    assert.ok(body.includes("**Days overdue:** 5"));
  });

  it("handles unknown lastValidated gracefully", () => {
    const body = issueBody("README.md", null, "2026-07-26", 10);
    assert.ok(body.includes("**Last validated:** unknown"));
  });
});
