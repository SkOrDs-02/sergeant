#!/usr/bin/env node

/**
 * tsconfig-guard — blocks PRs where apps/{app}/tsconfig.json silently
 * overrides strict-family options inherited from
 * packages/config/tsconfig.base.json.
 *
 * Exit 0  → all apps conform (or are explicitly allowlisted).
 * Exit 1  → at least one drift detected without an active allowlist entry.
 *
 * No external dependencies — runs with bare Node >= 20.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const GUARDED_OPTIONS = [
  "strict",
  "noImplicitAny",
  "strictNullChecks",
  "noUncheckedIndexedAccess",
  "noImplicitReturns",
  "noFallthroughCasesInSwitch",
  "noUnusedLocals",
  "noUnusedParameters",
  "exactOptionalPropertyTypes",
  "noPropertyAccessFromIndexSignature",
];

const PACKAGE_ALIAS_MAP = {
  "@sergeant/config": join(ROOT, "packages/config"),
};

/* ------------------------------------------------------------------ */
/*  JSON helpers (strip comments + trailing commas)                    */
/* ------------------------------------------------------------------ */

function stripJsonComments(text) {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (text[i] === '"') inString = false;
      result += text[i++];
      continue;
    }
    if (text[i] === '"') {
      inString = true;
      result += text[i++];
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    result += text[i++];
  }
  return result;
}

function removeTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function readJsonc(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(removeTrailingCommas(stripJsonComments(raw)));
}

/* ------------------------------------------------------------------ */
/*  Resolve extends chain                                             */
/* ------------------------------------------------------------------ */

function resolveExtendsPath(extendsValue, fromDir) {
  for (const [alias, target] of Object.entries(PACKAGE_ALIAS_MAP)) {
    if (extendsValue.startsWith(alias + "/")) {
      const rest = extendsValue.slice(alias.length + 1);
      const candidate = resolve(target, rest);
      if (existsSync(candidate)) return candidate;
      if (!candidate.endsWith(".json") && existsSync(candidate + ".json"))
        return candidate + ".json";
      return candidate;
    }
    if (extendsValue === alias) {
      return resolve(target, "tsconfig.json");
    }
  }

  if (
    extendsValue.startsWith("./") ||
    extendsValue.startsWith("../") ||
    extendsValue.startsWith("/")
  ) {
    const resolved = resolve(fromDir, extendsValue);
    if (existsSync(resolved)) return resolved;
    if (!resolved.endsWith(".json") && existsSync(resolved + ".json"))
      return resolved + ".json";
    return resolved;
  }

  // node_modules resolution (e.g. "expo/tsconfig.base")
  try {
    const parts = extendsValue.split("/");
    const pkgName = extendsValue.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : parts[0];
    const rest = extendsValue.startsWith("@")
      ? parts.slice(2).join("/")
      : parts.slice(1).join("/");

    const pkgDir = resolve(ROOT, "node_modules", pkgName);
    if (existsSync(pkgDir)) {
      if (rest) {
        const candidate = resolve(
          pkgDir,
          rest.endsWith(".json") ? rest : rest + ".json",
        );
        if (existsSync(candidate)) return candidate;
      }
      const fallback = resolve(pkgDir, "tsconfig.json");
      if (existsSync(fallback)) return fallback;
    }
  } catch {
    /* ignore — not resolvable */
  }

  return null;
}

/**
 * Walk the `extends` chain starting from `tsconfigPath`.
 * Returns { configs: [...], paths: [...] } where configs[0] is the
 * deepest ancestor and configs[last] is the leaf (the app itself).
 */
function resolveChain(tsconfigPath) {
  const configs = [];
  const paths = [];
  const visited = new Set();
  let current = tsconfigPath;

  while (current && !visited.has(current)) {
    visited.add(current);
    if (!existsSync(current)) break;

    const config = readJsonc(current);
    configs.unshift(config);
    paths.unshift(current);

    if (!config.extends) break;
    current = resolveExtendsPath(config.extends, dirname(current));
  }

  return { configs, paths };
}

function computeEffective(chain) {
  const merged = {};
  for (const cfg of chain) {
    if (cfg.compilerOptions) {
      Object.assign(merged, cfg.compilerOptions);
    }
  }
  return merged;
}

/**
 * Returns true if any file in the resolved chain lives under
 * `packages/config/` (i.e. the app ultimately inherits from the
 * centralized config).
 */
function chainExtendsFromBase(chainPaths, rootDir) {
  const configDir = resolve(rootDir, "packages", "config");
  return chainPaths.some((p) => p.startsWith(configDir + "/"));
}

/* ------------------------------------------------------------------ */
/*  Allowlist                                                         */
/* ------------------------------------------------------------------ */

function loadAllowlist(guardDir) {
  const allowlistPath = join(guardDir || __dirname, "allowlist.json");
  if (!existsSync(allowlistPath)) return [];
  return readJsonc(allowlistPath);
}

function isAllowlisted(allowlist, appPath, option, value, now) {
  const currentDate = now || new Date();
  for (const entry of allowlist) {
    if (entry.path !== appPath || entry.option !== option) continue;

    if (entry.expires) {
      const expiry = new Date(entry.expires);
      if (expiry < currentDate) {
        return { expired: true, entry };
      }
    }

    if (entry.value === value) {
      return { allowed: true, entry };
    }
  }
  return { allowed: false };
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

export function run({ rootDir = ROOT, guardDir, now } = {}) {
  const appsDir = join(rootDir, "apps");
  const basePath = join(rootDir, "packages/config/tsconfig.base.json");

  if (!existsSync(basePath)) {
    console.error(`Base tsconfig not found: ${basePath}`);
    return 1;
  }

  const baseConfig = readJsonc(basePath);
  const baseOpts = baseConfig.compilerOptions || {};

  const allowlist = loadAllowlist(guardDir);

  const appDirs = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const violations = [];
  let checkedCount = 0;

  for (const app of appDirs) {
    const tsconfigPath = join(appsDir, app, "tsconfig.json");
    if (!existsSync(tsconfigPath)) continue;

    const { configs: chain, paths: chainPaths } = resolveChain(tsconfigPath);

    if (!chainExtendsFromBase(chainPaths, rootDir)) continue;

    checkedCount++;
    const effective = computeEffective(chain);
    const appRelPath = `apps/${app}`;

    for (const opt of GUARDED_OPTIONS) {
      const baseVal = baseOpts[opt];
      const effectiveVal = effective[opt];

      if (baseVal === undefined) continue;

      if (effectiveVal !== baseVal) {
        const check = isAllowlisted(
          allowlist,
          appRelPath,
          opt,
          effectiveVal,
          now,
        );

        if (check.expired) {
          violations.push(
            `${appRelPath}: "${opt}" is ${JSON.stringify(effectiveVal)} ` +
              `(base: ${JSON.stringify(baseVal)}) — allowlist entry EXPIRED ` +
              `on ${check.entry.expires} (reason: "${check.entry.reason}")`,
          );
        } else if (!check.allowed) {
          violations.push(
            `${appRelPath}: "${opt}" is ${JSON.stringify(effectiveVal)} ` +
              `(base: ${JSON.stringify(baseVal)}) — not allowlisted`,
          );
        }
      }
    }
  }

  if (checkedCount === 0) {
    console.log("tsconfig-guard: no apps extending base tsconfig found.");
    return 0;
  }

  if (violations.length > 0) {
    console.error("tsconfig-guard: DRIFT DETECTED\n");
    for (const v of violations) {
      console.error(`  ✗ ${v}`);
    }
    console.error(
      "\nTo allowlist a known override, add an entry to " +
        "tools/tsconfig-guard/allowlist.json.\n" +
        "See docs/playbooks/tsconfig-strict-guard.md for details.",
    );
    return 1;
  }

  console.log(
    `tsconfig-guard: ${checkedCount} app(s) checked — all conform to base.`,
  );
  return 0;
}

// CLI entry point
const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exit(run());
}
