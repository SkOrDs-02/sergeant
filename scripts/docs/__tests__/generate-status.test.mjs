// scripts/docs/__tests__/generate-status.test.mjs
//
// Unit tests for the STATUS.md control-panel generator.
// Run with: node --test scripts/docs/__tests__/generate-status.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractFocus,
  loadShipped,
  summariseInFlight,
} from "../generate-status.mjs";

describe("extractFocus", () => {
  it("returns the default placeholder when there is no existing file", () => {
    assert.match(extractFocus(""), /редагуєш вручну/);
    assert.match(extractFocus(undefined), /редагуєш вручну/);
  });

  it("returns the default when markers are missing", () => {
    assert.match(extractFocus("# STATUS\n\nno markers here\n"), /вручну/);
  });

  it("preserves hand-written content between the markers", () => {
    const file = [
      "# STATUS",
      "<!-- FOCUS:START -->",
      "",
      "Цього тижня: paywall + sync v2 sunset.",
      "",
      "<!-- FOCUS:END -->",
      "## next",
    ].join("\n");
    assert.equal(extractFocus(file), "Цього тижня: paywall + sync v2 sunset.");
  });

  it("falls back to default when the region is whitespace-only", () => {
    const file = "<!-- FOCUS:START -->\n\n   \n\n<!-- FOCUS:END -->";
    assert.match(extractFocus(file), /вручну/);
  });

  it("ignores out-of-order markers", () => {
    const file = "<!-- FOCUS:END -->x<!-- FOCUS:START -->";
    assert.match(extractFocus(file), /вручну/);
  });
});

describe("loadShipped", () => {
  function withLedger(json, fn) {
    const dir = mkdtempSync(join(tmpdir(), "status-ledger-"));
    const path = join(dir, "index.json");
    writeFileSync(path, json, "utf8");
    try {
      return fn(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("returns [] for a missing ledger", () => {
    assert.deepEqual(loadShipped("/no/such/index.json"), []);
  });

  it("returns [] for malformed JSON", () => {
    withLedger("{ not json", (p) => assert.deepEqual(loadShipped(p), []));
  });

  it("sorts by merged_at descending and applies the limit", () => {
    const ledger = JSON.stringify({
      prs: [
        { number: 1, title: "old", merged_at: "2026-01-01T00:00:00Z" },
        { number: 3, title: "new", merged_at: "2026-03-01T00:00:00Z" },
        { number: 2, title: "mid", merged_at: "2026-02-01T00:00:00Z" },
      ],
    });
    withLedger(ledger, (p) => {
      const out = loadShipped(p, 2);
      assert.equal(out.length, 2);
      assert.deepEqual(
        out.map((x) => x.number),
        [3, 2],
      );
    });
  });

  it("skips entries without a numeric PR number", () => {
    const ledger = JSON.stringify({
      prs: [{ title: "no number", merged_at: "2026-01-01" }, { number: 5 }],
    });
    withLedger(ledger, (p) => {
      assert.deepEqual(
        loadShipped(p).map((x) => x.number),
        [5],
      );
    });
  });
});

describe("summariseInFlight", () => {
  const report = [
    {
      tracker: { title: "Ініціативи" },
      entries: [
        {
          linkPath: "initiatives/b.md",
          title: "B",
          rawStatus: "Active",
          prs: [10, 50],
        },
        {
          linkPath: "initiatives/a.md",
          title: "A",
          rawStatus: "Active",
          prs: [99],
        },
      ],
    },
    {
      tracker: { title: "Техборг" },
      entries: [
        {
          linkPath: "tech-debt/c.md",
          title: "C",
          rawStatus: "Active",
          prs: [],
        },
      ],
    },
  ];

  it("counts per tracker and totals", () => {
    const s = summariseInFlight(report);
    assert.equal(s.total, 3);
    assert.deepEqual(s.perTracker, [
      { title: "Ініціативи", count: 2 },
      { title: "Техборг", count: 1 },
    ]);
  });

  it("ranks recent by max PR number desc (deterministic, no mtime)", () => {
    const s = summariseInFlight(report);
    assert.deepEqual(
      s.recent.map((e) => e.linkPath),
      ["initiatives/a.md", "initiatives/b.md", "tech-debt/c.md"],
    );
  });

  it("is stable across repeated calls (no filesystem dependency)", () => {
    const a = summariseInFlight(report).recent.map((e) => e.linkPath);
    const b = summariseInFlight(report).recent.map((e) => e.linkPath);
    assert.deepEqual(a, b);
  });
});
