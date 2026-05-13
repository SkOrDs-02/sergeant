#!/usr/bin/env node
// pnpm overrides drift guard — closes hardening card L1
// (docs/security/hardening/L1-uuid-override.md).
//
// `package.json` declares `pnpm.overrides` to force a specific major of
// transitive deps (e.g. `uuid`) so that we don't ship two copies in the
// production tree (audit + bundle-size + sub-tle behaviour drift). The
// override silently fails when:
//   1. The pin range is unsatisfiable (e.g. `>=99` resolves to nothing
//      and pnpm falls back to the dependency's own pin).
//   2. The override range still allows multiple majors to coexist
//      (e.g. `>=14` matches 14.x AND a future 15.x in the same lockfile).
//
// Both fail-modes are silent — the lockfile compiles, `pnpm install`
// succeeds, but two copies of the same package end up in the tree. This
// script is the active guard: for every override declared in
// `package.json -> pnpm.overrides` it runs `pnpm why <name> -r --json`
// and asserts that exactly one major is resolved across the workspace.
//
// Override key syntax: plain `pkg` or pnpm's selector form
// `pkg@<source-range>` (e.g. `protobufjs@>=8.0.0 <8.0.2`) which scopes
// the override to a specific sub-range of the dependency graph. For
// selector overrides the single-major check doesn't apply — instead we
// verify the override eliminated the targeted sub-range from the tree.
//
// Run from CI (`pnpm lint:pnpm-overrides`) and locally before opening a
// PR that changes `pnpm.overrides` or bumps a package whose major is
// pinned here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import semver from "semver";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(repoRoot, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const overrides = pkg.pnpm?.overrides ?? {};

const overrideNames = Object.keys(overrides);
if (overrideNames.length === 0) {
  console.log("[check-pnpm-overrides] no pnpm.overrides declared — skipping.");
  process.exit(0);
}

/** Walk the `pnpm why --json` output collecting versions of `target` we resolve. */
function collectVersions(node, target, found) {
  if (node == null || typeof node !== "object") return;
  for (const [name, info] of Object.entries(node)) {
    if (name === target && typeof info === "object" && info !== null) {
      const version = /** @type {{version?: string}} */ (info).version;
      if (typeof version === "string") found.add(version);
    }
    if (typeof info === "object" && info !== null) {
      const deps = /** @type {{dependencies?: unknown}} */ (info).dependencies;
      if (deps && typeof deps === "object") {
        collectVersions(deps, target, found);
      }
    }
  }
}

function majorOf(v) {
  const m = /^(\d+)\./.exec(v);
  return m ? m[1] : v;
}

/**
 * Parse override key into `{ name, sourceRange }`. Override keys may be
 * plain (`pkg`, `@scope/pkg`) or pnpm's selector form (`pkg@<range>`,
 * `@scope/pkg@<range>`) — see https://pnpm.io/package_json#pnpmoverrides.
 */
function parseOverrideKey(key) {
  const scoped = key.startsWith("@");
  const atIdx = scoped ? key.indexOf("@", 1) : key.indexOf("@");
  if (atIdx === -1) return { name: key, sourceRange: null };
  return { name: key.slice(0, atIdx), sourceRange: key.slice(atIdx + 1) };
}

const failures = [];
for (const key of overrideNames) {
  const range = overrides[key];
  const { name, sourceRange } = parseOverrideKey(key);
  let raw;
  try {
    raw = execFileSync("pnpm", ["why", name, "-r", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // `pnpm why` exits non-zero when no workspace package depends on
    // `name`. That means the override is dead — flag it explicitly so
    // the contributor can drop it.
    const stderr = /** @type {{stderr?: Buffer | string}} */ (err).stderr;
    const stderrStr = stderr ? String(stderr) : "";
    failures.push(
      `${key}: override "${range}" but no package depends on ${name} — drop the override.\n  pnpm output: ${stderrStr.trim().slice(0, 200)}`,
    );
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    failures.push(`${key}: failed to parse pnpm-why output: ${String(err)}`);
    continue;
  }
  const versions = new Set();
  for (const entry of Array.isArray(parsed) ? parsed : []) {
    if (entry && typeof entry === "object") {
      collectVersions(entry.dependencies, name, versions);
      collectVersions(entry.devDependencies, name, versions);
      collectVersions(
        /** @type {{optionalDependencies?: unknown}} */ (entry)
          .optionalDependencies,
        name,
        versions,
      );
    }
  }
  if (versions.size === 0) {
    failures.push(
      `${key}: override "${range}" resolved to NO version — the pin is unsatisfiable.`,
    );
    continue;
  }
  if (sourceRange) {
    // Selector form: the override only targets versions matching
    // `sourceRange`. Success means the override eliminated them.
    const stillMatching = Array.from(versions).filter((v) => {
      try {
        return semver.satisfies(v, sourceRange, { includePrerelease: true });
      } catch {
        return false;
      }
    });
    if (stillMatching.length > 0) {
      failures.push(
        `${key}: selector override "${range}" did NOT eliminate targeted versions; still in tree: ${stillMatching.sort().join(", ")}.`,
      );
      continue;
    }
    console.log(
      `[check-pnpm-overrides] ${key}: selector override "${range}" eliminated targeted sub-range; remaining: ${Array.from(versions).sort().join(", ")}. OK.`,
    );
    continue;
  }
  const majors = new Set(Array.from(versions, majorOf));
  if (majors.size > 1) {
    failures.push(
      `${key}: override "${range}" still allows multiple majors in the tree: ${Array.from(versions).sort().join(", ")}.`,
    );
    continue;
  }
  const onlyVersion = Array.from(versions)[0];
  console.log(
    `[check-pnpm-overrides] ${key}: override "${range}" → 1 major (${onlyVersion}). OK.`,
  );
}

if (failures.length > 0) {
  console.error("\n[check-pnpm-overrides] FAILED:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nFix: tighten the override range to a single major (e.g. "^14" not ">=14"),\nor drop the override if no package depends on the target. See\ndocs/security/hardening/L1-uuid-override.md for context.\n',
  );
  process.exit(1);
}

console.log(
  `\n[check-pnpm-overrides] OK — all ${overrideNames.length} override(s) validated.`,
);
