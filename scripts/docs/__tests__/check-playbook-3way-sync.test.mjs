// scripts/docs/__tests__/check-playbook-3way-sync.test.mjs
//
// Run with: node --test scripts/docs/__tests__/check-playbook-3way-sync.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractLocalPlaybookLinks,
  checkPlaybook3WaySync,
} from "../check-playbook-3way-sync.mjs";

function playbook(title, trigger) {
  return [`# ${title}`, "", `**Trigger:** ${trigger}`, ""].join("\n");
}

function buildFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "playbook-3way-"));
  const playbooksDir = join(dir, "docs", "playbooks");
  mkdirSync(playbooksDir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(playbooksDir, file), content);
  }
  return { dir, playbooksDir };
}

test("extractLocalPlaybookLinks keeps only local playbook links", () => {
  const links = extractLocalPlaybookLinks(
    [
      "[A](./a.md)",
      "[B](./b.md#anchor)",
      "[Review](../governance/review-checklist.md)",
    ].join("\n"),
  );

  assert.deepEqual([...links].sort(), ["a.md", "b.md"]);
});

test("checkPlaybook3WaySync passes when every playbook is in index and catalog", () => {
  const { dir, playbooksDir } = buildFixture({
    "a.md": playbook("A", "when A"),
    "b.md": playbook("B", "when B"),
    "INDEX.md": "[`a.md`](./a.md)\n[`b.md`](./b.md)\n",
    "playbook-catalog.md": "[`a.md`](./a.md)\n[`b.md`](./b.md)\n",
  });

  try {
    const report = checkPlaybook3WaySync({
      playbooksDir,
      indexPath: join(playbooksDir, "INDEX.md"),
      catalogPath: join(playbooksDir, "playbook-catalog.md"),
    });
    assert.equal(report.ok, true);
    assert.equal(report.checked, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkPlaybook3WaySync reports orphan and stale catalog links", () => {
  const { dir, playbooksDir } = buildFixture({
    "a.md": playbook("A", "when A"),
    "b.md": playbook("B", "when B"),
    "INDEX.md": "[`a.md`](./a.md)\n",
    "playbook-catalog.md": "[`a.md`](./a.md)\n[`stale.md`](./stale.md)\n",
  });

  try {
    const report = checkPlaybook3WaySync({
      playbooksDir,
      indexPath: join(playbooksDir, "INDEX.md"),
      catalogPath: join(playbooksDir, "playbook-catalog.md"),
    });
    assert.equal(report.ok, false);
    assert.match(report.failures.join("\n"), /b\.md: missing from/);
    assert.match(report.failures.join("\n"), /stale\.md: linked from/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
