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
  sliceH2Section,
  MAX_TRIGGER_LENGTH,
} from "../check-playbook-schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "check-playbook-schema.mjs");

const TODAY = new Date("2026-04-30T00:00:00Z");

const validPlaybook = `# Playbook: Example

> **Last validated:** 2026-04-30 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

**Trigger:** "do the example thing" / triggers when something interesting happens.

## Owner surface

- Primary surface: \`apps/web\`
- Governing skill: \`sergeant-web-ui\`

---

## Steps

1. Step one.

## Verification

- [ ] Tests pass.
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

test("validatePlaybook accepts every status from AGENTS.md Hard Rule #10", () => {
  // Source of truth: AGENTS.md § "Docs: status badge under the freshness
  // marker" → Active | Scaffolded | Deprecated | Archived. If someone
  // narrows the enum without updating AGENTS.md, this test fails — and if
  // they widen AGENTS.md without updating the script, the registry-side
  // gate (or this test) catches it too.
  for (const status of ["Active", "Scaffolded", "Deprecated", "Archived"]) {
    const errors = validatePlaybook(
      validPlaybook.replace("**Status:** Active", `**Status:** ${status}`),
      { today: TODAY },
    );
    assert.deepEqual(
      errors,
      [],
      `status '${status}' should be allowed by AGENTS.md Hard Rule #10 but the schema rejected it: ${errors.join("; ")}`,
    );
  }
});

test("validatePlaybook rejects 'Draft' (which is NOT in AGENTS.md Hard Rule #10)", () => {
  // Regression test for the bug Devin Review caught: the original
  // ALLOWED_STATUSES contained {Active, Draft, Deprecated, Experimental},
  // contradicting AGENTS.md. Pin the contract in code.
  const errors = validatePlaybook(
    validPlaybook.replace("**Status:** Active", "**Status:** Draft"),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /unknown status 'Draft'/.test(e)),
    `expected 'Draft' to be rejected, got: ${errors.join("; ")}`,
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

test("validatePlaybook flags too-long Trigger (> 240 chars of body)", () => {
  // Body 241 chars = exactly one over the cap; should fail.
  const longBody = "x".repeat(MAX_TRIGGER_LENGTH + 1);
  const errors = validatePlaybook(
    validPlaybook.replace(/^\*\*Trigger:\*\*.*$/m, `**Trigger:** ${longBody}`),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Trigger.*too long/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook accepts Trigger at exactly the cap (240 chars)", () => {
  const exact = "y".repeat(MAX_TRIGGER_LENGTH);
  const errors = validatePlaybook(
    validPlaybook.replace(/^\*\*Trigger:\*\*.*$/m, `**Trigger:** ${exact}`),
    { today: TODAY },
  );
  assert.deepEqual(errors, [], errors.join("; "));
});

test("validatePlaybook flags missing `## Owner surface` section", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/## Owner surface[\s\S]*?(?=\n---)/, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing `## Owner surface`/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags `## Owner surface` without a `Governing skill:` line", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/- Governing skill:.*\n/, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Owner surface.*missing.*Governing skill/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook accepts plural `Governing skills:` form", () => {
  // Playbooks that span two surfaces (mobile+web, hubchat+deploy) list
  // multiple skills; the schema should not force them into a single name.
  const errors = validatePlaybook(
    validPlaybook.replace(
      /- Governing skill: `sergeant-web-ui`/,
      "- Governing skills: `sergeant-mobile-expo`, `sergeant-web-ui`",
    ),
    { today: TODAY },
  );
  assert.deepEqual(errors, [], errors.join("; "));
});

test("validatePlaybook flags malformed `Governing skill:` slug (e.g. starts with hyphen)", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(
      /- Governing skill: `sergeant-web-ui`/,
      "- Governing skill: `-bad-slug`",
    ),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Governing skill.*malformed/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags missing `## Verification` section", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(/## Verification[\s\S]*$/, ""),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /missing `## Verification`/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook flags `## Verification` section with no checkboxes", () => {
  const errors = validatePlaybook(
    validPlaybook.replace(
      /## Verification[\s\S]*$/,
      "## Verification\n\n- A bullet, but not a checkbox.\n",
    ),
    { today: TODAY },
  );
  assert.ok(
    errors.some((e) => /Verification.*no checkboxes/.test(e)),
    errors.join("; "),
  );
});

test("validatePlaybook accepts `- [x]` checked checkbox in Verification", () => {
  const errors = validatePlaybook(
    validPlaybook.replace("- [ ] Tests pass.", "- [x] Tests pass."),
    { today: TODAY },
  );
  assert.deepEqual(errors, [], errors.join("; "));
});

test("sliceH2Section returns null when heading is absent", () => {
  assert.equal(
    sliceH2Section(["# H1", "## Other", "body"], /^##\s+Verification/),
    null,
  );
});

test("sliceH2Section stops at the next H2", () => {
  const lines = [
    "# H1",
    "## Owner surface",
    "- Primary: a",
    "- Governing skill: `x`",
    "## Steps",
    "1. step",
  ];
  const slice = sliceH2Section(lines, /^##\s+Owner surface/);
  assert.deepEqual(slice, ["- Primary: a", "- Governing skill: `x`"]);
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
