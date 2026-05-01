#!/usr/bin/env node
/**
 * Generates / validates `THIRD_PARTY_LICENSES.md` from the current
 * production dependency tree of `@sergeant/web` and `@sergeant/server`
 * — the two workspaces that actually ship to end users (Vercel build
 * artefacts + Railway-served Express runtime).
 *
 * Modes:
 *   pnpm licenses:gen           # default; writes the file
 *   pnpm licenses:check         # CI mode; fails if the committed file
 *                               # is out-of-date **or** any shipped
 *                               # package declares a license outside
 *                               # ALLOWED_LICENSES
 *
 * How it works:
 *   1. Invokes `pnpm --filter @sergeant/web --filter @sergeant/server
 *      licenses list --prod --json` to get every installed package's
 *      declared license.
 *   2. Filters out packages in the `DEV_*` lists below. These are
 *      compile-time / test-time tooling that pnpm pulls in through
 *      workspace peer dependencies (most notably `@better-auth/expo`
 *      → `expo-constants` → `expo` → `babel-preset-expo` → the entire
 *      RN/Babel/Metro toolchain) but that never end up in either the
 *      Vite-built browser bundle or the Node-side Express runtime.
 *      Keeping them would triple the file with false positives that
 *      are never shipped.
 *   3. In `--check` mode, validates each remaining package's license
 *      against `ALLOWED_LICENSES` and exits non-zero on any violation
 *      (this replaces the pre-pnpm root-level license-checker step
 *      that became a silent no-op after the workspace migration — see
 *      #516 for background).
 *   4. Writes (or compares) a sorted, de-duplicated Markdown list to
 *      the repo root, matching the historical format:
 *          - [<pkg>@<version>](<homepage>) - <license>
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "THIRD_PARTY_LICENSES.md");

// Our own workspace packages — never listed in the SBOM.
const WORKSPACE_EXACT = new Set([
  "sergeant",
  "@sergeant/web",
  "@sergeant/server",
  "@sergeant/shared",
  "@sergeant/api-client",
  "@sergeant/config",
  "@sergeant/mobile",
  "@sergeant/mobile-shell",
  "@sergeant/finyk-domain",
  "@sergeant/fizruk-domain",
  "@sergeant/routine-domain",
  "eslint-plugin-sergeant-design",
]);

// Build/test tooling pulled through peer chains but never shipped.
// Order roughly by chain: TS type-only, Babel/Metro/RN (Expo chain),
// test runners, bundlers, linters, monorepo tooling, DevTools, Detox,
// Sentry internals.
const DEV_PREFIXES = [
  "@types/",
  "@typescript-eslint/",
  "@babel/",
  "babel-plugin-",
  "babel-preset-",
  "babel-",
  "@react-native/",
  "@react-native-community/",
  "@react-native-async-storage/",
  "react-native",
  "react-devtools",
  "@expo/cli",
  "@expo/config",
  "@expo/dev",
  "@expo/env",
  "@expo/json",
  "@expo/logger",
  "@expo/metro",
  "@expo/package-manager",
  "@expo/plist",
  "@expo/prebuild-config",
  "@expo/rudder",
  "@expo/sdk-runtime",
  "@expo/spawn-async",
  "@expo/vector-icons",
  "@expo/xcpretty",
  "expo-",
  "metro",
  "@jest/",
  "jest-",
  "@testing-library/",
  "@vitest/",
  "@rollup/",
  "@vitejs/",
  "@swc/",
  "@esbuild/",
  "@eslint/",
  "eslint-plugin-",
  "eslint-config-",
  "eslint-",
  "@detox/",
  "detox",
  "@sentry-internal/",
  "@npmcli/",
  "@pnpm/",
];

const DEV_EXACT = new Set([
  "jest",
  "vitest",
  "rollup",
  "vite",
  "typescript",
  "esbuild",
  "eslint",
  "prettier",
  "expo",
  "tsx",
  "turbo",
  "husky",
  "lint-staged",
  "nodemon",
  "babel-jest",
  "babel-core",
  "flow-bin",
  "flow-parser",
  "jsc-android",
  "hermes-engine",
  "react-devtools-core",
  "react-native-worklets",
]);

// Same allowlist the previous root-level `license-checker-rseidelsohn`
// invocation used in `.github/workflows/ci.yml` — kept verbatim so a
// policy change can be audited against the pre-pnpm baseline. MPL-2.0
// is in the list solely because of `web-push`, our one copyleft dep;
// THIRD_PARTY_LICENSES.md is the attribution file that satisfies its
// reciprocity clause.
const ALLOWED_LICENSES = new Set([
  "MIT",
  "MIT*",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSD", // generic BSD (e.g. readline@1.3.0); permissive parent of the
  // Clause variants, safe to accept when upstream didn't pin a specific
  // clause count.
  "MIT-0",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "MPL-2.0",
  "Unlicense", // public-domain dedication (stream-buffers@2.2.0).
  "Apache 2.0", // formatting variant of "Apache-2.0" (qrcode-terminal).
  "(Unlicense OR Apache-2.0)",
  "(MIT OR CC0-1.0)", // dual-license (type-fest); both halves already
  // appear individually in this allowlist.
  "(BSD-3-Clause OR GPL-2.0)", // dual (node-forge); we pick the
  // BSD-3-Clause half, so the dep is MIT-compatible for our purposes.
  "(BSD-2-Clause OR MIT OR Apache-2.0)", // triple-dual (rc); all halves
  // are already allowed individually.
  "(MPL-2.0 OR Apache-2.0)", // dual (dompurify, transitively via
  // posthog-js → @rrweb/*); both halves are already allowed individually.
  "Python-2.0", // permissive PSF licence (argparse); MIT-compatible.
  "CC-BY-4.0", // attribution-only (caniuse-lite data file, used by
  // browserslist). Attribution requirement is satisfied by listing the
  // package in THIRD_PARTY_LICENSES.md, which is this file.
  "OFL-1.1", // SIL Open Font License (fontsource self-hosted fonts);
  // permissive, attribution-only for font redistribution.
]);

function isDev(name) {
  if (WORKSPACE_EXACT.has(name) || DEV_EXACT.has(name)) return true;
  for (const p of DEV_PREFIXES) if (name.startsWith(p)) return true;
  return false;
}

function run() {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@sergeant/web",
      "--filter",
      "@sergeant/server",
      "licenses",
      "list",
      "--prod",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "pnpm licenses list failed\n");
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

function buildEntries() {
  const data = run();
  const rows = [];
  for (const [license, pkgs] of Object.entries(data)) {
    for (const pkg of pkgs) {
      if (!pkg.name || isDev(pkg.name)) continue;
      const versions =
        Array.isArray(pkg.versions) && pkg.versions.length
          ? pkg.versions
          : [pkg.version].filter(Boolean);
      for (const version of versions) {
        rows.push({
          name: pkg.name,
          version,
          license,
          homepage: pkg.homepage || "undefined",
        });
      }
    }
  }
  rows.sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const seen = new Set();
  const entries = [];
  for (const r of rows) {
    const key = `${r.name}@${r.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(r);
  }
  return entries;
}

function render(entries) {
  return (
    entries
      .map((e) => `- [${e.name}@${e.version}](${e.homepage}) - ${e.license}`)
      .join("\n") + "\n"
  );
}

function cmdGenerate() {
  const entries = buildEntries();
  writeFileSync(outPath, render(entries), "utf8");
  process.stdout.write(`Wrote ${entries.length} entries to ${outPath}\n`);
}

function cmdCheck() {
  const entries = buildEntries();
  const errors = [];

  for (const e of entries) {
    if (!ALLOWED_LICENSES.has(e.license)) {
      errors.push(
        `  disallowed license: ${e.name}@${e.version} — "${e.license}"`,
      );
    }
  }

  const expected = render(entries);
  let actual = "";
  let fileRead = false;
  try {
    actual = readFileSync(outPath, "utf8");
    fileRead = true;
  } catch {
    errors.push(
      `  ${outPath} is missing; run \`pnpm licenses:gen\` and commit the result`,
    );
  }
  // `fileRead` (not `actual`) is the guard: an existing-but-empty SBOM
  // file (e.g. truncated to 0 bytes) must still be flagged as stale —
  // Devin Review caught the earlier `if (actual && …)` version silently
  // passing in that case.
  if (fileRead && actual !== expected) {
    errors.push(
      `  ${outPath} is out-of-date; run \`pnpm licenses:gen\` and commit the diff`,
    );
  }

  if (errors.length > 0) {
    process.stderr.write(
      `License policy check failed (${entries.length} shipped packages):\n` +
        errors.join("\n") +
        "\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `License policy check OK: ${entries.length} shipped packages, all under allowed licenses, SBOM up-to-date.\n`,
  );
}

const mode = process.argv[2] || "generate";
if (mode === "--check" || mode === "check") {
  cmdCheck();
} else if (mode === "--generate" || mode === "generate") {
  cmdGenerate();
} else {
  process.stderr.write(
    `usage: node scripts/generate-licenses.mjs [generate|check]\n`,
  );
  process.exit(2);
}
