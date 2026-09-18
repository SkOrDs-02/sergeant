// scripts/docs/__tests__/check-freshness-single-marker.test.mjs
//
// Run with: node --test scripts/docs/__tests__/check-freshness-single-marker.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  countFreshnessMarkers,
  checkFreshnessSingleMarker,
} from "../check-freshness-single-marker.mjs";

function buildFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "freshness-single-marker-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("countFreshnessMarkers handles zero, one, and two markers", () => {
  assert.equal(countFreshnessMarkers("# Doc\n\nBody"), 0);
  assert.equal(
    countFreshnessMarkers(
      "# Doc\n\n> **Last validated:** 2026-05-14 by @codex.",
    ),
    1,
  );
  assert.equal(
    countFreshnessMarkers(
      [
        "# Doc",
        "",
        "> **Last validated:** 2026-05-14 by @codex.",
        "Content.",
        "> **Last validated:** 2026-05-15 by @codex.",
      ].join("\n"),
    ),
    2,
  );
});

test("countFreshnessMarkers skips fenced code examples", () => {
  const content = [
    "# Doc",
    "",
    "> **Last validated:** 2026-05-14 by @codex.",
    "",
    "```md",
    "> **Last validated:** 1999-01-01 by @example.",
    "```",
  ].join("\n");

  assert.equal(countFreshnessMarkers(content), 1);
});

test("checkFreshnessSingleMarker reports only docs files with duplicates", () => {
  const dir = buildFixture({
    "docs/ok.md": [
      "# OK",
      "",
      "> **Last validated:** 2026-05-14 by @codex.",
    ].join("\n"),
    "docs/missing.md": "# Missing is covered by a different gate",
    "docs/bad.md": [
      "# Bad",
      "",
      "> **Last validated:** 2026-05-14 by @codex.",
      "",
      "> **Last validated:** 2026-05-15 by @codex.",
    ].join("\n"),
    "README.md": [
      "# Root",
      "",
      "> **Last validated:** 2026-05-14 by @codex.",
      "> **Last validated:** 2026-05-15 by @codex.",
    ].join("\n"),
  });

  try {
    const report = checkFreshnessSingleMarker(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(report.failures, [{ file: "docs/bad.md", markers: 2 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
