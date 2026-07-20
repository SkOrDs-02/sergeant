#!/usr/bin/env node
// Validates that .kilo/harness-versions.json is internally consistent and
// that key governance docs have not drifted to a stale version reference.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_ROOT = resolve(__dirname, "..");

/**
 * Read and parse harness-versions.json. Returns the parsed object or throws.
 */
export function readHarnessVersions(repoRoot = DEFAULT_ROOT) {
  const jsonPath = resolve(repoRoot, ".kilo/harness-versions.json");
  if (!existsSync(jsonPath)) {
    throw new Error(`Missing .kilo/harness-versions.json at ${jsonPath}`);
  }
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

/**
 * Extract an explicit version string from a doc using a pattern like
 * `поточна \`1.2.3\`` or `current: 1.2.3`.
 * Returns the version string if found, or null.
 */
function extractDocVersion(content) {
  // Ukrainian pattern used in harness-engineering-v1.md: поточна `x.y.z`
  const uaMatch = content.match(/поточна\s+`([0-9]+\.[0-9]+\.[0-9]+)`/);
  if (uaMatch) return uaMatch[1] ?? null;
  // English pattern: Current: `x.y.z` or current = `x.y.z`
  const enMatch = content.match(/[Cc]urrent[:\s=]+`([0-9]+\.[0-9]+\.[0-9]+)`/);
  if (enMatch) return enMatch[1] ?? null;
  return null;
}

/**
 * Check whether content contains any bare `0.1.7` that looks like a
 * live "current" claim rather than a historical changelog entry.
 * We treat the pattern `поточна \`0.1.7\`` or `current.*0.1.7` as stale.
 */
function containsStaleCurrentRef(content, staleVersion) {
  const escaped = staleVersion.replace(/\./g, "\\.");
  const uaPattern = new RegExp("поточна\\s+`" + escaped + "`");
  if (uaPattern.test(content)) return true;
  const enPattern = new RegExp("[Cc]urrent[:\\s=]+`?" + escaped + "`?");
  if (enPattern.test(content)) return true;
  return false;
}

/**
 * Core validation. Returns { ok, errors, warnings }.
 */
export function checkFreshness(repoRoot = DEFAULT_ROOT) {
  const errors = [];
  const warnings = [];

  let registry;
  try {
    registry = readHarnessVersions(repoRoot);
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
      warnings,
    };
  }

  // 1. schemaVersion must be 1
  if (registry.schemaVersion !== 1) {
    errors.push(
      `schemaVersion must be 1; found ${JSON.stringify(registry.schemaVersion)}.`,
    );
  }

  // 2. current must be present and non-empty
  const current = registry.current;
  if (typeof current !== "string" || current.trim() === "") {
    errors.push('harness-versions.json is missing a valid "current" field.');
    return { ok: false, errors, warnings };
  }

  // 3. current must exist in versions map
  if (!registry.versions || typeof registry.versions !== "object") {
    errors.push('"versions" map is missing from harness-versions.json.');
    return { ok: false, errors, warnings };
  }
  if (!(current in registry.versions)) {
    errors.push(
      `current version "${current}" is not present in the versions map.`,
    );
  }

  // 4. versions[current].releasedAt must be present
  const currentEntry = registry.versions[current];
  if (currentEntry && !currentEntry.releasedAt) {
    errors.push(
      `versions["${current}"].releasedAt is missing — add a release date.`,
    );
  }

  // 5. AGENTS.md § Harness version: must not hardcode a stale version string
  const agentsPath = resolve(repoRoot, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const agentsContent = readFileSync(agentsPath, "utf8");
    const docVersion = extractDocVersion(agentsContent);
    if (docVersion && docVersion !== current) {
      errors.push(
        `AGENTS.md claims current harness version is "${docVersion}" but .kilo/harness-versions.json says "${current}". Update the doc.`,
      );
    }
    // Specifically flag the historically problematic 0.1.7 ref
    if (containsStaleCurrentRef(agentsContent, "0.1.7")) {
      errors.push(
        'AGENTS.md contains a stale "0.1.7" current-version reference. Remove or update it.',
      );
    }
  }

  // 6. harness-engineering-v1.md: check for stale `поточна` version
  const v1DocPath = resolve(
    repoRoot,
    "docs/90-work/planning/harness-engineering-v1.md",
  );
  if (existsSync(v1DocPath)) {
    const v1Content = readFileSync(v1DocPath, "utf8");
    const docVersion = extractDocVersion(v1Content);
    if (docVersion && docVersion !== current) {
      warnings.push(
        "harness-engineering-v1.md has " +
          JSON.stringify("поточна `" + docVersion + "`") +
          " but current is " +
          JSON.stringify(current) +
          ". Consider updating the doc.",
      );
    }
    if (containsStaleCurrentRef(v1Content, "0.1.7")) {
      errors.push(
        'harness-engineering-v1.md contains a stale "0.1.7" current-version reference. Remove or update it.',
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const repoRoot = (() => {
    const idx = args.indexOf("--root");
    if (idx >= 0) return resolve(args[idx + 1] ?? "");
    const flag = args.find((a) => a.startsWith("--root="));
    if (flag) return resolve(flag.slice("--root=".length));
    return DEFAULT_ROOT;
  })();

  const result = checkFreshness(repoRoot);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (result.ok) {
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.warn(`[lint:harness-version-freshness] WARN ${w}`);
      }
    }
    console.log(
      "[lint:harness-version-freshness] OK — harness version is fresh.",
    );
    process.exit(0);
  }

  console.error("[lint:harness-version-freshness] FAIL:");
  for (const err of result.errors) {
    console.error(`  ✘ ${err}`);
  }
  for (const w of result.warnings) {
    console.warn(`  ⚠ ${w}`);
  }
  process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
