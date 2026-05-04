#!/usr/bin/env node
// scripts/check-localstorage-allowlist.mjs
//
// CI metric for the `sergeant-design/no-raw-local-storage` allowlist
// in `eslint.config.js`. Closes diagnostic
// `docs/diagnostics/2026-05-03-web-deep-dive/02-architecture-and-state.md` §2.2
// (and Hard Rule #20 / `docs/tech-debt/frontend.md` §2).
//
// Why a separate script?
//   The ESLint rule itself only fires on **non-allowlisted** files.
//   New `localStorage` users keep going into the allowlist instead of
//   migrating to `safeReadLS`/`safeWriteLS`/`createModuleStorage`. The
//   doc says "17 files" but nothing actually pins that number — the
//   list silently grows on each PR. This script:
//
//     1. Counts the production entries (excludes test globs).
//     2. Compares against a checked-in budget in `.tech-debt/localstorage-allowlist-budget.json`.
//     3. Fails CI if the count exceeds the budget — so adding a new
//        site requires either migrating an existing one OR a
//        deliberate budget bump documented in the same PR.
//     4. Prints the current count + delta from budget for dashboards.
//
// Usage:
//   pnpm lint:localstorage-allowlist
//   LS_ALLOWLIST_BUDGET=20 node scripts/check-localstorage-allowlist.mjs
//
// Exits 1 on budget overrun or a parse failure, 0 otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const ESLINT_CONFIG_PATH = resolve(REPO_ROOT, "eslint.config.js");
const BUDGET_PATH = resolve(
  REPO_ROOT,
  ".tech-debt/localstorage-allowlist-budget.json",
);

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Slice the `eslint.config.js` source into the rule block for
 * `sergeant-design/no-raw-local-storage` scoped to `apps/web/src`.
 *
 * The block is recognised by:
 *   1. A `rules:` line containing `"sergeant-design/no-raw-local-storage"`.
 *   2. Walking BACK to the nearest `files: ["apps/web/src/**...` line
 *      (the rule is also applied to `apps/mobile`; we only count the
 *      web app since that's where the burn-down lives).
 *   3. Walking BACK from there to the nearest `ignores: [` line and
 *      forward to the matching `]`.
 *
 * Returns the raw `ignores` array body as a string, or `null` if the
 * block can't be located.
 */
export function extractWebIgnoresBlock(source) {
  const lines = source.split("\n");

  let ruleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes('"sergeant-design/no-raw-local-storage"') &&
      // Skip the plugin-author `rules:` map (an object literal) — we
      // want the call-site that wires the rule into the web glob.
      lines[i].includes('"error"')
    ) {
      // Look back for the matching `files: ["apps/web/src/...`.
      for (let j = i; j >= Math.max(0, i - 80); j--) {
        if (
          lines[j].includes("files:") &&
          lines[j].includes('"apps/web/src/')
        ) {
          ruleLine = j;
          break;
        }
      }
      if (ruleLine !== -1) break;
    }
  }

  if (ruleLine === -1) return null;

  // Walk forward to the `ignores:` line.
  let ignoresStart = -1;
  for (let i = ruleLine; i < Math.min(lines.length, ruleLine + 60); i++) {
    if (lines[i].includes("ignores:")) {
      ignoresStart = i;
      break;
    }
  }
  if (ignoresStart === -1) return null;

  // Walk forward to the matching `]`. The block is a flat string array
  // — no nested brackets — so a simple counter suffices.
  let depth = 0;
  let blockEnd = -1;
  for (let i = ignoresStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd !== -1) break;
  }
  if (blockEnd === -1) return null;

  return lines.slice(ignoresStart, blockEnd + 1).join("\n");
}

/**
 * Count production allowlist entries inside the `ignores: [...]` block.
 *
 * Test-fixture entries (`**\/*.test.{js,jsx,ts,tsx}`, `**\/__tests__/**`)
 * are intentionally excluded — they aren't burn-down items.
 *
 * Comments (`//`) are stripped so reviewer notes can't shift the count.
 */
export function countProductionEntries(blockText) {
  const stringPaths = blockText
    // Drop line comments so trailing `// note` doesn't hide a path.
    .replace(/\/\/[^\n]*/g, "")
    .match(/"[^"]+"/g);
  if (!stringPaths) return 0;
  let count = 0;
  for (const raw of stringPaths) {
    const path = raw.slice(1, -1);
    // Skip the unconditional test-file ignores. They are NOT burn-down.
    if (
      path === "apps/web/src/**/*.test.{js,jsx,ts,tsx}" ||
      path === "apps/web/src/**/__tests__/**"
    ) {
      continue;
    }
    count++;
  }
  return count;
}

/**
 * Parse the JSON budget file.
 *
 * Shape: `{ "production": <int>, "rationale": "<free text>" }`.
 *
 * `rationale` is mandatory — bumping the budget without a one-line
 * justification is the exact bad-faith review path we want to gate.
 */
export function parseBudgetFile(text) {
  const json = JSON.parse(text);
  if (
    typeof json.production !== "number" ||
    !Number.isFinite(json.production)
  ) {
    throw new Error("budget.production must be a finite number");
  }
  if (json.production < 0) {
    throw new Error("budget.production must be ≥ 0");
  }
  if (typeof json.rationale !== "string" || json.rationale.trim().length < 8) {
    throw new Error(
      "budget.rationale must be a non-empty string ≥ 8 chars (cite the diagnostic / tech-debt section)",
    );
  }
  return { production: Math.floor(json.production), rationale: json.rationale };
}

// ── CLI runner ───────────────────────────────────────────────────────────────

function loadConfig() {
  return readFileSync(ESLINT_CONFIG_PATH, "utf8");
}

function loadBudget() {
  try {
    return readFileSync(BUDGET_PATH, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export function run({ envBudget } = {}) {
  const source = loadConfig();
  const block = extractWebIgnoresBlock(source);
  if (!block) {
    return {
      ok: false,
      count: null,
      budget: null,
      reason:
        "Could not locate the `sergeant-design/no-raw-local-storage` ignores block " +
        "for `apps/web/src` in eslint.config.js. Did the rule wiring change?",
    };
  }

  const count = countProductionEntries(block);

  // Resolve budget: env var wins (for one-off CI dry runs); else file.
  let budget = null;
  let rationale = null;
  if (envBudget !== undefined && envBudget !== null && envBudget !== "") {
    const n = Number(envBudget);
    if (Number.isFinite(n) && n >= 0) budget = Math.floor(n);
  }
  if (budget === null) {
    const raw = loadBudget();
    if (raw === null) {
      return {
        ok: false,
        count,
        budget: null,
        reason:
          `Budget file missing: ${BUDGET_PATH}. ` +
          'Create it with `{ "production": <count>, "rationale": "…" }`.',
      };
    }
    try {
      const parsed = parseBudgetFile(raw);
      budget = parsed.production;
      rationale = parsed.rationale;
    } catch (e) {
      return {
        ok: false,
        count,
        budget: null,
        reason: `Budget file is malformed: ${e.message}`,
      };
    }
  }

  if (count > budget) {
    return {
      ok: false,
      count,
      budget,
      rationale,
      reason:
        `localStorage allowlist grew to ${count} production entries ` +
        `(budget: ${budget}). Either migrate an existing site to ` +
        `safeReadLS/safeWriteLS/createModuleStorage and drop it from ` +
        `eslint.config.js, OR bump the budget in ` +
        `.tech-debt/localstorage-allowlist-budget.json with a clear rationale.`,
    };
  }

  return { ok: true, count, budget, rationale };
}

const isCli =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] || "");

if (isCli) {
  const result = run({ envBudget: process.env.LS_ALLOWLIST_BUDGET });
  if (!result.ok) {
    console.error(`✗ ${result.reason}`);
    if (result.count !== null && result.budget !== null) {
      console.error(
        `  current=${result.count}  budget=${result.budget}  delta=+${
          result.count - result.budget
        }`,
      );
    }
    process.exit(1);
  }
  console.log(
    `✓ localStorage allowlist: ${result.count}/${result.budget} ` +
      `(headroom ${result.budget - result.count})`,
  );
  if (result.rationale) {
    console.log(`  rationale: ${result.rationale}`);
  }
}
