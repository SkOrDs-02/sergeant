// scripts/docs/__tests__/generate-hard-rules-matrix.test.mjs
//
// Unit + integration tests for the hard-rules registry generator.
// `loadRegistry` / `renderMatrixRaw` / `anchorFromTitle` get exhaustive
// coverage; the on-disk registry is sanity-checked so a malformed JSON
// edit fails before reaching `--check` in CI.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadRegistry,
  renderMatrix,
  renderMatrixRaw,
  anchorFromTitle,
  formatMarkdown,
} from "../generate-hard-rules-matrix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const REGISTRY_PATH = resolve(REPO_ROOT, "docs/governance/hard-rules.json");

// Fixture used across tests: minimum valid registry shape (canonical schema).
const FIXTURE = {
  version: 1,
  source: "AGENTS.md § Hard rules (do not break)",
  rules: [
    {
      id: 1,
      title: "DB types: coerce `bigint` to `number` in serializers",
      scope: ["apps/server/src/modules/**"],
      severity: "blocker",
      enforced_by: [
        {
          kind: "test",
          ref: "apps/server/src/modules/**/*.test.ts (snapshot tests)",
        },
      ],
      links: [
        { type: "issue", ref: "#708" },
        { type: "agents", ref: "#1" },
      ],
    },
    {
      id: 2,
      title: "RQ keys: only via centralized factories",
      scope: ["apps/web/src/**", "apps/mobile/src/**"],
      severity: "blocker",
      enforced_by: [
        {
          kind: "convention",
          ref: "apps/web/src/shared/lib/queryKeys.ts (single source of truth)",
        },
      ],
      links: [{ type: "agents", ref: "#2" }],
    },
  ],
};

// ── loadRegistry ─────────────────────────────────────────────────────────────

test("loadRegistry: accepts the fixture verbatim", () => {
  const r = loadRegistry(FIXTURE);
  assert.equal(r.rules.length, 2);
  assert.equal(r.rules[0].id, 1);
});

test("loadRegistry: parses JSON strings", () => {
  const r = loadRegistry(JSON.stringify(FIXTURE));
  assert.equal(r.rules.length, 2);
});

test("loadRegistry: rejects non-object input", () => {
  assert.throws(() => loadRegistry(null), /expected an object/);
  assert.throws(() => loadRegistry(JSON.stringify(42)), /expected an object/);
});

test("loadRegistry: rejects missing rules array", () => {
  assert.throws(() => loadRegistry({ version: 1 }), /must be an array/);
});

test("loadRegistry: rejects empty rules array", () => {
  assert.throws(
    () => loadRegistry({ version: 1, rules: [] }),
    /at least one rule/,
  );
});

test("loadRegistry: rejects non-integer ids", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[0].id = "HR-1";
  assert.throws(() => loadRegistry(bad), /integer id/);
});

test("loadRegistry: rejects ids below 1", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[0].id = 0;
  assert.throws(() => loadRegistry(bad), /integer id/);
});

test("loadRegistry: rejects duplicate ids", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[1].id = 1;
  assert.throws(() => loadRegistry(bad), /duplicate rule id 1/);
});

test("loadRegistry: rejects rules without a scope", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[0].scope = [];
  assert.throws(() => loadRegistry(bad), /non-empty scope/);
});

test("loadRegistry: rejects rules without enforced_by", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[0].enforced_by = [];
  assert.throws(() => loadRegistry(bad), /enforced_by/);
});

test("loadRegistry: rejects enforced_by entries missing kind/ref", () => {
  const bad = structuredClone(FIXTURE);
  bad.rules[0].enforced_by = [{ kind: "ci" }];
  assert.throws(() => loadRegistry(bad), /missing kind\/ref/);
});

// ── anchorFromTitle ──────────────────────────────────────────────────────────

test("anchorFromTitle: produces the GitHub-style slug used by AGENTS.md", () => {
  assert.equal(
    anchorFromTitle(1, "DB types: coerce `bigint` to `number` in serializers"),
    "1-db-types-coerce-bigint-to-number-in-serializers",
  );
});

test("anchorFromTitle: trims trailing punctuation/spaces", () => {
  assert.equal(
    anchorFromTitle(7, "Pre-commit hooks via Husky — do not skip"),
    "7-pre-commit-hooks-via-husky-do-not-skip",
  );
});

test("anchorFromTitle: numeric prefix matches AGENTS.md heading number", () => {
  for (let i = 1; i <= 15; i += 1) {
    assert.ok(anchorFromTitle(i, "x").startsWith(`${i}-`));
  }
});

// ── renderMatrixRaw ──────────────────────────────────────────────────────────

const FROZEN_NOW = new Date("2026-04-30T00:00:00Z");

test("renderMatrixRaw: header includes Last validated + Next review (≈90d)", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /Last validated:\*\* 2026-04-30/);
  assert.match(md, /Next review:\*\* 2026-07-29/);
  assert.match(md, /\*\*Status:\*\* Active/);
});

test("renderMatrixRaw: emits AUTO-GENERATED warning + regenerate hint", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /AUTO-GENERATED FILE\. Do not edit by hand\./);
  assert.match(md, /pnpm hard-rules:generate/);
});

test("renderMatrixRaw: rule count placeholder matches registry length", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /\*\*2\*\* Hard rules/);
});

test("renderMatrixRaw: matrix has one body row per rule with id + title link", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  const matrixSection = md.split("## Matrix")[1].split("## Severity legend")[0];
  const bodyRows = matrixSection
    .split("\n")
    .filter((l) => l.startsWith("| **") && l.includes("AGENTS.md#"));
  assert.equal(bodyRows.length, FIXTURE.rules.length);
  assert.match(bodyRows[0], /\| \*\*1\*\* /);
  assert.match(bodyRows[0], /AGENTS\.md#1-db-types-coerce-bigint/);
  assert.match(bodyRows[1], /\| \*\*2\*\* /);
});

test("renderMatrixRaw: severity badge mapping for blocker", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /🛑\s*blocker/);
});

test("renderMatrixRaw: scope cells wrap each glob in backticks separated by <br>", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /`apps\/web\/src\/\*\*`<br>`apps\/mobile\/src\/\*\*`/);
});

test("renderMatrixRaw: enforced_by cell uses kind label + ref", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /\*\*Test\*\* apps\/server\/src\/modules/);
  assert.match(md, /\*\*Convention\*\* apps\/web\/src\/shared/);
});

test("renderMatrixRaw: links — issue refs become github.com URLs", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(
    md,
    /\[#708\]\(https:\/\/github\.com\/Skords-01\/Sergeant\/issues\/708\)/,
  );
});

test("renderMatrixRaw: links — agents refs link back to AGENTS.md", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(
    md,
    /AGENTS #1\]\(\.\.\/\.\.\/AGENTS\.md#hard-rules-do-not-break/,
  );
});

test("renderMatrixRaw: missing links column renders as em-dash", () => {
  const fixture = structuredClone(FIXTURE);
  delete fixture.rules[0].links;
  const md = renderMatrixRaw(fixture, { now: FROZEN_NOW });
  // The first body row must contain ` | — |` as its trailing cell.
  const matrixSection = md.split("## Matrix")[1].split("## Severity legend")[0];
  const firstRow = matrixSection
    .split("\n")
    .find((l) => l.startsWith("| **1**"));
  assert.ok(
    firstRow.endsWith(" | — |"),
    `expected em-dash trailing cell, got: ${firstRow}`,
  );
});

test("renderMatrixRaw: severity legend section is present", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /## Severity legend/);
  assert.match(md, /🛑.+`blocker`/);
  assert.match(md, /⚠.+`warning`/);
});

test("renderMatrixRaw: How-to-add-a-rule section references the playbook", () => {
  const md = renderMatrixRaw(FIXTURE, { now: FROZEN_NOW });
  assert.match(md, /## How to add a rule/);
  assert.match(md, /docs\/playbooks\/add-hard-rule\.md/);
});

// ── renderMatrix (Prettier integration) ──────────────────────────────────────

test("renderMatrix: output round-trips through formatMarkdown idempotently", async () => {
  const md = await renderMatrix(FIXTURE, { now: FROZEN_NOW });
  const reformatted = await formatMarkdown(md);
  assert.equal(md, reformatted);
});

// ── On-disk registry sanity ──────────────────────────────────────────────────

test("on-disk hard-rules.json: passes loadRegistry validation", () => {
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const r = loadRegistry(raw);
  assert.ok(r.rules.length >= 1);
  // Every rule must declare scope + enforced_by — the matrix relies on this.
  for (const rule of r.rules) {
    assert.ok(
      Array.isArray(rule.scope) && rule.scope.length >= 1,
      `rule ${rule.id} scope`,
    );
    assert.ok(
      Array.isArray(rule.enforced_by) && rule.enforced_by.length >= 1,
      `rule ${rule.id} enforced_by`,
    );
  }
});

test("on-disk hard-rules.json: ids are sequential 1..N (no gaps)", () => {
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const r = loadRegistry(raw);
  const ids = r.rules.map((x) => x.id);
  for (let i = 0; i < ids.length; i += 1) {
    assert.equal(ids[i], i + 1, `rule index ${i} should have id ${i + 1}`);
  }
});
