// scripts/docs/__tests__/generate-trust-badge.test.mjs
//
// Unit tests for the pure helpers in generate-trust-badge.mjs.
//
//   node --test scripts/docs/__tests__/generate-trust-badge.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as badge from "../generate-trust-badge.mjs";

const { computeTrust, renderBlock, spliceReadme } = badge;

// ── computeTrust ────────────────────────────────────────────────────────

describe("computeTrust", () => {
  it("healthy when nothing is stale and no WIP violations", () => {
    const t = computeTrust({ wipRows: [], overdueCount: 0 });
    assert.equal(t.status, "healthy");
    assert.equal(t.violations, 0);
  });

  it("ignores WIP rows below the soft limit", () => {
    const t = computeTrust({
      wipRows: [{ severity: "ok" }, { severity: "ok" }],
      overdueCount: 0,
    });
    assert.equal(t.status, "healthy");
  });

  it("warning when 1–3 docs are stale", () => {
    for (const overdueCount of [1, 3]) {
      const t = computeTrust({ wipRows: [], overdueCount });
      assert.equal(t.status, "warning", `overdueCount=${overdueCount}`);
    }
  });

  it("warning on exactly one WIP violation", () => {
    const t = computeTrust({
      wipRows: [{ severity: "warn" }],
      overdueCount: 0,
    });
    assert.equal(t.status, "warning");
    assert.equal(t.violations, 1);
  });

  it("critical when more than 3 docs are stale", () => {
    const t = computeTrust({ wipRows: [], overdueCount: 4 });
    assert.equal(t.status, "critical");
  });

  it("critical when WIP > 1", () => {
    const wipRows = [{ severity: "warn" }, { severity: "fail" }];
    const t = computeTrust({ wipRows, overdueCount: 0 });
    assert.equal(t.status, "critical");
  });
});

// ── без зовнішніх сигналів (2026-10-01) ─────────────────────────────────

describe("badge depends only on the tree", () => {
  // Бейдж закомічений і звіряється pre-commit-хуком. Будь-який сигнал ззовні
  // дерева (історія Actions, авторизація `gh`) дає різний бейдж у різних
  // середовищах, і хук червоніє без жодної правки. Див. шапку генератора.
  it("exports no cron-health probe", () => {
    assert.equal("getCronHealth" in badge, false);
    assert.equal("MONITORED_WORKFLOWS" in badge, false);
  });

  it("renders no cron-health line", () => {
    for (const status of ["healthy", "warning", "critical"]) {
      const block = renderBlock({ status, overdueCount: 0, violations: 0 });
      assert.equal(/cron/i.test(block), false, status);
    }
  });
});

// ── renderBlock ─────────────────────────────────────────────────────────

describe("renderBlock", () => {
  it("wraps the badge in markers and links today.md", () => {
    const block = renderBlock({
      status: "warning",
      overdueCount: 2,
      violations: 0,
    });
    assert.match(block, /^<!-- TRUST-BADGE:START -->/);
    assert.match(block, /<!-- TRUST-BADGE:END -->$/);
    assert.match(block, /Docs trust: WARNING/);
    assert.match(block, /2 stale, 0 WIP soft-violation/);
    assert.match(block, /\(\.\/today\.md\)/);
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
