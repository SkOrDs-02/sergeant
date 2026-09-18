// scripts/docs/__tests__/lint-initiative-agent-ready.test.mjs
//
// Unit tests for the `lint:initiative-agent-ready` CI gate
// (Initiative 0015, Phase 2 / PR-2.3).
// Run with: node --test scripts/docs/__tests__/lint-initiative-agent-ready.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluate } from "../lint-initiative-agent-ready.mjs";

describe("lint-initiative-agent-ready evaluate", () => {
  const fixtures = {
    "0001-ok.md": "> **Status:** Active\n> **Agent-ready:** yes\n",
    "0002-needs.md": "> **Agent-ready:** needs-decision\n",
    "0003-blocked.md": "> **Agent-ready:** `blocked` — waiting\n",
    "0004-missing.md": "> **Status:** In progress\n",
    "0005-invalid.md": "> **Agent-ready:** maybe\n",
  };
  const read = (name) => fixtures[name];

  it("accepts the three allowed values (incl. backticked)", () => {
    const rows = evaluate(
      ["0001-ok.md", "0002-needs.md", "0003-blocked.md"],
      read,
    );
    assert.deepEqual(
      rows.map((r) => [r.value, r.ok]),
      [
        ["yes", true],
        ["needs-decision", true],
        ["blocked", true],
      ],
    );
  });

  it("flags missing and invalid values", () => {
    const rows = evaluate(["0004-missing.md", "0005-invalid.md"], read);
    assert.equal(rows[0].value, null);
    assert.equal(rows[0].ok, false);
    assert.equal(rows[1].value, null); // `maybe` is not a recognised value
    assert.equal(rows[1].ok, false);
  });
});
