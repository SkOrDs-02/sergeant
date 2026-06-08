import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { scan } from "../check-archive-move-depth.mjs";

test("scan reports archive links that need one more ../ segment", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-depth-"));
  try {
    mkdirSync(join(root, "docs", "audits", "archive"), { recursive: true });
    mkdirSync(join(root, "docs", "initiatives"), { recursive: true });
    writeFileSync(join(root, "docs", "initiatives", "foo.md"), "# Foo\n");
    writeFileSync(
      join(root, "docs", "audits", "archive", "audit.md"),
      "[foo](../initiatives/foo.md)\n",
    );

    assert.deepEqual(scan(root), [
      {
        file: "docs/90-work/audits/archive/audit.md",
        line: 1,
        target: "../initiatives/foo.md",
        suggested: "../../initiatives/foo.md",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan accepts archive links with the correct depth", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-depth-"));
  try {
    mkdirSync(join(root, "docs", "audits", "archive"), { recursive: true });
    mkdirSync(join(root, "docs", "initiatives"), { recursive: true });
    writeFileSync(join(root, "docs", "initiatives", "foo.md"), "# Foo\n");
    writeFileSync(
      join(root, "docs", "audits", "archive", "audit.md"),
      "[foo](../../initiatives/foo.md)\n",
    );

    assert.deepEqual(scan(resolve(root)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
