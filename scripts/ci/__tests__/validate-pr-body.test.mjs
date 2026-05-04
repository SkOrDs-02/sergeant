// scripts/ci/__tests__/validate-pr-body.test.mjs
//
// Unit tests for the PR-body validator.
// Run with: node --test scripts/ci/__tests__/validate-pr-body.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  splitSections,
  countCheckboxes,
  validate,
  REQUIRED_SECTIONS,
  SECTIONS_REQUIRING_ALL_TICKED,
} from "../validate-pr-body.mjs";

// A minimal body that satisfies the validator. Mirrors the post-`0318b8a6`
// `.github/PULL_REQUEST_TEMPLATE.md` structure (Summary + Governing Skill +
// Playbook + Verification + Docs and Governance + Risk and Rollout +
// Hard Rule #15 + Reviewer Notes); the historical `What changed` / `Why` /
// `How to test` / `Pre-flight` / `Docs updated alongside code?` sections
// were renamed by the consolidation commit.
const VALID_BODY = `
## Summary

Added foo to bar. See \`apps/server/src/foo.ts\`.

## Governing Skill

- Primary skill: \`sergeant-server-api\`
- Secondary skill (if truly needed): n/a

## Playbook

- Primary playbook: \`docs/playbooks/add-api-endpoint.md\`
- Why this playbook: it adds a new \`/api/foo\` route end-to-end.
- If no playbook matched, why: n/a

## Verification

\`\`\`
pnpm test --filter foo
\`\`\`

Additional checks:

- [x] Local smoke / manual validation completed
- [ ] Surface-specific checks completed

## Docs and Governance

- [x] I updated docs that changed with the behavior, contract, workflow, or rollout.
- [ ] I checked whether \`AGENTS.md\` needed an update.
- [ ] I checked whether a playbook or skill needed an update.
- [ ] I checked whether governance docs or review docs needed an update.

Updated docs:

- n/a

## Risk and Rollout

- User-visible risk: none.
- Rollout / deploy order: standard merge.
- Backout plan: revert.

## Hard Rule #15

- [x] I read \`AGENTS.md\` before coding.
- [x] Internal docs I touched are in Ukrainian.
- [x] I did not use \`--no-verify\`.

## Reviewer Notes

n/a
`;

describe("splitSections", () => {
  it("splits a body into H2 sections", () => {
    const sections = splitSections(
      "prelude\n## A\naaa\n## B\nbbb\n## C\nccc\n",
    );
    const headings = sections.map((s) => s.heading);
    assert.deepEqual(headings, [null, "A", "B", "C"]);
  });
});

describe("countCheckboxes", () => {
  it("counts ticked and unticked separately", () => {
    const body = [
      "- [x] done one",
      "- [X] done two",
      "- [ ] not done",
      "* [ ] starred unticked",
      "plain text - [x] not a checkbox (no leading bullet)",
    ].join("\n");
    const { ticked, unticked } = countCheckboxes(body);
    assert.equal(ticked, 2);
    assert.equal(unticked, 2);
  });
});

describe("validate", () => {
  it("accepts a well-formed body", () => {
    const r = validate(VALID_BODY);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });

  it("rejects an empty body", () => {
    const r = validate("");
    assert.equal(r.ok, false);
    assert.match(r.errors.join("\n"), /empty or suspiciously short/);
  });

  it("rejects a body missing every section", () => {
    const r = validate(
      "just a one-line summary without headings — lorem ipsum dolor sit amet consectetur adipiscing elit",
    );
    assert.equal(r.ok, false);
    for (const required of REQUIRED_SECTIONS) {
      assert.match(
        r.errors.join("\n"),
        new RegExp(required.replace(/[.()#?]/g, ".")),
      );
    }
  });

  it("rejects a body where Hard Rule #15 has no ticked box", () => {
    const body = VALID_BODY.replaceAll("- [x]", "- [ ]");
    const r = validate(body);
    assert.equal(r.ok, false);
    assert.match(r.errors.join("\n"), /Hard Rule #15/);
  });

  it("rejects a body where Hard Rule #15 has only 1 of 3 ticked", () => {
    // Untick the second and third boxes — historical "≥1 ticked" loophole.
    const body = VALID_BODY.replace(
      "- [x] Internal docs I touched are in Ukrainian.",
      "- [ ] Internal docs I touched are in Ukrainian.",
    ).replace(
      "- [x] I did not use `--no-verify`.",
      "- [ ] I did not use `--no-verify`.",
    );
    const r = validate(body);
    assert.equal(r.ok, false, "expected strict 3-of-3 validator to fail");
    assert.match(r.errors.join("\n"), /Hard Rule #15/);
    assert.match(r.errors.join("\n"), /unticked checkbox/);
  });

  it("rejects a body where Hard Rule #15 has 2 of 3 ticked", () => {
    const body = VALID_BODY.replace(
      "- [x] I did not use `--no-verify`.",
      "- [ ] I did not use `--no-verify`.",
    );
    const r = validate(body);
    assert.equal(r.ok, false);
    assert.match(r.errors.join("\n"), /Hard Rule #15/);
  });

  it("accepts a body where Hard Rule #15 has all 3 ticked", () => {
    // Sanity: VALID_BODY already has all 3 ticked. This locks the contract.
    const r = validate(VALID_BODY);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.deepEqual(SECTIONS_REQUIRING_ALL_TICKED, ["Hard Rule #15"]);
  });

  it("rejects a body where Docs and Governance has no ticked box", () => {
    const body = VALID_BODY.replace(
      "- [x] I updated docs",
      "- [ ] I updated docs",
    );
    const r = validate(body);
    assert.equal(r.ok, false);
    assert.match(r.errors.join("\n"), /Docs and Governance/);
  });

  it("rejects a body where Summary is only HTML comments", () => {
    const body = VALID_BODY.replace(
      "Added foo to bar. See `apps/server/src/foo.ts`.",
      "<!-- TODO -->",
    );
    const r = validate(body);
    assert.equal(r.ok, false);
    assert.match(r.errors.join("\n"), /Summary/);
  });
});
