/**
 * Parity test for `sergeant-design/no-raw-tracked-storage`.
 *
 * The rule maintains its own copy of the tracked-key NAMES and
 * VALUES so it does not have to load TypeScript at lint time. This
 * test is the safety net: it parses
 *   - `packages/shared/src/sync/modules.ts` for `STORAGE_KEYS.<NAME>`
 *     references inside `SYNC_MODULES` (the cross-platform registry
 *     introduced in PR #007), and
 *   - `packages/shared/src/lib/storageKeys.ts` for the
 *     `<NAME>: "<value>"` pairs.
 * Then it asserts the rule's two sets are exactly the union of those
 * truths. If a contributor adds a key to `SYNC_MODULES` (or renames
 * a STORAGE_KEYS value) without updating the rule, this test fails
 * — which surfaces the drift in CI before the lint rule itself goes
 * silently stale.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRACKED_STORAGE_KEY_NAMES,
  TRACKED_STORAGE_KEY_VALUES,
} from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function extractTrackedNamesFromConfig(source) {
  // Slice out the SYNC_MODULES literal first, then pull every
  // `STORAGE_KEYS.<NAME>` token from within it. Anything outside the
  // literal (e.g. mobile-only `STORAGE_KEYS.MOBILE_*` bookkeeping
  // keys exported from `apps/mobile/src/sync/config.ts`) is not
  // payload and stays out of the parity check.
  const m = source.match(/export\s+const\s+SYNC_MODULES\s*=\s*\{/);
  if (!m) return new Set();
  const openBrace = m.index + m[0].length - 1;
  if (openBrace === -1) return new Set();
  // Walk braces until we close the SYNC_MODULES object literal.
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return new Set();
  const slice = source.slice(openBrace, end + 1);
  const matches = slice.matchAll(/STORAGE_KEYS\.([A-Z0-9_]+)/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

function extractStorageKeyValueMap(source) {
  // Match  `IDENT: "value",`  inside the `STORAGE_KEYS = { … }` object.
  // Handles both `'…'` and `"…"` quotes; ignores trailing comments.
  const map = new Map();
  const re = /^\s*([A-Z0-9_]+)\s*:\s*["']([^"']+)["']\s*,/gm;
  for (const m of source.matchAll(re)) {
    map.set(m[1], m[2]);
  }
  return map;
}

describe("no-raw-tracked-storage parity with SYNC_MODULES", () => {
  const configSrc = read("packages/shared/src/sync/modules.ts");
  const keysSrc = read("packages/shared/src/lib/storageKeys.ts");

  const expectedNames = extractTrackedNamesFromConfig(configSrc);
  const valueMap = extractStorageKeyValueMap(keysSrc);

  it("extracts a non-empty set from SYNC_MODULES (sanity)", () => {
    assert.ok(
      expectedNames.size > 0,
      "Could not extract any STORAGE_KEYS.<NAME> from SYNC_MODULES — has the config.ts shape changed?",
    );
    assert.ok(
      valueMap.size > 0,
      "Could not extract any STORAGE_KEYS entries from storageKeys.ts — has the file shape changed?",
    );
  });

  it("rule's TRACKED_STORAGE_KEY_NAMES matches SYNC_MODULES exactly", () => {
    const ruleNames = new Set(TRACKED_STORAGE_KEY_NAMES);
    const missing = [...expectedNames].filter((n) => !ruleNames.has(n));
    const extra = [...ruleNames].filter((n) => !expectedNames.has(n));
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      "Rule's TRACKED_STORAGE_KEY_NAMES drifted from SYNC_MODULES. " +
        "Update packages/eslint-plugin-sergeant-design/index.js to match.",
    );
  });

  it("rule's TRACKED_STORAGE_KEY_VALUES matches the resolved STORAGE_KEYS values", () => {
    const expectedValues = new Set();
    for (const name of expectedNames) {
      const v = valueMap.get(name);
      assert.ok(
        typeof v === "string",
        `STORAGE_KEYS.${name} referenced from SYNC_MODULES but not found in storageKeys.ts`,
      );
      expectedValues.add(v);
    }
    const ruleValues = new Set(TRACKED_STORAGE_KEY_VALUES);
    const missing = [...expectedValues].filter((v) => !ruleValues.has(v));
    const extra = [...ruleValues].filter((v) => !expectedValues.has(v));
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      "Rule's TRACKED_STORAGE_KEY_VALUES drifted from STORAGE_KEYS. " +
        "Update packages/eslint-plugin-sergeant-design/index.js to match.",
    );
  });
});
