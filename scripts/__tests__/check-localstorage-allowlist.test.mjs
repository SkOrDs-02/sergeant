// scripts/__tests__/check-localstorage-allowlist.test.mjs
//
// Unit tests for the localStorage allowlist budget guard.
// Run with:
//   node --test scripts/__tests__/check-localstorage-allowlist.test.mjs
//
// We test the pure parsing helpers (no FS, no env). The CLI runner
// itself is exercised end-to-end via `pnpm lint:localstorage-allowlist`
// in CI.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractWebIgnoresBlock,
  countProductionEntries,
  parseBudgetFile,
} from "../check-localstorage-allowlist.mjs";

// ── extractWebIgnoresBlock ───────────────────────────────────────────────────

describe("extractWebIgnoresBlock", () => {
  it("returns null when the rule wiring is absent", () => {
    const source = `
      module.exports = [
        { rules: { "no-console": "warn" } },
      ];
    `;
    assert.equal(extractWebIgnoresBlock(source), null);
  });

  it("locates the web app's ignores block adjacent to the rule wiring", () => {
    const source = [
      "export default [",
      "  {",
      '    files: ["apps/web/src/**/*.{js,jsx,ts,tsx}"],',
      "    ignores: [",
      '      "apps/web/src/**/*.test.{js,jsx,ts,tsx}",',
      '      "apps/web/src/shared/lib/storage/storage.ts",',
      '      "apps/web/src/shared/hooks/useDarkMode.ts",',
      "    ],",
      "    rules: {",
      '      "sergeant-design/no-raw-local-storage": "error",',
      "    },",
      "  },",
      "];",
      "",
    ].join("\n");

    const block = extractWebIgnoresBlock(source);
    assert.ok(block, "block should be located");
    assert.match(block, /storage\.ts/);
    assert.match(block, /useDarkMode\.ts/);
  });

  it("does NOT match the mobile rule wiring", () => {
    const source = [
      "export default [",
      "  {",
      '    files: ["apps/mobile/src/**/*.{js,jsx,ts,tsx}"],',
      "    ignores: [",
      '      "apps/mobile/src/**/*.test.{js,jsx,ts,tsx}",',
      "    ],",
      "    rules: {",
      '      "sergeant-design/no-raw-local-storage": "error",',
      "    },",
      "  },",
      "];",
      "",
    ].join("\n");

    assert.equal(
      extractWebIgnoresBlock(source),
      null,
      "must not match the mobile glob",
    );
  });
});

// ── countProductionEntries ───────────────────────────────────────────────────

describe("countProductionEntries", () => {
  it("returns 0 for an empty block", () => {
    assert.equal(countProductionEntries("[]"), 0);
  });

  it("ignores the two test-fixture entries", () => {
    const block = `
      ignores: [
        "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
        "apps/web/src/**/__tests__/**",
        "apps/web/src/shared/lib/storage/storage.ts",
        "apps/web/src/shared/hooks/useDarkMode.ts",
      ],
    `;
    assert.equal(countProductionEntries(block), 2);
  });

  it("ignores comments so reviewer notes don't shift the count", () => {
    const block = `
      ignores: [
        // Tests can use localStorage freely as fixtures.
        "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
        // "apps/web/src/shared/hooks/oldHook.ts" — migrated PR #999
        "apps/web/src/shared/hooks/useDarkMode.ts",
      ],
    `;
    assert.equal(countProductionEntries(block), 1);
  });

  it("counts every non-test path exactly once", () => {
    const block = `
      ignores: [
        "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
        "apps/web/src/**/__tests__/**",
        "apps/web/src/a.ts",
        "apps/web/src/b.ts",
        "apps/web/src/c.ts",
      ],
    `;
    assert.equal(countProductionEntries(block), 3);
  });
});

// ── parseBudgetFile ──────────────────────────────────────────────────────────

describe("parseBudgetFile", () => {
  it("accepts a well-formed budget", () => {
    const json = JSON.stringify({
      production: 17,
      rationale: "Baseline 2026-05-04: 11 primitives + 4 cloud-sync + 2 misc.",
    });
    const out = parseBudgetFile(json);
    assert.equal(out.production, 17);
    assert.match(out.rationale, /Baseline/);
  });

  it("floors fractional production counts", () => {
    const json = JSON.stringify({
      production: 17.9,
      rationale: "Reasonable rationale text long enough.",
    });
    assert.equal(parseBudgetFile(json).production, 17);
  });

  it("rejects negative production counts", () => {
    const json = JSON.stringify({
      production: -1,
      rationale: "Reasonable rationale text long enough.",
    });
    assert.throws(() => parseBudgetFile(json), /≥ 0/);
  });

  it("rejects non-numeric production counts", () => {
    const json = JSON.stringify({
      production: "17",
      rationale: "Reasonable rationale text long enough.",
    });
    assert.throws(() => parseBudgetFile(json), /finite number/);
  });

  it("rejects a missing or too-short rationale", () => {
    assert.throws(
      () => parseBudgetFile(JSON.stringify({ production: 1, rationale: "" })),
      /≥ 8 chars/,
    );
    assert.throws(
      () =>
        parseBudgetFile(JSON.stringify({ production: 1, rationale: "short" })),
      /≥ 8 chars/,
    );
    assert.throws(
      () => parseBudgetFile(JSON.stringify({ production: 1 })),
      /rationale/,
    );
  });
});
