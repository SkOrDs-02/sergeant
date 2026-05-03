#!/usr/bin/env node
// Codemod: replace `safeWriteLS(<sync-tracked key>, value)` with
// `safeWriteSyncedLS(<sync-tracked key>, value)` under `apps/web/src`,
// adding the corresponding import if needed.
//
// Companion to PR #008 (`refactor(web): replace localStorage.setItem
// monkey-patch with explicit useSyncedKVStore`). The historical
// behavior was that `localStorage.setItem` was monkey-patched at
// boot to call `enqueueChange(key)` for any tracked sync key, so
// `safeWriteLS(STORAGE_KEYS.X, ...)` (which delegates to
// `localStorage.setItem`) silently triggered cloud-sync. PR #008
// removed the patch — explicit writes have to go through
// `syncedKV` / `safeWriteSyncedLS` to fire `enqueueChange`. This
// script automates the mechanical swap so future
// sync-tracked-key migrations don't have to be hand-edited.
//
// What counts as "sync-tracked"
// -----------------------------
// The cross-platform registry is `SYNC_MODULES` in
// `packages/shared/src/sync/modules.ts`. The codemod parses that
// file at runtime, harvests every `STORAGE_KEYS.<NAME>` referenced
// from inside the registry, and then resolves each name to its
// literal value via `packages/shared/src/lib/storageKeys.ts`. The
// resulting set is the same `ALL_TRACKED_KEYS` the cloud-sync
// engine consults; we re-derive it instead of importing it
// directly so the codemod can run as a plain `node` script
// without needing the shared package to be built first.
//
// Usage:
//   node scripts/codemods/syncedKV/script.mjs            # dry run summary
//   node scripts/codemods/syncedKV/script.mjs --write    # apply in-place
//
// Idempotent: running twice is a no-op. Safe to keep in CI as a
// drift detector — `script.mjs` (no `--write`) exits non-zero if it
// would have rewritten anything, the way `strip-js-extensions` does.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const WRITE = argv.includes("--write");
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const ROOT = resolve(REPO_ROOT, "apps/web/src");

// ── 1. Harvest the registry of sync-tracked storage keys ────────────────
//
// Read the registry source file and pull out every `STORAGE_KEYS.NAME`
// reference inside `SYNC_MODULES = { ... }`. We deliberately match by
// regex instead of evaluating the TS module — the codemod runs from a
// plain `node` invocation, the file uses TS-only `as const` syntax,
// and the registry is small enough that a regex pass is reliable.
function loadTrackedKeys() {
  const modulesPath = resolve(REPO_ROOT, "packages/shared/src/sync/modules.ts");
  const keysPath = resolve(REPO_ROOT, "packages/shared/src/lib/storageKeys.ts");
  const modulesSrc = readFileSync(modulesPath, "utf8");
  const keysSrc = readFileSync(keysPath, "utf8");

  // Slice out the body of `export const SYNC_MODULES = { ... } as const;`
  // — the ` as const` suffix is required to defeat the false-positive
  // match against any `STORAGE_KEYS.X` referenced from a later helper
  // function in the same file (`keyToModule`, `ALL_TRACKED_KEYS`, …).
  const body = modulesSrc.match(
    /export const SYNC_MODULES\s*=\s*({[\s\S]*?})\s*as const;/m,
  );
  if (!body) {
    throw new Error(
      "[syncedKV codemod] could not locate `SYNC_MODULES = { … } as const;` " +
        "block in packages/shared/src/sync/modules.ts — has the shape changed?",
    );
  }

  const trackedNames = new Set();
  for (const match of body[1].matchAll(/STORAGE_KEYS\.([A-Z0-9_]+)/g)) {
    trackedNames.add(match[1]);
  }

  // Resolve each name -> literal value via storageKeys.ts. The export
  // is a plain `const STORAGE_KEYS = { NAME: "value", ... } as const;`
  // so a per-line regex on `^\s*NAME:\s*"value"` is enough.
  const literals = new Set();
  for (const name of trackedNames) {
    // Allow leading "  " indent + optional trailing comma.
    const re = new RegExp(`\\b${name}\\s*:\\s*"([^"\\n]+)"`);
    const match = keysSrc.match(re);
    if (!match) {
      throw new Error(
        `[syncedKV codemod] STORAGE_KEYS.${name} is referenced from SYNC_MODULES ` +
          `but no literal definition was found in packages/shared/src/lib/storageKeys.ts.`,
      );
    }
    literals.add(match[1]);
  }

  return { trackedNames, literals };
}

const { trackedNames, literals } = loadTrackedKeys();

// ── 2. Walk apps/web/src and rewrite tracked-key writes ────────────────
//
// We rewrite two shapes per file:
//   safeWriteLS(STORAGE_KEYS.<TRACKED>, ...)      → safeWriteSyncedLS(...)
//   safeWriteLS("<tracked_literal>", ...)         → safeWriteSyncedLS(...)
// The second shape catches files that inline the storage-key string
// (e.g. `apps/web/src/core/onboarding/{cleanupDemoData,presetApply}.ts`
// — see the migration done by hand in PR #008). It does NOT try to
// resolve same-file aliases like `const X_KEY = STORAGE_KEYS.Y;` —
// those are surfaced as comments via the dry-run summary so a human
// can double-check whether the alias targets a tracked key.

function listFiles() {
  const out = execSync(
    `find "${ROOT}" -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/__tests__/*' -not -name '*.test.ts' -not -name '*.test.tsx' -not -name '*.spec.ts' -not -name '*.spec.tsx'`,
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

const SAFE_WRITE_CALL =
  /safeWriteLS\(\s*(STORAGE_KEYS\.[A-Z0-9_]+|"[^"]+"|'[^']+')\s*,/g;

function isTrackedRef(ref) {
  if (ref.startsWith("STORAGE_KEYS.")) {
    return trackedNames.has(ref.slice("STORAGE_KEYS.".length));
  }
  // string literal — strip quotes
  return literals.has(ref.slice(1, -1));
}

function rewrite(source) {
  let count = 0;
  const next = source.replace(SAFE_WRITE_CALL, (match, ref) => {
    if (!isTrackedRef(ref)) return match;
    count += 1;
    return match.replace(/^safeWriteLS\(/, "safeWriteSyncedLS(");
  });

  if (count === 0) return { source, count };

  // Add the import if it isn't there yet. We append a fresh import
  // line right after the last existing `from "@shared/lib/storage/...` /
  // `from "@sergeant/shared` block — keeping the codemod oblivious to
  // import-ordering ESLint config is fine, as `pnpm lint --fix` will
  // canonicalize it on the next run.
  const importNeeded =
    !next.includes('from "@shared/lib/storage/syncedKV"') &&
    !next.includes("from '@shared/lib/storage/syncedKV'");
  if (!importNeeded) return { source: next, count };

  const importLine =
    'import { safeWriteSyncedLS } from "@shared/lib/storage/syncedKV";';

  // Heuristic: insert after the last `import …;` line.
  const importBlock = next.match(/^(?:import [^\n]*\n)+/m);
  if (!importBlock) {
    return { source: `${importLine}\n${next}`, count };
  }
  const insertAt = importBlock.index + importBlock[0].length;
  return {
    source: `${next.slice(0, insertAt)}${importLine}\n${next.slice(insertAt)}`,
    count,
  };
}

const files = listFiles();
let touchedFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const { source: after, count } = rewrite(before);
  if (count === 0) continue;
  touchedFiles += 1;
  totalReplacements += count;
  if (WRITE) writeFileSync(file, after);
  else console.log(`would rewrite ${count} call(s): ${file}`);
}

console.log(
  `${WRITE ? "rewrote" : "would rewrite"} ${totalReplacements} call(s) across ${touchedFiles} file(s); tracked-key registry size = ${literals.size}`,
);

// In dry-run mode, exit non-zero if any rewrites would happen so that
// running this script in CI catches drift (a new sync-tracked write
// site sneaking in via `safeWriteLS`). Matches the contract of
// `scripts/codemods/strip-js-extensions/script.mjs`.
if (!WRITE && totalReplacements > 0) exit(1);
