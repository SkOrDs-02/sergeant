// node --test scripts/__tests__/eval-skill-triggers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  collectSkillSlugs,
  validateGoldenSet,
} from "../eval-skill-triggers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(__dirname, "..", "eval-skill-triggers.mjs");

function makeRepoWithSkills(slugs) {
  const root = mkdtempSync(join(tmpdir(), "skill-eval-test-"));
  for (const slug of slugs) {
    const dir = join(root, ".agents", "skills", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: ${slug}\n---\n# ${slug}\n`,
    );
  }
  return root;
}

function validCasesFor(skill, expected = [skill]) {
  const expectedSkills = expected.includes("sergeant-start-here")
    ? expected
    : ["sergeant-start-here", ...expected];
  return [
    {
      id: `${skill}-trigger-one`,
      skill,
      kind: "trigger",
      prompt: `Please handle the primary ${skill} scenario in this Sergeant repo.`,
      expectedSkills,
      forbiddenSkills: [],
    },
    {
      id: `${skill}-trigger-two`,
      skill,
      kind: "trigger",
      prompt: `Route this second realistic request to ${skill} after start-here.`,
      expectedSkills,
      forbiddenSkills: [],
    },
    {
      id: `${skill}-anti-one`,
      skill,
      kind: "anti-trigger",
      prompt: `This is intentionally about some other Sergeant surface, not ${skill}.`,
      expectedSkills:
        skill === "sergeant-start-here" ? [] : ["sergeant-start-here"],
      forbiddenSkills: [skill],
    },
    {
      id: `${skill}-workflow-one`,
      skill,
      kind: "workflow",
      prompt: `Run the required Sergeant startup flow before using ${skill}.`,
      expectedSkills,
      forbiddenSkills: [],
      complianceChecks: ["start-here-first", "exactly-one-specialist"],
    },
  ];
}

test("collectSkillSlugs returns directories with SKILL.md", () => {
  const root = makeRepoWithSkills(["sergeant-start-here", "sergeant-web-ui"]);
  try {
    assert.deepEqual(collectSkillSlugs(root), [
      "sergeant-start-here",
      "sergeant-web-ui",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateGoldenSet passes a complete minimal fixture", () => {
  const skills = ["sergeant-start-here", "sergeant-web-ui"];
  const golden = {
    schemaVersion: 1,
    cases: [
      ...validCasesFor("sergeant-start-here", ["sergeant-start-here"]),
      ...validCasesFor("sergeant-web-ui", ["sergeant-web-ui"]),
    ],
  };

  const report = validateGoldenSet(golden, skills);
  assert.equal(report.ok, true, report.errors.join("\n"));
});

test("validateGoldenSet fails when a skill has incomplete coverage", () => {
  const report = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: validCasesFor("sergeant-start-here", ["sergeant-start-here"]),
    },
    ["sergeant-start-here", "sergeant-web-ui"],
  );

  assert.equal(report.ok, false);
  assert.ok(
    report.errors.some((error) =>
      error.includes("sergeant-web-ui: missing all golden cases"),
    ),
  );
});

test("validateGoldenSet rejects anti-triggers that still expect the target skill", () => {
  const cases = validCasesFor("sergeant-web-ui", ["sergeant-web-ui"]);
  const anti = cases.find((item) => item.kind === "anti-trigger");
  anti.expectedSkills = ["sergeant-start-here", "sergeant-web-ui"];

  const report = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: [
        ...validCasesFor("sergeant-start-here", ["sergeant-start-here"]),
        ...cases,
      ],
    },
    ["sergeant-start-here", "sergeant-web-ui"],
  );

  assert.equal(report.ok, false);
  assert.ok(
    report.errors.some((error) =>
      error.includes("anti-trigger must not expect its target skill"),
    ),
  );
});

test("validateGoldenSet rejects workflow cases without required checks", () => {
  const cases = validCasesFor("sergeant-web-ui", ["sergeant-web-ui"]);
  const workflow = cases.find((item) => item.kind === "workflow");
  workflow.complianceChecks = ["start-here-first"];

  const report = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: [
        ...validCasesFor("sergeant-start-here", ["sergeant-start-here"]),
        ...cases,
      ],
    },
    ["sergeant-start-here", "sergeant-web-ui"],
  );

  assert.equal(report.ok, false);
  assert.ok(
    report.errors.some((error) =>
      error.includes("workflow case missing exactly-one-specialist"),
    ),
  );
});

test("CLI passes against the real repo golden set", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(result.status, 0, JSON.stringify(parsed.errors, null, 2));
  assert.equal(parsed.ok, true);
  assert.ok(parsed.summary.cases >= parsed.summary.skills * 4);
});
