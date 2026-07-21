// scripts/__tests__/check-governance-sync.test.mjs
//
// Unit tests for ADR dangling-ref exemption helper exported by
// scripts/check-governance-sync.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdrExemptFromDanglingRefCheck } from "../check-governance-sync.mjs";

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
