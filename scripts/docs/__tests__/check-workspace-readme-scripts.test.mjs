import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findGaps,
  readmeMentionsScript,
} from "../check-workspace-readme-scripts.mjs";

describe("readmeMentionsScript", () => {
  it("matches whole tokens only", () => {
    assert.equal(
      readmeMentionsScript("run `test:watch` here", "test:watch"),
      true,
    );
    assert.equal(readmeMentionsScript("run `test:watch` here", "test"), false);
    assert.equal(
      readmeMentionsScript("pnpm --filter x e2e:mobile # …", "e2e"),
      false,
    );
    assert.equal(readmeMentionsScript("pnpm --filter x e2e # …", "e2e"), true);
  });
});

describe("findGaps", () => {
  it("reports missing README and missing script mentions, skips script-less packages", () => {
    const root = mkdtempSync(join(tmpdir(), "readme-scripts-"));
    try {
      const mk = (ws, pkg, readme) => {
        mkdirSync(join(root, ws), { recursive: true });
        writeFileSync(join(root, ws, "package.json"), JSON.stringify(pkg));
        if (readme !== null) writeFileSync(join(root, ws, "README.md"), readme);
      };
      mk("apps/a", { scripts: { dev: "x", test: "y" } }, "## Команди\n`dev`\n");
      mk("packages/b", { scripts: { lint: "x" } }, null);
      mk("packages/c", { scripts: {} }, null);
      mk("packages/d", { scripts: { test: "x" } }, "pnpm --filter d test\n");
      assert.deepEqual(findGaps(root), [
        { workspace: "apps/a", missing: ["test"] },
        { workspace: "packages/b", missing: ["lint"], noReadme: true },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
