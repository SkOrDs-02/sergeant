// scripts/docs/__tests__/check-playbook-schema.test.mjs
//
// Negative-case tests for scripts/docs/check-playbook-schema.mjs. Uses the
// pure helpers `validatePlaybook` + `isSkippableFile` so we don't need to
// build a fixture tree on disk for every case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validatePlaybook,
  isSkippableFile,
} from "../check-playbook-schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "check-playbook-schema.mjs");

const TODAY = new Date("2026-04-30T00:00:00Z");

const validPlaybook = `# Playbook: Example

> **Last validated:** 2026-04-30 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

**Trigger:** "do the example thing" / triggers when something interesting happens.

---

## Steps

1. Step one.
`;

test("isSkippableFile returns true for INDEX, README, _TEMPLATE*, and underscore-prefixed", () => {
  assert.equal(isSkippableFile("INDEX.md"), true);
  assert.equal(isSkippableFile("README.md"), true);
  assert.equal(isSkippableFile("_TEMPLATE-decision-tree.md"), true);
  assert.equal(isSkippableFile("_scratch.md"), true);
  assert.equal(isSkippableFile("add-api-endpoint.md"), false);
});

test("validatePlaybook accepts a well-formed playbook", () => {
  const errors = validatePlaybook(validPlaybook, { today: TODAY });
  assert.deepEqual(errors, []);
});

test("validatePlaybook flags missing H1", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/^# Playbook: Example\n\n/, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing H1/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags H1 without 'Playbook:' prefix", () => {
  const errors = validatePlaybook(
    validPlaybook.replace("# Playbook: Example", "# Just a Heading"),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /H1 must follow the form/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags missing freshness header", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/^> \*\*Last validated:\*\*.*\n/m, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing freshness header/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags malformed freshness header", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(
      /^> \*\*Last validated:\*\*.*\n/m,
      "> **Last validated:** sometime, by someone\n",
    ),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /freshness header malformed/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags Next review <= Last validated", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(
      "**Next review:** 2026-07-29",
      "**Next review:** 2026-04-29",
    ),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Next review.*must be after.*Last validated/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags Last validated in the future", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(
      "**Last validated:** 2026-04-30",
      "**Last validated:** 2027-01-01",
    ),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Last validated.*is in the future/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags missing Status line", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/^> \*\*Status:\*\*.*\n/m, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing lifecycle marker/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags unknown Status value", () => {
  const errors = validatePlaybook(
    validPlaybook.replace("**Status:** Active", "**Status:** Sketchy"),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /unknown status 'Sketchy'/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags missing Trigger line", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/^\*\*Trigger:\*\*.*\n/m, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing `\*\*Trigger:\*\*` line/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags too-short Trigger", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/^\*\*Trigger:\*\*.*$/m, "**Trigger:** short"),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Trigger.*too short/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook treats first H2 as the cutoff (Trigger after H2 is invisible)", () => {
  // Move the Trigger line below an H2 — the schema requires it in the
  // preamble (above any H2), so this should be flagged as missing.
  const moved = `# Playbook: Example

> **Last validated:** 2026-04-30 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

## Steps

**Trigger:** this trigger is below the first H2 and should not count.

1. Step one.
`;
  const errors = validatePlaybook(moved, { today: TODAY });
  assert.ok(
    errors.some((e) => /missing `\*\*Trigger:\*\*` line/.test(e)),
    errors.join("; "),
  );
});

// End-to-end CLI test: assemble a fake docs/playbooks/ tree and run the script.
test("CLI exits 1 with --json output when a playbook is malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "playbook-schema-"));
  try {
    const root = join(dir, "repo");
    mkdirSync(join(root, "docs", "playbooks"), { recursive: true });
    mkdirSync(join(root, "scripts", "docs"), { recursive: true });
    cpSync(
      SCRIPT_PATH,
      join(root, "scripts", "docs", "check-playbook-schema.mjs"),
    );
    // One good, one bad
    writeFileSync(join(root, "docs", "playbooks", "good.md"), validPlaybook);
    writeFileSync(
      join(root, "docs", "playbooks", "bad.md"),
      "# Playbook: Bad\n\nNo metadata at all.\n",
    );
    // Skipped files (must not contribute violations)
    writeFileSync(join(root, "docs", "playbooks", "INDEX.md"), "# anything\n");
    writeFileSync(
      join(root, "docs", "playbooks", "_TEMPLATE-decision-tree.md"),
      "# template\n",
    );
    const r = spawnSync(
      process.execPath,
      [join(root, "scripts", "docs", "check-playbook-schema.mjs"), "--json"],
      { encoding: "utf-8" },
    );
    assert.equal(
      r.status,
      1,
      `expected exit 1, got ${r.status}; stderr: ${r.stderr}`,
    );
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.playbookCount, 2);
    assert.equal(parsed.violations.length, 1);
    assert.match(parsed.violations[0].file, /bad\.md$/);
    assert.ok(
      parsed.violations[0].errors.some((e) => /missing freshness/.test(e)),
      parsed.violations[0].errors.join("; "),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 0 with happy fixture", () => {
  const dir = mkdtempSync(join(tmpdir(), "playbook-schema-"));
  try {
    const root = join(dir, "repo");
    mkdirSync(join(root, "docs", "playbooks"), { recursive: true });
    mkdirSync(join(root, "scripts", "docs"), { recursive: true });
    cpSync(
      SCRIPT_PATH,
      join(root, "scripts", "docs", "check-playbook-schema.mjs"),
    );
    writeFileSync(join(root, "docs", "playbooks", "good.md"), validPlaybook);
    const r = spawnSync(
      process.execPath,
      [join(root, "scripts", "docs", "check-playbook-schema.mjs"), "--json"],
      { encoding: "utf-8" },
    );
    assert.equal(
      r.status,
      0,
      `expected exit 0, got ${r.status}; stderr: ${r.stderr}`,
    );
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.playbookCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
