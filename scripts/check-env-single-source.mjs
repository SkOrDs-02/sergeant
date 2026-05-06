#!/usr/bin/env node
// scripts/check-env-single-source.mjs
//
// CI guard for the env-modules unification (stack-pulse-2026-05 PR-01,
// `docs/initiatives/stack-pulse-2026-05/pr-01-unify-env-modules.md`).
//
// **Phase 1 — burn-down budget.**
//
// PR-01 unified the env *schema* (single Zod source of truth in
// `apps/server/src/env/env.ts`, with `apps/server/src/env.ts` reduced to
// a thin re-export). It deliberately did NOT migrate the ~110 stale
// `process.env[…]` reads scattered across `auth.ts`, `cors.ts`, the
// e-mail layer, `obs/*`, and assorted modules — that's a 1-week refactor
// of its own (Phase 2). To prevent **new** raw reads from sneaking in
// while Phase 2 lands incrementally, this script enforces a checked-in
// budget: count current offenders and refuse to grow it.
//
// What it does:
//   1. Walks `apps/server/src/**/*.{ts,tsx}` (skipping tests, the
//      env-layer itself, and bootstrap entry-points — see `ALLOWLIST`).
//   2. Counts every `process.env` read still reachable from runtime
//      code paths.
//   3. Compares against the baseline pinned in
//      `.tech-debt/env-single-source-budget.json`. Fails if the count
//      grew.
//   4. Tells the dev *which* file:line to migrate so the burn-down
//      stays directional (no whack-a-mole with untouched callers).
//
// Allowlist (deliberate, narrow):
//   - `apps/server/src/env/env.ts`        — canonical Zod schema.
//   - `apps/server/src/env/betterAuthEnv.ts` — Better-Auth-scoped
//     production checks (folded into `assertStartupEnv` over time
//     but still legitimate today).
//   - `apps/server/src/env.ts`            — backward-compat re-export.
//   - `apps/server/src/index.ts`          — bootstrap; `dotenv.config()`
//     happens here before any runtime code reads `env`.
//   - `apps/server/src/sentry.ts`         — preload module, runs before
//     env validation (Sentry needs DSN before our schema parses).
//   - `**/*.test.ts(x)`, `**/__tests__/**` — tests legitimately stub
//     `process.env` via `vi.stubEnv()` to drive `assertStartupEnv` etc.
//
// Exit codes:
//   0 — count ≤ budget. Prints headroom.
//   1 — count > budget OR budget file missing/malformed. Stderr lists
//       the file:line offenders so the dev can pick something to
//       migrate (or, if a Phase-2 PR genuinely lowers the number, the
//       same script tells them what to set the new budget to).
//
// Usage:
//   pnpm lint:env-single-source
//   ENV_SINGLE_SOURCE_BUDGET=110 node scripts/check-env-single-source.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SERVER_SRC = resolve(REPO_ROOT, "apps", "server", "src");
const BUDGET_PATH = resolve(
  REPO_ROOT,
  ".tech-debt",
  "env-single-source-budget.json",
);

const ALLOWLIST = new Set(
  [
    "apps/server/src/env/env.ts",
    "apps/server/src/env/betterAuthEnv.ts",
    "apps/server/src/env.ts",
    "apps/server/src/index.ts",
    "apps/server/src/sentry.ts",
  ].map((p) => p.split("/").join(sep)),
);

const TEST_SUFFIX = /\.test\.(?:ts|tsx)$/;
const TS_FILE = /\.(?:ts|tsx)$/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
        continue;
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}

/**
 * Strip line- and block-comments so we don't flag a JSDoc paragraph
 * that mentions `process.env` or a `//`-commented snippet.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function findOffenders(source) {
  const stripped = stripComments(source);
  const lines = stripped.split("\n");
  const hits = [];
  // Match `process.env` (with optional whitespace around the dot) so
  // both `process.env.FOO` and `process.env["FOO"]` are caught. Each
  // match is one read; a single line can host several (`process.env.X
  // || process.env.Y`) and we count each.
  const re = /\bprocess\s*\.\s*env\b/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let count = 0;
    while (re.exec(line) !== null) count++;
    if (count > 0) {
      hits.push({ line: i + 1, snippet: line.trim(), count });
    }
  }
  return hits;
}

function isAllowlisted(relativePath) {
  if (TEST_SUFFIX.test(relativePath)) return true;
  if (relativePath.split(sep).includes("__tests__")) return true;
  return ALLOWLIST.has(relativePath);
}

export function scan() {
  const failures = [];
  let total = 0;
  for (const file of walk(SERVER_SRC)) {
    if (!TS_FILE.test(file)) continue;
    const rel = relative(REPO_ROOT, file);
    if (isAllowlisted(rel)) continue;
    const source = readFileSync(file, "utf8");
    const offenders = findOffenders(source);
    if (offenders.length === 0) continue;
    for (const { line, snippet, count } of offenders) {
      total += count;
      failures.push({
        file: rel.split(sep).join("/"),
        line,
        snippet,
        count,
      });
    }
  }
  return { total, failures };
}

function loadBudget() {
  try {
    const raw = readFileSync(BUDGET_PATH, "utf8");
    const json = JSON.parse(raw);
    if (typeof json.budget !== "number" || !Number.isFinite(json.budget)) {
      throw new Error("budget must be a finite number");
    }
    if (json.budget < 0) throw new Error("budget must be ≥ 0");
    if (
      typeof json.rationale !== "string" ||
      json.rationale.trim().length < 8
    ) {
      throw new Error(
        "rationale must be a non-empty string ≥ 8 chars (cite the migration plan)",
      );
    }
    return { budget: Math.floor(json.budget), rationale: json.rationale };
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

function envBudget() {
  const v = process.env["ENV_SINGLE_SOURCE_BUDGET"];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

const isCli =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] || "");

if (isCli) {
  const { total, failures } = scan();

  let budget;
  let rationale = null;
  const fromEnv = envBudget();
  if (fromEnv !== null) {
    budget = fromEnv;
  } else {
    const fileBudget = loadBudget();
    if (fileBudget === null) {
      console.error(
        `✗ Budget file missing: ${relative(REPO_ROOT, BUDGET_PATH)}.\n` +
          `  Create it with { "budget": ${total}, "rationale": "<cite stack-pulse-2026-05 PR-01 Phase 2>" }.\n` +
          `  Current count: ${total}.`,
      );
      process.exit(1);
    }
    budget = fileBudget.budget;
    rationale = fileBudget.rationale;
  }

  if (total > budget) {
    console.error(
      `✗ Disallowed \`process.env\` reads grew: ${total} > budget ${budget}` +
        ` (delta +${total - budget}).`,
    );
    console.error("");
    console.error("Offenders:");
    for (const f of failures) {
      console.error(`  ${f.file}:${f.line}`);
      console.error(`    ${f.snippet}`);
    }
    console.error("");
    console.error(
      `Migrate at least ${total - budget} read(s) to \`import { env } from "../env.js"\` (or \`./env/env.js\`)`,
    );
    console.error(
      `so values pass through Zod validation + defaults. Phase-2 plan:`,
    );
    console.error(
      `docs/initiatives/stack-pulse-2026-05/pr-01-unify-env-modules.md`,
    );
    process.exit(1);
  }

  if (total < budget) {
    console.log(
      `✓ env single-source: ${total}/${budget} reads (headroom ${budget - total}).`,
    );
    console.log(
      `  Burn-down progress! Lower the budget in ${relative(REPO_ROOT, BUDGET_PATH)} to ${total}.`,
    );
  } else {
    console.log(
      `✓ env single-source: ${total}/${budget} reads (no headroom; matches baseline).`,
    );
  }
  if (rationale) console.log(`  rationale: ${rationale}`);
}
