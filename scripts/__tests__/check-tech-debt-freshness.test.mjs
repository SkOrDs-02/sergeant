// scripts/__tests__/check-tech-debt-freshness.test.mjs
//
// Unit tests for the tech-debt freshness CI guard (audit PR-3.E).
// Run with: node --test scripts/__tests__/check-tech-debt-freshness.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseFreshnessThreshold,
  parseTechDebtFiles,
  extractMarkerDate,
  daysBetween,
  isStale,
  isoDateUTC,
  run,
} from "../check-tech-debt-freshness.mjs";

// ── parseFreshnessThreshold ──────────────────────────────────────────────────

describe("parseFreshnessThreshold", () => {
  it("returns the fallback when the env var is missing or empty", () => {
    assert.equal(parseFreshnessThreshold(undefined), 60);
    assert.equal(parseFreshnessThreshold(null), 60);
    assert.equal(parseFreshnessThreshold(""), 60);
  });

  it("parses a positive integer", () => {
    assert.equal(parseFreshnessThreshold("90"), 90);
    assert.equal(parseFreshnessThreshold("1"), 1);
  });

  it("floors fractional input", () => {
    assert.equal(parseFreshnessThreshold("60.7"), 60);
  });

  it("falls back on garbage input", () => {
    assert.equal(parseFreshnessThreshold("abc"), 60);
    assert.equal(parseFreshnessThreshold("0"), 60);
    assert.equal(parseFreshnessThreshold("-7"), 60);
  });

  it("respects a custom fallback", () => {
    assert.equal(parseFreshnessThreshold(undefined, 14), 14);
    assert.equal(parseFreshnessThreshold("bogus", 14), 14);
  });
});

// ── parseTechDebtFiles ───────────────────────────────────────────────────────

describe("parseTechDebtFiles", () => {
  it("returns the default list when the env var is missing", () => {
    assert.deepEqual(parseTechDebtFiles(undefined), [
      "docs/tech-debt/frontend.md",
      "docs/tech-debt/mobile.md",
    ]);
    assert.deepEqual(parseTechDebtFiles(""), [
      "docs/tech-debt/frontend.md",
      "docs/tech-debt/mobile.md",
    ]);
  });

  it("splits a comma-separated list and trims whitespace", () => {
    assert.deepEqual(
      parseTechDebtFiles(
        "docs/tech-debt/frontend.md, docs/tech-debt/backend.md",
      ),
      ["docs/tech-debt/frontend.md", "docs/tech-debt/backend.md"],
    );
  });

  it("ignores empty segments", () => {
    assert.deepEqual(parseTechDebtFiles(",, docs/foo.md ,,"), ["docs/foo.md"]);
  });

  it("returns the default when only commas are provided", () => {
    assert.deepEqual(parseTechDebtFiles(",,,"), [
      "docs/tech-debt/frontend.md",
      "docs/tech-debt/mobile.md",
    ]);
  });
});

// ── extractMarkerDate ────────────────────────────────────────────────────────

describe("extractMarkerDate", () => {
  it("parses the `> **Оновлено YYYY-MM-DD.**` marker", () => {
    const content = [
      "# Title",
      "",
      "> **Оновлено 2026-04-26.** notes follow",
    ].join("\n");
    assert.deepEqual(extractMarkerDate(content), {
      date: "2026-04-26",
      line: 3,
    });
  });

  it("parses the `> **Last reviewed: YYYY-MM-DD by …**` marker", () => {
    const content = "> **Last reviewed: 2026-04-01 by @user.**";
    assert.deepEqual(extractMarkerDate(content), {
      date: "2026-04-01",
      line: 1,
    });
  });

  it("parses the `Last reviewed: YYYY-MM-DD` AGENTS-style marker", () => {
    const content = "# Doc\nLast reviewed: 2026-03-15 by @reviewer.\n";
    assert.deepEqual(extractMarkerDate(content), {
      date: "2026-03-15",
      line: 2,
    });
  });

  it("returns null when no marker is present", () => {
    const content = "# Title\n\nSome paragraph without a date.\n";
    assert.equal(extractMarkerDate(content), null);
  });

  it("ignores markers below the header window", () => {
    const headerFiller = Array.from({ length: 32 }, () => "filler line").join(
      "\n",
    );
    const content = `${headerFiller}\n> **Оновлено 2026-04-26.**`;
    assert.equal(extractMarkerDate(content), null);
  });

  it("picks the first marker when multiple are present", () => {
    const content = [
      "> **Оновлено 2026-04-26.** v1",
      "> **Оновлено 2025-01-01.** v0",
    ].join("\n");
    assert.deepEqual(extractMarkerDate(content), {
      date: "2026-04-26",
      line: 1,
    });
  });

  it("rejects partial-format dates", () => {
    const content = "> **Оновлено 2026-4-26.** bad";
    assert.equal(extractMarkerDate(content), null);
  });
});

// ── daysBetween ──────────────────────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns whole days for in-order ISO dates", () => {
    assert.equal(daysBetween("2026-01-01", "2026-01-11"), 10);
  });

  it("clamps negative deltas to 0", () => {
    assert.equal(daysBetween("2026-01-11", "2026-01-01"), 0);
  });

  it("accepts a Date for `later`", () => {
    const later = new Date("2026-01-11T00:00:00Z");
    assert.equal(daysBetween("2026-01-01", later), 10);
  });

  it("returns null for invalid dates", () => {
    assert.equal(daysBetween("not-a-date", "2026-01-01"), null);
  });
});

// ── isStale ──────────────────────────────────────────────────────────────────

describe("isStale", () => {
  it("is fresh when within the threshold", () => {
    assert.equal(isStale("2026-04-01", "2026-04-26", 60), false);
  });

  it("is fresh exactly at the threshold (boundary inclusive)", () => {
    assert.equal(isStale("2026-02-25", "2026-04-26", 60), false);
  });

  it("is stale beyond the threshold", () => {
    assert.equal(isStale("2026-02-24", "2026-04-26", 60), true);
  });

  it("is fresh when the marker is in the future", () => {
    assert.equal(isStale("2027-01-01", "2026-04-26", 60), false);
  });

  it("is fresh when the marker is missing (null)", () => {
    assert.equal(isStale(null, "2026-04-26", 60), false);
  });
});

// ── isoDateUTC ───────────────────────────────────────────────────────────────

describe("isoDateUTC", () => {
  it("formats midday UTC", () => {
    assert.equal(isoDateUTC(new Date("2026-04-26T12:34:56Z")), "2026-04-26");
  });

  it("formats edge-of-day UTC", () => {
    assert.equal(isoDateUTC(new Date("2026-04-26T23:59:59Z")), "2026-04-26");
  });
});

// ── run() integration with stubbed fs ────────────────────────────────────────

describe("run", () => {
  const now = new Date("2026-04-26T00:00:00Z");

  it("passes when the marker is within the threshold", () => {
    const result = run({
      files: ["docs/tech-debt/frontend.md"],
      thresholdDays: 60,
      now,
      read: () => "> **Оновлено 2026-04-20.** notes",
    });
    assert.equal(result.ok, true);
    assert.equal(result.results[0].markerDate, "2026-04-20");
    assert.equal(result.results[0].daysSince, 6);
    assert.equal(result.results[0].stale, false);
    assert.equal(result.results[0].error, null);
  });

  it("fails when the marker is older than the threshold", () => {
    const result = run({
      files: ["docs/tech-debt/frontend.md"],
      thresholdDays: 60,
      now,
      read: () => "> **Оновлено 2026-01-01.** notes",
    });
    assert.equal(result.ok, false);
    assert.equal(result.results[0].stale, true);
    assert.equal(result.results[0].daysSince, 115);
  });

  it("fails when the file is missing", () => {
    const result = run({
      files: ["docs/nope.md"],
      thresholdDays: 60,
      now,
      read: () => null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.results[0].error, "file_not_found");
  });

  it("fails when the marker is missing from the file", () => {
    const result = run({
      files: ["docs/tech-debt/frontend.md"],
      thresholdDays: 60,
      now,
      read: () => "# Title\n\nSome paragraph.\n",
    });
    assert.equal(result.ok, false);
    assert.equal(result.results[0].error, "marker_missing");
    assert.equal(result.results[0].stale, false);
  });

  it("checks every configured file independently", () => {
    const contents = {
      "docs/tech-debt/frontend.md": "> **Оновлено 2026-04-20.**",
      "docs/tech-debt/backend.md": "> **Оновлено 2026-01-01.**",
    };
    const result = run({
      files: Object.keys(contents),
      thresholdDays: 60,
      now,
      read: (f) => contents[f],
    });
    assert.equal(result.ok, false);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].stale, false);
    assert.equal(result.results[1].stale, true);
  });
});
