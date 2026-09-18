import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { scan } from "../check-archive-move-depth.mjs";

test("scan reports every local documentation archive tree", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-archive-"));
  try {
    mkdirSync(join(root, "docs", "work", "specs", "archive"), {
      recursive: true,
    });
    mkdirSync(join(root, "docs", "design", "archive"), { recursive: true });

    assert.deepEqual(scan(root), [
      "docs/design/archive",
      "docs/work/specs/archive",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan accepts documentation without archive directories", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-archive-"));
  try {
    mkdirSync(join(root, "docs", "work", "specs", "history"), {
      recursive: true,
    });
    assert.deepEqual(scan(resolve(root)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
