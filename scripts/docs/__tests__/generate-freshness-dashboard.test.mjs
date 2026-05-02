// scripts/docs/__tests__/generate-freshness-dashboard.test.mjs
//
// Unit tests for the freshness-dashboard HTML generator.
// Run with: node --test scripts/docs/__tests__/generate-freshness-dashboard.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classify,
  escapeHtml,
  renderHtml,
} from "../generate-freshness-dashboard.mjs";

const today = "2026-04-29";

describe("classify", () => {
  it("classifies fresh (> 30d headroom)", () => {
    const e = { status: "present", nextReview: "2026-07-28" };
    assert.equal(classify(e, { today }), "fresh");
  });

  it("classifies due-soon (≤ 30d)", () => {
    const e = { status: "present", nextReview: "2026-05-15" };
    assert.equal(classify(e, { today }), "due-soon");
  });

  it("classifies overdue", () => {
    const e = { status: "present", nextReview: "2026-01-15" };
    assert.equal(classify(e, { today }), "overdue");
  });

  it("classifies missing", () => {
    assert.equal(classify({ status: "missing" }, { today }), "missing");
  });

  it("classifies no-header", () => {
    assert.equal(classify({ status: "no-header" }, { today }), "no-header");
  });

  it("classifies no-header when nextReview is absent even on present", () => {
    assert.equal(
      classify({ status: "present", nextReview: null }, { today }),
      "no-header",
    );
  });
});

describe("escapeHtml", () => {
  it("escapes all dangerous chars", () => {
    assert.equal(
      escapeHtml(`<script>alert("xss")</script>&'`),
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#39;",
    );
  });
});

describe("renderHtml", () => {
  it("produces a full HTML document with totals", () => {
    const entries = [
      {
        path: "docs/a.md",
        cadence: 90,
        status: "present",
        lastValidated: "2026-02-01",
        nextReview: "2026-07-28",
        owner: "@alice",
        daysUntilOverdue: 90,
        format: "canonical",
      },
      {
        path: "docs/b.md",
        cadence: 90,
        status: "present",
        lastValidated: "2026-01-01",
        nextReview: "2026-03-01",
        owner: "@bob",
        daysUntilOverdue: -59,
        format: "canonical",
      },
      {
        path: "docs/missing.md",
        cadence: 90,
        status: "missing",
      },
    ];
    const html = renderHtml(entries, { today });
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /Fresh: 1/);
    assert.match(html, /Overdue: 1/);
    assert.match(html, /Missing: 1/);
    assert.match(html, /@alice/);
    assert.match(html, /docs\/missing\.md/);
    // Sticky header class so downloaders can scroll:
    assert.match(html, /position: sticky/);
  });
});
