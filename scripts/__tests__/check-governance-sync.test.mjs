// scripts/__tests__/check-governance-sync.test.mjs
//
// Unit tests for ADR dangling-ref exemption helper exported by
// scripts/check-governance-sync.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAdrExemptFromDanglingRefCheck,
  parseAgentsTableRules,
} from "../check-governance-sync.mjs";

const ADR = "docs/04-governance/adr/0099-fixture.md";

test("isAdrExemptFromDanglingRefCheck: non-ADR paths are not exempt", () => {
  assert.equal(
    isAdrExemptFromDanglingRefCheck("- **Status:** Accepted\n", "docs/foo.md"),
    false,
  );
});

test("isAdrExemptFromDanglingRefCheck: proposed ADRs are exempt", () => {
  assert.equal(
    isAdrExemptFromDanglingRefCheck("- **Status:** proposed\n", ADR),
    true,
  );
});

test("isAdrExemptFromDanglingRefCheck: superseded ADRs are exempt (case-insensitive)", () => {
  assert.equal(
    isAdrExemptFromDanglingRefCheck(
      "- **Status:** Superseded by [ADR-0075](./0075.md)\n",
      ADR,
    ),
    true,
  );
  assert.equal(
    isAdrExemptFromDanglingRefCheck("> **Status:** superseded\n", ADR),
    true,
  );
});

test("isAdrExemptFromDanglingRefCheck: header Historical note exempts ADR", () => {
  const header = [
    "# ADR",
    "- **Status:** Accepted",
    "- **Note:** Historical — paths describe pre-decommission layout; see ADR-0075.",
  ].join("\n");
  assert.equal(isAdrExemptFromDanglingRefCheck(header, ADR), true);
});

test("isAdrExemptFromDanglingRefCheck: body-only historical mention does not exempt", () => {
  const body = [
    "# ADR",
    "- **Status:** Accepted",
    "",
    "---",
    "",
    "Note: this is historical context in the body.",
  ].join("\n");
  assert.equal(isAdrExemptFromDanglingRefCheck(body, ADR), false);
});

// ── parseAgentsTableRules ────────────────────────────────────────────────────
//
// Регресія: Hard Rules мають розриви в нумерації (ADR-0081 вилучив #8/#9/
// #11–#14/#16/#17/#24). Ordered list цього не переживає — Prettier нормалізує
// маркери й схлопує розриви в 1..N, після чого sync-чек рапортує весь хвіст як
// «missing». Таблиця розриви зберігає; тест це фіксує.

test("parseAgentsTableRules: gapped rule numbers survive verbatim", () => {
  const table = [
    "| #   | Rule                        |",
    "| --- | --------------------------- |",
    "| 1   | DB types: coerce bigint     |",
    "| 7   | Pre-commit hooks via Husky  |",
    "| 10  | Lifecycle markers           |",
    "| 26  | PR-ledger update on merge   |",
  ].join("\n");

  const rules = parseAgentsTableRules(table);

  assert.deepEqual([...rules.keys()], [1, 7, 10, 26]);
  assert.equal(rules.get(10), "Lifecycle markers");
});

test("parseAgentsTableRules: link markup is stripped from titles", () => {
  const table = [
    "| #   | Rule                                    |",
    "| --- | --------------------------------------- |",
    "| 4   | [SQL migrations](./rules/04-sql.md)     |",
  ].join("\n");

  assert.equal(parseAgentsTableRules(table).get(4), "SQL migrations");
});

test("parseAgentsTableRules: non-numeric and separator rows are ignored", () => {
  const table = [
    "| Path        | Owner       |",
    "| ----------- | ----------- |",
    "| apps/web/** | @SkOrDs-02  |",
  ].join("\n");

  assert.equal(parseAgentsTableRules(table).size, 0);
});
